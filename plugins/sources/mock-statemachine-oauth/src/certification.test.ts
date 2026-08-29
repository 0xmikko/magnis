import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("OAuth state-machine exact-artifact certification", () => {
  /**
   * @test-id: tst_statemock_oauth_cert_001
   * @scenario: scn_statemock_oauth_artifact_001
   * @covers: plugins/sources/mock-statemachine-oauth/src/main.ts
   * @deterministic: yes
   * @fixtures: unprogrammed fixed three-surface OAuth archetype
   */
  test("tst_statemock_oauth_cert_001 fixes every OAuth poll surface inside the artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-statemachine-oauth",
      { operationArguments: { "magnis.sync.fetch": { surface: "smo-b" } } },
      ({ packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-statemachine-oauth",
          auth: "oauth2",
          delivery: "poll",
          releaseTier: "development_fixture",
          surfaces: ["smo-a", "smo-b", "smo-c"],
          scenarioIds: expect.arrayContaining(["tst_statemock_oauth_cert_001"]),
        });
        expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
          envelopes: [], nextCursor: null, hasMore: false,
        });
      },
    );
  });
});
