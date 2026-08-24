import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  runtimeArtifactUrl,
  type RuntimeTarget,
} from "../../../packages/runtime-contracts/src/artifact";
import { stageRuntime } from "./stage-runtime";

const temporaryRoots: string[] = [];
const TARGET: RuntimeTarget = "x86_64-unknown-linux-gnu";

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// @test-id: tst_desktop_runtime_stage_001
// @invariant: INV-DTR-26
// @covers: exact runtime archive staging for Tauri
// @deterministic: yes
test("tst_desktop_runtime_stage_001 stages one checksum-pinned public runtime without private sources", async () => {
  const fixture = await createRuntimeFixture();
  const outputDirectory = join(fixture.root, "binaries");

  const identity = await stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory,
  });

  expect(identity).toEqual({
    runtimeVersion: "0.1.0",
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
  });
  expect(await readFile(join(outputDirectory, `bin/magnis-server-${TARGET}`), "utf8")).toBe("server");
  expect(await readFile(join(outputDirectory, "runtime/web/index.html"), "utf8")).toBe("<main>Magnis</main>");
  expect(await readFile(join(outputDirectory, "runtime/migrations/0001.sql"), "utf8")).toBe("select 1;\n");
});

// @test-id: tst_desktop_runtime_stage_002
// @invariant: INV-DTR-26
// @covers: artifact staging refusal before output replacement
// @deterministic: yes
test("tst_desktop_runtime_stage_002 rejects a mismatched checksum without replacing the existing staged runtime", async () => {
  const fixture = await createRuntimeFixture();
  const outputDirectory = join(fixture.root, "binaries");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "keep.txt"), "do not replace");
  const reference = JSON.parse(await readFile(fixture.referencePath, "utf8")) as Record<string, unknown>;
  reference.sha256 = "0".repeat(64);
  await writeFile(fixture.referencePath, `${JSON.stringify(reference)}\n`);

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory,
  })).rejects.toThrow("SHA-256");

  expect(await readFile(join(outputDirectory, "keep.txt"), "utf8")).toBe("do not replace");
});

async function createRuntimeFixture(): Promise<{
  readonly root: string;
  readonly archivePath: string;
  readonly referencePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "magnis-desktop-stage-"));
  temporaryRoots.push(root);
  const layout = join(root, "layout");
  const files = {
    [`bin/magnis-server-${TARGET}`]: "server",
    "runtime/data/seed.json": "{}\n",
    "runtime/migrations/0001.sql": "select 1;\n",
    "runtime/web/index.html": "<main>Magnis</main>",
    "THIRD_PARTY_NOTICES.txt": "fixture notice\n",
  };
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(layout, path);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, contents);
  }));

  const manifest = {
    schemaVersion: 1,
    runtimeVersion: "0.1.0",
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    executable: `bin/magnis-server-${TARGET}`,
    runtimeRoot: "runtime",
    webRoot: "runtime/web",
    migrationsDigest: sha256(files["runtime/migrations/0001.sql"]),
    files: Object.fromEntries(Object.entries(files).map(([path, contents]) => [path, sha256(contents)])),
  };
  await writeFile(join(layout, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const archivePath = join(root, "magnis-runtime-v0.1.0-x86_64-unknown-linux-gnu.tar.gz");
  const archive = Bun.spawn(["tar", "-C", layout, "-czf", archivePath, "manifest.json", "bin", "runtime", "THIRD_PARTY_NOTICES.txt"]);
  expect(await archive.exited).toBe(0);
  const referencePath = join(root, "runtime-ref.json");
  await writeFile(referencePath, `${JSON.stringify({
    runtimeVersion: "0.1.0",
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    url: runtimeArtifactUrl("0.1.0", TARGET),
    sha256: sha256(await readFile(archivePath)),
  }, null, 2)}\n`);

  return { root, archivePath, referencePath };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
