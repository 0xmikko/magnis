import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("API-key state-machine exact-artifact certification", () => {
  /**
   * @test-id: tst_statemock_key_cert_001
   * @scenario: scn_statemock_api_key_artifact_001
   * @covers: plugins/sources/mock-statemachine-key/src/main.ts
   * @deterministic: yes
   * @fixtures: unprogrammed fixed API-key archetype
   */
  test("tst_statemock_key_cert_001 fixes the API-key poll surface inside the artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-statemachine-key",
      { operationArguments: { "magnis.sync.fetch": { surface: "smk" } } },
      ({ packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-statemachine-key",
          auth: "api_key",
          delivery: "poll",
          releaseTier: "development_fixture",
          surfaces: ["smk"],
          scenarioIds: expect.arrayContaining(["tst_statemock_key_cert_001"]),
        });
        expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
          envelopes: [], nextCursor: null, hasMore: false,
        });
        expect(successfulOperation(evidence, "magnis.auth.probe")).toEqual({
          subject: "statemock",
        });
      },
    );
  });
});
