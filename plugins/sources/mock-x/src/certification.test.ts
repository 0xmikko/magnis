import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Mock X exact-artifact certification", () => {
  /**
   * @test-id: tst_mockx_cert_001
   * @scenario: scn_mock_x_artifact_001
   * @covers: plugins/sources/mock-x/src/main.ts
   * @deterministic: yes
   * @fixtures: built-in X fixture records
   */
  test("tst_mockx_cert_001 serves tracked identities through the staged artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-x",
      { operationArguments: { "magnis.sync.fetch": { surface: "x", tracked_handles: ["jack"] } } },
      ({ packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-x",
          releaseTier: "development_fixture",
          scenarioIds: expect.arrayContaining(["tst_mockx_cert_001"]),
        });
        const page = successfulOperation(evidence, "magnis.sync.fetch");
        expect((page.envelopes as unknown[]).length).toBeGreaterThan(0);
        expect(page.hasMore).toBe(false);
        expect(successfulOperation(evidence, "magnis.auth.probe")).toEqual({
          subject: "@mock_x_user",
        });
      },
    );
  });
});
