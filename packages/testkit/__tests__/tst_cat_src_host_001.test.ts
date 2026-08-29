import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ProviderOperation, ProviderOutputSchema } from "@magnis/connector-sdk";
import {
  SOURCE_HOST_MAX_STDERR_BYTES,
  SourceHostDriver,
  testkitFixedSourceHostCommand,
} from "@magnis/testkit/host-driver";

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

async function buildFixtureArtifact(): Promise<{ root: string; entry: string }> {
  const root = await mkdtemp(join(tmpdir(), "magnis-v2-host-"));
  temporaryDirectories.push(root);
  const source = join(root, "main.ts");
  const entry = join(root, "dist", "main.js");
  const serverPath = fileURLToPath(new URL("../../connector-sdk/server.ts", import.meta.url));
  await Bun.write(
    source,
    `import { runSourceV2Server, defineSourceV2Operation } from ${JSON.stringify(serverPath)};
const object = { parse(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required"); return value; } };
await runSourceV2Server({
  instanceId: "fixture",
  operations: [
    defineSourceV2Operation({ name: "initialize", inputSchema: object, outputSchema: object, async handle() { return { protocol: "magnis.source/2" }; } }),
    defineSourceV2Operation({ name: "fixture.notify", inputSchema: object, outputSchema: object, async handle(input, context) { context.notify("fixture.event", input); return { ok: true }; } }),
    defineSourceV2Operation({ name: "fixture.wait", inputSchema: object, outputSchema: object, async handle(_input, context) { return await new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true })); } }),
    defineSourceV2Operation({ name: "fixture.malformed", inputSchema: object, outputSchema: object, async handle() { process.stdout.write("not-json\\n"); return { ok: true }; } }),
    defineSourceV2Operation({ name: "fixture.oversized", inputSchema: object, outputSchema: object, async handle() { process.stdout.write("x".repeat(4 * 1024 * 1024 + 1)); return await new Promise(() => undefined); } }),
    defineSourceV2Operation({ name: "fixture.cleanExit", inputSchema: object, outputSchema: object, async handle() { process.exit(0); } }),
    defineSourceV2Operation({ name: "fixture.stderrFlood", inputSchema: object, outputSchema: object, async handle() { process.stderr.write("e".repeat(${String(128 * 1024)})); process.exit(24); } }),
    defineSourceV2Operation({ name: "fixture.crash", inputSchema: object, outputSchema: object, async handle() { process.exit(23); } }),
  ],
});\n`,
  );
  const built = await Bun.build({ entrypoints: [source], outdir: join(root, "dist"), target: "bun" });
  if (!built.success) throw new Error(`fixture build failed: ${built.logs.map(String).join("\n")}`);
  return { root, entry };
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
    await expect(driver.request(operation("fixture.notify"), { sequence: 7 })).resolves.toEqual({ ok: true });
    await expect(driver.nextNotification()).resolves.toMatchObject({
      method: "fixture.event",
      params: { sequence: 7 },
    });

    const controller = new AbortController();
    const cancelled = driver.request(operation("fixture.wait"), {}, { signal: controller.signal });
    controller.abort("owner cancelled");
    await expect(cancelled).rejects.toThrow("owner cancelled");
    expect(driver.pendingRequestCount).toBe(0);
    await driver.close();
    expect(driver.isJoined).toBe(true);

    const timeoutDriver = await SourceHostDriver.open({ artifact, command: testkitFixedSourceHostCommand(), timeoutMs: 1_000 });
    await expect(timeoutDriver.request(operation("fixture.wait"), {}, { deadlineMs: 10 })).rejects.toThrow(
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

    await expect(
      SourceHostDriver.open({
        artifact: { root: artifact.root, entry: join(artifact.root, "dist", "missing.js") },
        command: testkitFixedSourceHostCommand(),
      }),
    ).rejects.toThrow("Source artifact entry does not exist");
  });
});
