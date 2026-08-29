import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ProviderOperation, ProviderOutputSchema } from "@magnis/connector-sdk";
import {
  SOURCE_HOST_MAX_STDERR_BYTES,
  SourceHostDriver,
  SourceHostProtocolError,
  testkitFixedSourceHostCommand,
} from "@magnis/testkit/host-driver";

import type { SourceV2DeadlineScheduler } from "../../connector-sdk/server";
import { hashStagedPackage } from "../../../scripts/certify-sources";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const recordSchema: ProviderOutputSchema<Readonly<Record<string, unknown>>> = {
  parse(value: unknown): Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("result must be an object");
    }
    return value as Readonly<Record<string, unknown>>;
  },
};

function operation(name: string): ProviderOperation<Readonly<Record<string, unknown>>> {
  return { name, outputSchema: recordSchema };
}

function manualDeadlineScheduler(): {
  readonly scheduler: SourceV2DeadlineScheduler;
  nextDelay(): number | undefined;
  expireNext(): void;
} {
  const deadlines: Array<{
    active: boolean;
    readonly delayMs: number;
    readonly onDeadline: () => void;
  }> = [];
  return {
    scheduler: {
      schedule(delayMs, onDeadline): () => void {
        const deadline = { active: true, delayMs, onDeadline };
        deadlines.push(deadline);
        return (): void => {
          deadline.active = false;
        };
      },
    },
    nextDelay(): number | undefined {
      return deadlines.find(({ active }) => active)?.delayMs;
    },
    expireNext(): void {
      const deadline = deadlines.find(({ active }) => active);
      if (deadline === undefined) throw new Error("no active deadline");
      deadline.active = false;
      deadline.onDeadline();
    },
  };
}

async function buildFixtureArtifact(): Promise<{ root: string; entry: string; packageHash: string }> {
  const root = await mkdtemp(join(tmpdir(), "magnis-v2-host-"));
  temporaryDirectories.push(root);
  const source = join(root, "main.ts");
  const entry = join(root, "build", "dist", "main.js");
  const serverPath = fileURLToPath(new URL("../../connector-sdk/server.ts", import.meta.url));
  await Bun.write(
    source,
    `import { writeFileSync } from "node:fs";
import { runSourceV2Server, defineSourceV2Operation } from ${JSON.stringify(serverPath)};
const object = { parse(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required"); return value; } };
await runSourceV2Server({
  instanceId: "fixture",
  operations: [
    defineSourceV2Operation({ name: "initialize", inputSchema: object, outputSchema: object, async handle() { return { protocol: "magnis.source/2" }; } }),
    defineSourceV2Operation({ name: "fixture.cwd", inputSchema: object, outputSchema: object, async handle() { return { cwd: process.cwd() }; } }),
    defineSourceV2Operation({ name: "fixture.notify", inputSchema: object, outputSchema: object, async handle(input, context) { context.notify("fixture.event", input); return { ok: true }; } }),
    defineSourceV2Operation({ name: "fixture.wait", inputSchema: object, outputSchema: object, async handle(_input, context) { return await new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true })); } }),
    defineSourceV2Operation({ name: "fixture.cancelAware", inputSchema: object, outputSchema: object, async handle(_input, context) { return await new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => { context.notify("fixture.cancelled", { observed: true }); reject(context.signal.reason); }, { once: true })); } }),
    defineSourceV2Operation({ name: "fixture.closeAware", inputSchema: object, outputSchema: object, async handle(_input, context) { return await new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => { const marker = process.env.FIXTURE_CANCEL_MARKER; if (!marker) throw new Error("missing cancellation marker"); writeFileSync(marker, "cancelled"); reject(context.signal.reason); }, { once: true })); } }),
    defineSourceV2Operation({ name: "fixture.wrongId", inputSchema: object, outputSchema: object, async handle() { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 999, result: { ok: true } }) + "\\n"); return await new Promise(() => undefined); } }),
    defineSourceV2Operation({ name: "fixture.duplicate", inputSchema: object, outputSchema: object, async handle() { const reply = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }) + "\\n"; process.stdout.write(reply + reply); return await new Promise(() => undefined); } }),
    defineSourceV2Operation({ name: "fixture.notificationOverflow", inputSchema: object, outputSchema: object, async handle(_input, context) { context.notify("fixture.event", { sequence: 1 }); context.notify("fixture.event", { sequence: 2 }); context.notify("fixture.event", { sequence: 3 }); return { ok: true }; } }),
    defineSourceV2Operation({ name: "fixture.malformed", inputSchema: object, outputSchema: object, async handle() { process.stdout.write("not-json\\n"); return { ok: true }; } }),
    defineSourceV2Operation({ name: "fixture.oversized", inputSchema: object, outputSchema: object, async handle() { process.stdout.write("x".repeat(4 * 1024 * 1024 + 1)); return await new Promise(() => undefined); } }),
    defineSourceV2Operation({ name: "fixture.whitespaceOversized", inputSchema: object, outputSchema: object, async handle() { process.stdout.write(" ".repeat(4 * 1024 * 1024 + 1) + "\\n"); return await new Promise(() => undefined); } }),
    defineSourceV2Operation({ name: "fixture.cleanExit", inputSchema: object, outputSchema: object, async handle() { process.exit(0); } }),
    defineSourceV2Operation({ name: "fixture.stderrFlood", inputSchema: object, outputSchema: object, async handle() { process.stderr.write("e".repeat(${String(128 * 1024)})); process.exit(24); } }),
    defineSourceV2Operation({ name: "fixture.crash", inputSchema: object, outputSchema: object, async handle() { process.exit(23); } }),
  ],
});\n`,
  );
  const built = await Bun.build({ entrypoints: [source], outdir: join(root, "build", "dist"), target: "bun" });
  if (!built.success) throw new Error(`fixture build failed: ${built.logs.map(String).join("\n")}`);
  return { root, entry, packageHash: hashStagedPackage(root) };
}

