/**
 * @test-id tst_desktop_artifact_pin_001
 * @scenario scn_desktop_artifact_002
 * @covers packages/runtime-contracts/src/artifact.ts
 * @deterministic yes
 * @fixtures test/fixtures/{accepted,rejected}
 */
import { expect, test } from "bun:test";
import {
  parseRuntimeArtifactManifest,
  parseRuntimeArtifactRef,
  validateRuntimeArtifactCompatibility,
} from "../src/artifact";

const fixtureRoot = `${import.meta.dir}/fixtures`;

async function readFixture(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(`${fixtureRoot}/${path}`).text()) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("fixture must be an object");
  }
  return value as Record<string, unknown>;
}

test("tst_desktop_artifact_pin_001 accepts one complete immutable artifact identity", async () => {
  const ref = parseRuntimeArtifactRef(await readFixture("accepted/runtime-ref.json"));
  const manifest = parseRuntimeArtifactManifest(await readFixture("accepted/manifest.json"));

  expect(validateRuntimeArtifactCompatibility(ref, manifest)).toEqual({
    runtimeVersion: "0.1.0",
    protocolVersion: "magnis-runtime/v1",
    target: "x86_64-unknown-linux-gnu",
  });
});

test("tst_desktop_artifact_pin_002 rejects every omitted immutable identity field", async () => {
  const accepted = asRecord(await readFixture("accepted/runtime-ref.json"));
  const missingDigest = await readFixture("rejected/missing-sha256-runtime-ref.json");
  const requiredFields = ["runtimeVersion", "protocolVersion", "target", "url", "sha256"];

  for (const field of requiredFields) {
    const incomplete = { ...accepted };
    delete incomplete[field];
    expect(() => parseRuntimeArtifactRef(incomplete)).toThrow(field);
  }

  expect(() => parseRuntimeArtifactRef(missingDigest)).toThrow("sha256");
});

test("tst_desktop_artifact_pin_003 rejects a target that differs from the selected runtime", async () => {
  const ref = parseRuntimeArtifactRef(await readFixture("accepted/runtime-ref.json"));
  const manifest = parseRuntimeArtifactManifest(await readFixture("rejected/wrong-target-manifest.json"));

  expect(() => validateRuntimeArtifactCompatibility(ref, manifest)).toThrow("target");
});

test("tst_desktop_artifact_pin_004 rejects a floating or substituted release URL", async () => {
  const accepted = asRecord(await readFixture("accepted/runtime-ref.json"));
  const floating = {
    ...accepted,
    url: "https://github.com/0xmikko/magnis/releases/latest/download/magnis-runtime.tar.gz",
  };

  expect(() => parseRuntimeArtifactRef(floating)).toThrow("url");
});

test("tst_desktop_artifact_pin_005 rejects unsafe archive paths before extraction", async () => {
  await expect(async () => parseRuntimeArtifactManifest(await readFixture("rejected/unsafe-path-manifest.json"))).toThrow(
    "unsafe artifact path",
  );
});
