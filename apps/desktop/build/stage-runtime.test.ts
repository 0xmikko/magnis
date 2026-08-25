import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

// @test-id: tst_desktop_runtime_stage_003
// @scenario: scn_desktop_artifact_003
// @invariant: INV-DTR-27
// @covers: stageRuntime archive source-leak policy
// @deterministic: yes
test("tst_desktop_runtime_stage_003 rejects a source map before extracting or replacing a staged runtime", async () => {
  const fixture = await createRuntimeFixture({
    "runtime/web/app.js.map": "{\"version\":3}\n",
  });
  const outputDirectory = join(fixture.root, "binaries");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "keep.txt"), "do not replace");

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory,
  })).rejects.toThrow("source map");

  expect(await readFile(join(outputDirectory, "keep.txt"), "utf8")).toBe("do not replace");
});

// @test-id: tst_desktop_runtime_stage_004
// @scenario: scn_desktop_artifact_003
// @invariant: INV-DTR-27
// @covers: stageRuntime third-party notice policy
// @deterministic: yes
test("tst_desktop_runtime_stage_004 rejects an archive without offline third-party notices", async () => {
  const fixture = await createRuntimeFixture({}, false);

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory: join(fixture.root, "binaries"),
  })).rejects.toThrow("THIRD_PARTY_NOTICES");
});

// @test-id: tst_desktop_runtime_stage_005
// @scenario: scn_desktop_artifact_003
// @invariant: INV-DTR-27
// @covers: stageRuntime archive entry-type policy
// @deterministic: yes
test("tst_desktop_runtime_stage_005 rejects a symlink before archive extraction", async () => {
  const fixture = await createRuntimeFixture({}, true, {
    "runtime/web/untrusted-link": "index.html",
  });

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory: join(fixture.root, "binaries"),
  })).rejects.toThrow("archive links are forbidden before extraction");
});

// @test-id: tst_desktop_runtime_stage_006
// @scenario: scn_desktop_artifact_003
// @invariant: INV-DTR-27
// @covers: stageRuntime opaque payload policy
// @deterministic: yes
test("tst_desktop_runtime_stage_006 rejects a native source file before extraction", async () => {
  const fixture = await createRuntimeFixture({
    "runtime/data/private-backend.rs": "fn secret() {}\n",
  });

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory: join(fixture.root, "binaries"),
  })).rejects.toThrow("source file");
});

// @test-id: tst_desktop_runtime_stage_007
// @scenario: scn_desktop_artifact_003
// @invariant: INV-DTR-27
// @covers: stageRuntime web source policy
// @deterministic: yes
test("tst_desktop_runtime_stage_007 rejects TypeScript source even below the web payload root", async () => {
  const fixture = await createRuntimeFixture({
    "runtime/web/private.ts": "export const privateRuntime = true;\n",
  });

  await expect(stageRuntime({
    archivePath: fixture.archivePath,
    referencePath: fixture.referencePath,
    target: TARGET,
    outputDirectory: join(fixture.root, "binaries"),
  })).rejects.toThrow("source file");
});

async function createRuntimeFixture(
  additionalFiles: Readonly<Record<string, string>> = {},
  includeThirdPartyNotices = true,
  symlinks: Readonly<Record<string, string>> = {},
): Promise<{
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
    ...(includeThirdPartyNotices ? { "THIRD_PARTY_NOTICES.txt": "fixture notice\n" } : {}),
    ...additionalFiles,
    ...Object.fromEntries(Object.keys(symlinks).map((path) => [path, ""])),
  };
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(layout, path);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, contents);
  }));
  await Promise.all(Object.entries(symlinks).map(async ([path, target]) => {
    const destination = join(layout, path);
    await rm(destination);
    await symlink(target, destination);
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
  const archive = Bun.spawn([
    "tar",
    "-C",
    layout,
    "-czf",
    archivePath,
    "manifest.json",
    "bin",
    "runtime",
    ...(includeThirdPartyNotices ? ["THIRD_PARTY_NOTICES.txt"] : []),
  ]);
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
