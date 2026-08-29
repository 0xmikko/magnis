import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Mock LinkedIn exact-artifact certification", () => {
  /**
   * @test-id: tst_mockli_cert_001
   * @scenario: scn_mock_linkedin_artifact_001
   * @covers: plugins/sources/mock-linkedin/src/main.ts
   * @deterministic: yes
   * @fixtures: built-in LinkedIn fixture records
   */
  test("tst_mockli_cert_001 serves tracked identities through the staged artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-linkedin",
      { operationArguments: { "magnis.sync.fetch": { surface: "linkedin", tracked_handles: ["anndoe"] } } },
      ({ packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-linkedin",
          releaseTier: "development_fixture",
          scenarioIds: expect.arrayContaining(["tst_mockli_cert_001"]),
        });
        const page = successfulOperation(evidence, "magnis.sync.fetch");
        expect((page.envelopes as unknown[]).length).toBeGreaterThan(0);
        expect(page.hasMore).toBe(false);
      },
    );
  });
});
