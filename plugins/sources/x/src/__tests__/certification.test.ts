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

function stageExactXArtifact(): {
  readonly root: string;
  readonly fixtureRoot: string;
  readonly packageHash: string;
  readonly callableOperations: readonly string[];
  readonly receipt: ReturnType<typeof decodeSourceCertificationReceipt>;
} {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "magnis-x-cert-"));
  temporaryDirectories.push(temporaryRoot);
  const artifactRoot = join(temporaryRoot, "artifact");
  const release = discoverSourceReleaseManifests(join(repoRoot, "plugins", "sources"))
    .find((candidate) => candidate.id === "x");
  if (release === undefined || release.disposition !== "admissible") {
    throw new Error("x must be an admissible Source release");
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

function replyResult(
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

describe("X exact-artifact certification", () => {
  /**
   * @test-id: tst_x_cert_001
   * @scenario: scn_x_v1_exact_artifact_001
   * @covers: plugins/sources/x/src/main.ts::runConnector
   * @covers: plugins/sources/x/src/surfaces/x/fetch.ts::fetchX
   * @covers: plugins/sources/x/src/probe.ts::probeXAuth
   * @deterministic: yes
   * @fixtures: temporary captured X v2 provider payload
   *
   * Test environment: dependency-closed staged X artifact over real stdio.
   * Clients: @magnis/testkit Source host evidence driver.
   * Mocks: captured provider transport selected only by X_FIXTURE_FILE.
   * Data: one tracked profile, one post and numeric cursor 41.
   */
  test("tst_x_cert_001 exact v1 artifact proves Add/Repair identity and tracked-handle progress", async () => {
    const artifact = stageExactXArtifact();
    const fixtureFile = join(artifact.fixtureRoot, "x-certification-fixture.json");
    writeFileSync(
      fixtureFile,
      JSON.stringify({
        probe_user: { id: "12", username: "jack", name: "Jack" },
        users: [
          {
            id: "12",
            username: "jack",
            name: "Jack",
            description: "founder",
            verified: true,
            public_metrics: { followers_count: 99 },
          },
        ],
        tweets_by_user_id: {
          "12": [
            {
              id: "post-1",
              text: "exact artifact",
              created_at: "2026-08-29T00:00:00Z",
              public_metrics: { like_count: 5 },
            },
          ],
        },
      }),
    );
    expect(artifact.receipt).toMatchObject({
      packageHash: artifact.packageHash,
      sourceId: "x",
      protocol: "magnis.source/1",
      auth: "api_key",
      delivery: "poll",
      surfaces: ["x"],
      scenarioIds: [
        "tst_x_001",
        "tst_x_005",
        "tst_x_006",
        "tst_x_cert_001",
        "tst_x_probe",
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
        fixtureEnvironment: { X_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { bearer_token: "cert-key" } },
          "magnis.sync.fetch": {
            surface: "x",
            tracked_handles: ["jack"],
            cursor: 41,
            _meta: { bearer_token: "cert-key" },
          },
        },
      },
    );

    expect(replyResult(evidence, "magnis.auth.probe")).toEqual({ subject: "@jack" });
    const page = replyResult(evidence, "magnis.sync.fetch");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBe(42);
    expect(
      (page.envelopes as Array<{ remote_id: string }>).map(({ remote_id }) => remote_id),
    ).toEqual(["x:profile:12", "x:post:post-1"]);

    const repairEvidence = await collectSourceHostEvidence(
      artifact.root,
      ["initialize", "magnis.auth.probe", "tools/list"],
      {
        fixtureEnvironment: { X_FIXTURE_FILE: fixtureFile },
        operationArguments: {
          "magnis.auth.probe": { _meta: { bearer_token: "replacement-cert-key" } },
        },
      },
    );
    expect(replyResult(repairEvidence, "magnis.auth.probe")).toEqual({ subject: "@jack" });
  });
});
