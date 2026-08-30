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
const linkedInEffectsScenarioId = ["tst", "li", "005"].join("_");

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
   * Data: one tracked LinkedIn profile, two posts and numeric cursor 41.
   */
  test("tst_anysite_cert_001 exact v1 artifact proves shared-key Add/Repair and numeric progress", async () => {
    const artifact = stageExactAnysiteArtifact();
    const fixtureFile = join(artifact.fixtureRoot, "anysite-certification-fixture.json");
    writeFileSync(
      fixtureFile,
      JSON.stringify({
        mode: "success",
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
              images: ["https://media.licdn.com/post-999.jpg"],
            },
            {
              urn: "urn:li:activity:1000",
              share_url: null,
              text: null,
              created_at: 1_700_000_100,
              is_empty_repost: true,
              reactions: null,
              comment_count: null,
              share_count: null,
              images: null,
              repost: {
                text: "original reshared content",
                url: "https://linkedin.com/feed/update/original",
                images: ["https://media.licdn.com/original-1000.jpg"],
                reactions: null,
                comment_count: null,
              },
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
        "tst_anysite_empty_001",
        "tst_li_001",
        "tst_li_004",
        linkedInEffectsScenarioId,
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
          "magnis.auth.probe": { _meta: { api_key: "deployment-key-1111" } },
          "magnis.sync.fetch": {
            surface: "linkedin",
            tracked_handles: ["anndoe"],
            cursor: 41,
            _meta: { api_key: "deployment-key-1111" },
          },
        },
      },
    );

    expect(operationResult(evidence, "magnis.auth.probe")).toEqual({
      subject: "anysite …1111",
    });
    const page = operationResult(evidence, "magnis.sync.fetch");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBe(42);
    expect(page.envelopes).toEqual([
      {
        surface: "linkedin",
        remote_id: "linkedin:profile:ACoAAB123",
        kind: "snapshot",
        payload: {
          entity_type: "profile",
          platform: "linkedin",
          urn: "ACoAAB123",
          handle: "anndoe",
          display_name: "Ann Doe",
          url: "https://linkedin.com/in/anndoe",
          bio: "Builder",
          follower_count: 4200,
          avatar_url: "https://media.licdn.com/ann.jpg",
        },
      },
      {
        surface: "linkedin",
        remote_id: "linkedin:post:urn:li:activity:999",
        kind: "live",
        payload: {
          entity_type: "post",
          platform: "linkedin",
          post_id: "urn:li:activity:999",
          author_handle: "anndoe",
          text: "exact artifact",
          created_at: "2023-11-14T22:13:20.000Z",
          url: "https://linkedin.com/feed/update/999",
          is_repost: false,
          media: [
            {
              type: "photo",
              url: "https://media.licdn.com/post-999.jpg",
              preview_image_url: null,
              alt_text: null,
            },
          ],
          metrics: { likes: 7, replies: 2, reposts: 1 },
        },
      },
      {
        surface: "linkedin",
        remote_id: "linkedin:post:urn:li:activity:1000",
        kind: "live",
        payload: {
          entity_type: "post",
          platform: "linkedin",
          post_id: "urn:li:activity:1000",
          author_handle: "anndoe",
          text: "original reshared content",
          created_at: "2023-11-14T22:15:00.000Z",
          url: "https://linkedin.com/feed/update/original",
          is_repost: true,
          media: [
            {
              type: "photo",
              url: "https://media.licdn.com/original-1000.jpg",
              preview_image_url: null,
              alt_text: null,
            },
          ],
          metrics: { likes: null, replies: null, reposts: null },
        },
      },
    ]);

    const repairEvidence = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "replacement-key-2222" } },
        },
      },
    );
    expect(operationResult(repairEvidence, "magnis.auth.probe")).toEqual({
      subject: "anysite …2222",
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

    writeFileSync(
      fixtureFile,
      JSON.stringify({
        mode: "provider_error",
        provider_error: {
          path: "/api/linkedin/user",
          status: 401,
          detail: "Points limit exhausted, required at least 9 points",
          retry_after: 73,
        },
      }),
    );
    const pointsExhausted = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.sync.fetch", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.sync.fetch": {
            surface: "linkedin",
            tracked_handles: ["anndoe"],
            cursor: 41,
            _meta: { api_key: "deployment-key-1234" },
          },
        },
      },
    );
    expect(pointsExhausted.operationProbes["magnis.sync.fetch"]?.error).toEqual({
      code: -32002,
      message: "rate limited; retry_after=73",
      data: { retry_after: 73 },
    });

    rmSync(fixtureFile);
    const missingFixture = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "deployment-key-1234" } },
        },
      },
    );
    expect(missingFixture.operationProbes["magnis.auth.probe"]?.error).toMatchObject({
      code: -32000,
      message: expect.stringContaining("cannot be decoded"),
    });

    writeFileSync(fixtureFile, "{not-json");
    const malformedBytes = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { api_key: "deployment-key-1234" } },
        },
      },
    );
    expect(malformedBytes.operationProbes["magnis.auth.probe"]?.error).toMatchObject({
      code: -32000,
      message: expect.stringContaining("cannot be decoded"),
    });

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
      "mode must be a non-empty string",
    );
  });

  /**
   * @test-id: tst_anysite_empty_001
   * @scenario: scn_anysite_v1_empty_scope_001
   * @covers: plugins/sources/anysite/src/surfaces/linkedin/fetch.ts::fetchLinkedIn
   * @deterministic: yes
   * @fixtures: deliberately absent provider fixture proves zero transport calls
   *
   * Test environment: dependency-closed staged Anysite artifact over real stdio.
   * Clients: @magnis/testkit Source host evidence driver.
   * Mocks: missing captured provider file that would fail if transport were called.
   * Data: valid shared key, empty tracked-handle scope and numeric cursor 87.
   */
  test("tst_anysite_empty_001 empty tracked scope advances its numeric cursor with zero provider calls", async () => {
    const artifact = stageExactAnysiteArtifact();
    const absentFixture = join(artifact.fixtureRoot, "must-not-be-read.json");
    const evidence = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.sync.fetch", "tools/list"],
      {
        fixtureEnvironment: { ANYSITE_FIXTURE_FILE: absentFixture },
        operationArguments: {
          "magnis.sync.fetch": {
            surface: "linkedin",
            tracked_handles: [],
            cursor: 87,
            _meta: { api_key: "deployment-key-1111" },
          },
        },
      },
    );

    expect(operationResult(evidence, "magnis.sync.fetch")).toEqual({
      envelopes: [],
      nextCursor: 88,
      hasMore: false,
    });
  });
});