/**
 * @test-id: tst_cat_src_host_001
 * @scenario: scn_cat_src_host_001
 * @covers: packages/testkit/host-driver.ts
 * @deterministic: yes
 * @fixtures: temporary built strict-v2 artifact with deterministic fault operations
 *
 * Test environment: a built Source artifact behind the fixed source-host process
 * Clients: SourceHostDriver
 * Mocks: none
 * Data: inline deterministic control operations
 */
describe("real fixed Source host driver", () => {
  it("tst_cat_src_host_001 installs the exact artifact and joins initialize, notification, cancellation, malformed, crash, timeout, and close paths", async () => {
    const artifact = await buildFixtureArtifact();
    const driver = await SourceHostDriver.open({
      artifact,
      command: testkitFixedSourceHostCommand(),
      timeoutMs: 1_000,
    });

    await expect(driver.request(operation("initialize"), {})).resolves.toEqual({ protocol: "magnis.source/2" });
    await expect(driver.request(operation("fixture.cwd"), {})).resolves.toEqual({ cwd: artifact.root });
    await expect(driver.request(operation("fixture.notify"), { sequence: 7 })).resolves.toEqual({ ok: true });
    await expect(driver.nextNotification()).resolves.toMatchObject({
      method: "fixture.event",
      params: { sequence: 7 },
    });

    const controller = new AbortController();
    const cancelled = driver.request(operation("fixture.cancelAware"), {}, { signal: controller.signal });
    controller.abort("owner cancelled");
    await expect(cancelled).rejects.toThrow("owner cancelled");
    await expect(driver.nextNotification()).resolves.toMatchObject({
      method: "fixture.cancelled",
      params: { observed: true },
    });
    expect(driver.pendingRequestCount).toBe(0);
    await expect(driver.request(operation("initialize"), {})).resolves.toEqual({ protocol: "magnis.source/2" });
    expect(driver.pendingCancellationCount).toBe(0);
    await driver.close();
    expect(driver.isJoined).toBe(true);

    const requestDeadlines = manualDeadlineScheduler();
    const timeoutDriver = await SourceHostDriver.open({
      artifact,
      command: testkitFixedSourceHostCommand(),
      timeoutMs: 1_000,
      deadlineScheduler: requestDeadlines.scheduler,
    });
    const timedOutRequest = timeoutDriver.request(operation("fixture.wait"), {}, { deadlineMs: 10 });
    expect(requestDeadlines.nextDelay()).toBe(10);
    requestDeadlines.expireNext();
    await expect(timedOutRequest).rejects.toThrow(
      "timed out after 10ms",
    );
    expect(timeoutDriver.pendingRequestCount).toBe(0);
    await timeoutDriver.close();

    const malformedDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(malformedDriver.request(operation("fixture.malformed"), {})).rejects.toThrow(
      "Source host emitted a malformed frame",
    );
    await malformedDriver.close();
    expect(malformedDriver.isJoined).toBe(true);

    const oversizedDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(oversizedDriver.request(operation("fixture.oversized"), {})).rejects.toThrow(
      "Source host frame exceeds 4194304 bytes before newline",
    );
    await oversizedDriver.close();

    const whitespaceDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(
      whitespaceDriver.request(operation("fixture.whitespaceOversized"), {}, { deadlineMs: 100 }),
    ).rejects.toThrow("Source host frame exceeds 4194304 bytes before newline");
    await whitespaceDriver.close();

    const wrongIdDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    const wrongIdError = await wrongIdDriver.request(operation("fixture.wrongId"), {}).catch((error: unknown) => error);
    expect(wrongIdError).toBeInstanceOf(SourceHostProtocolError);
    expect((wrongIdError as SourceHostProtocolError).kind).toBe("unexpected_response_id");
    expect(wrongIdDriver.pendingRequestCount).toBe(0);
    await wrongIdDriver.close();

    const duplicateDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(duplicateDriver.request(operation("fixture.duplicate"), {})).resolves.toEqual({ ok: true });
    await expect(duplicateDriver.request(operation("initialize"), {})).rejects.toMatchObject({
      name: "SourceHostProtocolError",
      kind: "unexpected_response_id",
    });
    expect(duplicateDriver.pendingRequestCount).toBe(0);
    await duplicateDriver.close();

    const cleanExitDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(cleanExitDriver.request(operation("fixture.cleanExit"), {})).rejects.toThrow("Source host exited 0");
    await cleanExitDriver.close();

    const crashDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(crashDriver.request(operation("fixture.crash"), {})).rejects.toThrow("Source host exited 23");
    await crashDriver.close();
    expect(crashDriver.isJoined).toBe(true);

    const stderrDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    const stderrFailure = stderrDriver.request(operation("fixture.stderrFlood"), {}).catch((error: unknown) => error);
    const stderrError = await stderrFailure;
    expect(stderrError).toBeInstanceOf(Error);
    expect((stderrError as Error).message).toContain("stderr truncated");
    expect((stderrError as Error).message.length).toBeLessThanOrEqual(SOURCE_HOST_MAX_STDERR_BYTES + 256);
    await stderrDriver.close();

    const notificationDeadlines = manualDeadlineScheduler();
    const notificationTimeoutDriver = await SourceHostDriver.open({
      artifact,
      command: testkitFixedSourceHostCommand(),
      timeoutMs: 1_000,
      deadlineScheduler: notificationDeadlines.scheduler,
    });
    const timedOutNotification = notificationTimeoutDriver.nextNotification(10);
    expect(notificationDeadlines.nextDelay()).toBe(10);
    notificationDeadlines.expireNext();
    await expect(timedOutNotification).rejects.toThrow(
      "Source host notification timed out after 10ms",
    );
    expect(notificationTimeoutDriver.pendingNotificationWaiterCount).toBe(0);
    await notificationTimeoutDriver.close();

    const overflowDriver = await SourceHostDriver.open({
      artifact,
      command: testkitFixedSourceHostCommand(),
      timeoutMs: 1_000,
      maxQueuedNotifications: 2,
    });
    await expect(overflowDriver.request(operation("fixture.notificationOverflow"), {})).rejects.toThrow(
      "Source host notification queue exceeds 2",
    );
    expect(overflowDriver.pendingRequestCount).toBe(0);
    await overflowDriver.close();

    const closeDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    const waitingNotification = closeDriver.nextNotification();
    expect(closeDriver.pendingNotificationWaiterCount).toBe(1);
    const waitingOutcome = waitingNotification.then(
      () => new Error("notification unexpectedly resolved"),
      (error: unknown) => error,
    );
    await closeDriver.close();
    const closeError = await waitingOutcome;
    expect(closeError).toBeInstanceOf(Error);
    expect((closeError as Error).message).toBe("Source host driver closed");
    expect(closeDriver.pendingNotificationWaiterCount).toBe(0);
    await expect(closeDriver.nextNotification()).rejects.toThrow("Source host driver is closed");

    const markerRoot = await mkdtemp(join(tmpdir(), "magnis-v2-host-marker-"));
    temporaryDirectories.push(markerRoot);
    const marker = join(markerRoot, "cancelled.txt");
    const activeCloseDriver = await SourceHostDriver.open({
      artifact,
      command: testkitFixedSourceHostCommand(),
      timeoutMs: 1_000,
      environment: { FIXTURE_CANCEL_MARKER: marker },
    });
    const activeRequest = activeCloseDriver.request(operation("fixture.closeAware"), {});
    expect(activeCloseDriver.pendingRequestCount).toBe(1);
    const activeOutcome = activeRequest.catch((error: unknown) => error);
    await activeCloseDriver.close();
    await expect(activeOutcome).resolves.toBeInstanceOf(Error);
    expect((await stat(marker)).isFile()).toBe(true);
    expect(activeCloseDriver.pendingRequestCount).toBe(0);
    expect(activeCloseDriver.pendingCancellationCount).toBe(0);
    expect(activeCloseDriver.pendingNotificationWaiterCount).toBe(0);
    expect(activeCloseDriver.isJoined).toBe(true);

    await expect(
      SourceHostDriver.open({
        artifact: {
          root: artifact.root,
          entry: join(artifact.root, "dist", "missing.js"),
          packageHash: artifact.packageHash,
        },
        command: testkitFixedSourceHostCommand(),
      }),
    ).rejects.toThrow("Source artifact entry does not exist");

    const mismatchedArtifact = { ...artifact, packageHash: `sha256:${"0".repeat(64)}` };
    const mismatchOutcome = await SourceHostDriver.open({
      artifact: mismatchedArtifact,
      command: testkitFixedSourceHostCommand(),
    }).then(
      async (opened) => {
        await opened.close();
        return "opened";
      },
      (error: unknown) => (error instanceof Error ? error.message : "non-error"),
    );
    expect(mismatchOutcome).toContain("Source artifact package hash does not match");

    await expect(
      SourceHostDriver.open({
        artifact: { ...artifact, entry: join(artifact.root, "build") },
        command: testkitFixedSourceHostCommand(),
      }),
    ).rejects.toThrow("Source artifact entry must be a regular file");

    const symlinkRoot = await mkdtemp(join(tmpdir(), "magnis-v2-host-symlink-"));
    temporaryDirectories.push(symlinkRoot);
    await mkdir(join(symlinkRoot, "dist"));
    const escapedEntry = join(symlinkRoot, "dist", "main.js");
    await symlink(artifact.entry, escapedEntry);
    const symlinkOutcome = await SourceHostDriver.open({
      artifact: { root: symlinkRoot, entry: escapedEntry, packageHash: artifact.packageHash },
      command: testkitFixedSourceHostCommand(),
    }).then(
      async (opened) => {
        await opened.close();
        return "opened";
      },
      (error: unknown) => (error instanceof Error ? error.message : "non-error"),
    );
    expect(symlinkOutcome).toContain("outside the exact artifact root");

    await expect(
      SourceHostDriver.open({
        artifact: {
          root: artifact.root,
          entry: join(artifact.root, "..", "outside.js"),
          packageHash: artifact.packageHash,
        },
        command: testkitFixedSourceHostCommand(),
      }),
    ).rejects.toThrow("inside the exact artifact root");
  });
});
