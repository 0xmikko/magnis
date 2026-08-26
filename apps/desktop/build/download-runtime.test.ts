import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  runtimeArtifactUrl,
  runtimeReferenceUrl,
  type RuntimeTarget,
} from "../../../packages/runtime-contracts/src/artifact";
import { downloadRuntime } from "./download-runtime";

const temporaryRoots: string[] = [];
const TARGET: RuntimeTarget = "x86_64-unknown-linux-gnu";
const VERSION = "0.1.0";

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// @test-id: tst_desktop_runtime_download_001
// @scenario: scn_desktop_artifact_004
// @invariant: INV-DTR-28
// @covers: downloadRuntime exact public reference and archive acquisition
// @deterministic: yes
test("tst_desktop_runtime_download_001 writes only the checksum-pinned ref and archive from their immutable release URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "magnis-runtime-download-"));
  temporaryRoots.push(root);
  const archive = new TextEncoder().encode("opaque runtime archive");
  const digest = sha256(archive);
  const reference = `${JSON.stringify({
    runtimeVersion: VERSION,
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    url: runtimeArtifactUrl(VERSION, TARGET),
    sha256: digest,
  }, null, 2)}\n`;
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url === runtimeReferenceUrl(VERSION, TARGET)) {
      return new Response(reference, { status: 200 });
    }
    if (url === runtimeArtifactUrl(VERSION, TARGET)) {
      return new Response(archive, { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };

  const result = await downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: join(root, "runtime-input"),
    fetch: fetchImpl,
  });

  expect(requested).toEqual([
    runtimeReferenceUrl(VERSION, TARGET),
    runtimeArtifactUrl(VERSION, TARGET),
  ]);
  expect(await readFile(result.referencePath, "utf8")).toBe(reference);
  expect(await readFile(result.archivePath)).toEqual(archive);
  expect(result.reference.sha256).toBe(digest);
});

// @test-id: tst_desktop_runtime_download_002
// @scenario: scn_desktop_artifact_004
// @invariant: INV-DTR-28
// @covers: downloadRuntime explicit digest refusal
// @deterministic: yes
test("tst_desktop_runtime_download_002 rejects a mismatched dispatched digest before requesting the archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "magnis-runtime-download-"));
  temporaryRoots.push(root);
  const archive = new TextEncoder().encode("opaque runtime archive");
  const actualDigest = sha256(archive);
  const reference = JSON.stringify({
    runtimeVersion: VERSION,
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    url: runtimeArtifactUrl(VERSION, TARGET),
    sha256: actualDigest,
  });
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    requested.push(String(input));
    return new Response(reference, { status: 200 });
  };

  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: "0".repeat(64),
    outputDirectory: join(root, "runtime-input"),
    fetch: fetchImpl,
  })).rejects.toThrow("explicit candidate input");

  expect(requested).toEqual([runtimeReferenceUrl(VERSION, TARGET)]);
});

// @test-id: tst_desktop_runtime_download_003
// @scenario: scn_desktop_artifact_004
// @invariant: INV-DTR-28
// @covers: downloadRuntime requested release identity refusal
// @deterministic: yes
test("tst_desktop_runtime_download_003 rejects a reference for another version or target before its archive is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "magnis-runtime-download-"));
  temporaryRoots.push(root);
  const digest = sha256(new TextEncoder().encode("opaque runtime archive"));
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    requested.push(String(input));
    return new Response(JSON.stringify({
      runtimeVersion: "0.1.1",
      protocolVersion: "magnis-runtime/v1",
      target: TARGET,
      url: runtimeArtifactUrl("0.1.1", TARGET),
      sha256: digest,
    }));
  };

  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: join(root, "runtime-input"),
    fetch: fetchImpl,
  })).rejects.toThrow("requested version and target");
  expect(requested).toEqual([runtimeReferenceUrl(VERSION, TARGET)]);
});

// @test-id: tst_desktop_runtime_download_004
// @scenario: scn_desktop_artifact_004
// @invariant: INV-DTR-28
// @covers: downloadRuntime archive byte verification
// @deterministic: yes
test("tst_desktop_runtime_download_004 rejects archive bytes that differ from an otherwise matching reference", async () => {
  const root = await mkdtemp(join(tmpdir(), "magnis-runtime-download-"));
  temporaryRoots.push(root);
  const expectedArchive = new TextEncoder().encode("expected opaque archive");
  const receivedArchive = new TextEncoder().encode("substituted archive");
  const digest = sha256(expectedArchive);
  const reference = JSON.stringify({
    runtimeVersion: VERSION,
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    url: runtimeArtifactUrl(VERSION, TARGET),
    sha256: digest,
  });
  const fetchImpl: typeof fetch = async (input) => new Response(
    String(input) === runtimeReferenceUrl(VERSION, TARGET) ? reference : receivedArchive,
  );

  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: join(root, "runtime-input"),
    fetch: fetchImpl,
  })).rejects.toThrow("archive SHA-256");
});

// @test-id: tst_desktop_runtime_download_005
// @scenario: scn_desktop_artifact_004
// @invariant: INV-DTR-28
// @covers: downloadRuntime canonical reference and output safety
// @deterministic: yes
test("tst_desktop_runtime_download_005 rejects non-canonical references and unsafe output destinations before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "magnis-runtime-download-"));
  temporaryRoots.push(root);
  const archive = new TextEncoder().encode("opaque runtime archive");
  const digest = sha256(archive);
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    runtimeVersion: VERSION,
    protocolVersion: "magnis-runtime/v1",
    target: TARGET,
    url: "https://example.invalid/runtime.tar.gz",
    sha256: digest,
  }));

  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: join(root, "noncanonical"),
    fetch: fetchImpl,
  })).rejects.toThrow();

  const nonEmpty = join(root, "non-empty");
  await mkdir(nonEmpty);
  await writeFile(join(nonEmpty, "keep"), "keep");
  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: nonEmpty,
    fetch: fetchImpl,
  })).rejects.toThrow("output must be empty");

  const realDirectory = join(root, "real-output");
  await mkdir(realDirectory);
  const linkedDirectory = join(root, "linked-output");
  await symlink(realDirectory, linkedDirectory);
  await expect(downloadRuntime({
    runtimeVersion: VERSION,
    target: TARGET,
    expectedSha256: digest,
    outputDirectory: linkedDirectory,
    fetch: fetchImpl,
  })).rejects.toThrow("real directory");
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
