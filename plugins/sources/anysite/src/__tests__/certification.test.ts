import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { collectSourceHostEvidence } from "../../../../../packages/testkit/host-driver";
import {
  decodeSourceCertificationReceipt,
  sourceArtifactPackageHash,
} from "../../../../../packages/testkit/receipt";
import { stageBundledSourcePackage } from "../../../../../scripts/build-catalog-index";
import { discoverSourceReleaseManifests } from "../../../../../scripts/certify-sources";

const repoRoot = join(import.meta.dir, "../../../../..");
const temporaryDirectories: string[] = [];

function stageExactAnysiteArtifact(): {
  readonly root: string;
  readonly fixtureRoot: string;
  readonly packageHash: string;
  readonly callableOperations: readonly string[];
  readonly receipt: ReturnType<typeof decodeSourceCertificationReceipt>;
} {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "magnis-anysite-cert-"));
  temporaryDirectories.push(temporaryRoot);
  const artifactRoot = join(temporaryRoot, "artifact");
  const release = discoverSourceReleaseManifests(join(repoRoot, "plugins", "sources"))
    .find((candidate) => candidate.id === "anysite");
  if (release === undefined || release.disposition !== "admissible") {
    throw new Error("anysite must be an admissible Source release");
  }
  stageBundledSourcePackage(release, artifactRoot);
  const packageHash = sourceArtifactPackageHash(artifactRoot);
  const receipt = decodeSourceCertificationReceipt(
    readFileSync(join(repoRoot, "dist", "receipts", `${packageHash}.json`), "utf8"),
    { packageHash },
  );
  return {
    root: artifactRoot,
    fixtureRoot: temporaryRoot,
    packageHash,
    callableOperations: release.declaration.callableOperations,
    receipt,
  };
}

function operationResult(
  evidence: Awaited<ReturnType<typeof collectSourceHostEvidence>>,
  operation: string,
): Record<string, unknown> {
  const reply = evidence.operationProbes[operation];
  if (reply === undefined || reply.error !== undefined) {
    throw new Error(`${operation} did not return a successful result`);
  }
  if (reply.result === null || typeof reply.result !== "object" || Array.isArray(reply.result)) {
    throw new Error(`${operation} result is not an object`);
  }
  return reply.result as Record<string, unknown>;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Anysite exact-artifact certification", () => {
  /**
   * @test-id: tst_anysite_cert_001
   * @scenario: scn_anysite_v1_exact_artifact_001
   * @covers: plugins/sources/anysite/src/main.ts::runConnector
   * @covers: plugins/sources/anysite/src/probe.ts::probeLinkedInAuth
   * @covers: plugins/sources/anysite/src/surfaces/linkedin/fetch.ts::fetchLinkedIn
   * @deterministic: yes
   * @fixtures: temporary captured Anysite LinkedIn provider payload
   *
   * Test environment: dependency-closed staged Anysite artifact over real stdio.
   * Clients: @magnis/testkit Source host evidence driver.
   * Mocks: captured provider transport selected only by ANYSITE_FIXTURE_FILE.
   * Data: one tracked LinkedIn profile, one post and numeric cursor 41.
   */
  test("tst_anysite_cert_001 exact v1 artifact proves shared-key Add/Repair and numeric progress", async () => {
    const artifact = stageExactAnysiteArtifact();
    const fixtureFile = join(artifact.fixtureRoot, "anysite-certification-fixture.json");
    writeFileSync(
      fixtureFile,
      JSON.stringify({
        probe_profile: {
          name: "LinkedIn",
          urn: "urn:li:fsd_profile:probe",
          headline: "Provider probe",
          follower_count: 1,
          url: "https://linkedin.com/in/probe",
          image: null,
        },
        profiles_by_handle: {
          anndoe: {
            name: "Ann Doe",
            urn: { type: "fsd_profile", value: "ACoAAB123" },
            headline: "Builder",
            follower_count: 4200,
            url: "https://linkedin.com/in/anndoe",
            image: "https://media.licdn.com/ann.jpg",
          },
        },
        posts_by_profile_urn: {
          ACoAAB123: [
            {
              urn: "urn:li:activity:999",
              share_url: "https://linkedin.com/feed/update/999",
              text: "exact artifact",
              created_at: 1_700_000_000,
              reactions: [{ type: "like", count: 7 }],
              comment_count: 2,
              share_count: 1,
              images: [],
            },
          ],
        },
      }),
    );

    expect(artifact.receipt).toMatchObject({
      packageHash: artifact.packageHash,
      sourceId: "anysite",
      protocol: "magnis.source/1",
      auth: "shared_provider",
      delivery: "poll",
      surfaces: ["linkedin"],
      scenarioIds: [
        "tst_anysite_cert_001",
        "tst_li_001",
        "tst_li_004",
        "tst_linkedin_probe",
      ],
    });
    expect(artifact.receipt.runtime.implementationHash).toBe(
      `sha256:${createHash("sha256")
        .update(readFileSync(join(artifact.root, "dist", "main.js")))
        .digest("hex")}`,
    );
    expect(sourceArtifactPackageHash(artifact.root)).toBe(artifact.packageHash);

    const evidence = await collectSourceHostEvidence(
      artifact.root,
      artifact.callableOperations,
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "deployment-key-1234" } },
          "magnis.sync.fetch": {
            surface: "linkedin",
            tracked_handles: ["anndoe"],
            cursor: 41,
            _meta: { api_key: "deployment-key-1234" },
          },
        },
      },
    );

    expect(operationResult(evidence, "magnis.auth.probe")).toEqual({
      subject: "anysite …1234",
    });
    const page = operationResult(evidence, "magnis.sync.fetch");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBe(42);
    expect(
      (page.envelopes as Array<{ remote_id: string }>).map(({ remote_id }) => remote_id),
    ).toEqual([
      "linkedin:profile:ACoAAB123",
      "linkedin:post:urn:li:activity:999",
    ]);

    const repairEvidence = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "replacement-key-1234" } },
        },
      },
    );
    expect(operationResult(repairEvidence, "magnis.auth.probe")).toEqual({
      subject: "anysite …1234",
    });

    const missingKey = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "magnis.sync.fetch", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: {} },
          "magnis.sync.fetch": { surface: "linkedin", tracked_handles: [] },
        },
      },
    );
    expect(missingKey.operationProbes["magnis.auth.probe"]?.error?.message).toContain(
      "missing api_key",
    );
    expect(missingKey.operationProbes["magnis.sync.fetch"]?.error?.message).toContain(
      "missing api_key",
    );

    writeFileSync(fixtureFile, '{"profiles_by_handle":{},"posts_by_profile_urn":{}}');
    const malformedFixture = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "deployment-key-1234" } },
        },
      },
    );
    expect(malformedFixture.operationProbes["magnis.auth.probe"]?.error?.message).toContain(
      "probe_profile must be an object",
    );
  });
});
