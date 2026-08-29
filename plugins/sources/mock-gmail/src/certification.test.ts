import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Mock Gmail exact-artifact certification", () => {
  /**
   * @test-id: tst_mockgmail_cert_001
   * @scenario: scn_mock_gmail_artifact_closure_001
   * @covers: plugins/sources/mock-gmail/src/main.ts
   * @deterministic: yes
   * @fixtures: root-local dataset action schemas
   */
  test("tst_mockgmail_cert_001 packages schemas and serves the declared fixture operations", async () => {
    await withCertifiedFixtureArtifact("mock-gmail", {}, ({ root, packageHash, receipt, evidence }) => {
      expect(receipt).toMatchObject({
        packageHash,
        sourceId: "mock-gmail",
        releaseTier: "development_fixture",
        surfaces: ["email", "meetings"],
        scenarioIds: expect.arrayContaining(["tst_mockgmail_cert_001"]),
      });
      expect(existsSync(join(root, "schemas/dataset-actions/emit-message.json"))).toBe(true);
      expect(existsSync(join(root, "schemas/dataset-actions/emit-meeting.json"))).toBe(true);
      expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
        envelopes: [], nextCursor: null, hasMore: false,
      });
    });
  });
});
