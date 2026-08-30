import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Phone state-machine exact-artifact certification", () => {
  /**
   * @test-id: tst_statemock_phone_cert_001
   * @scenario: scn_statemock_phone_push_artifact_001
   * @covers: plugins/sources/mock-statemachine-phone/src/main.ts
   * @deterministic: yes
   * @fixtures: fixed phone-code Push archetype
   */
  test("tst_statemock_phone_cert_001 fixes phone-code Push authority inside the artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-statemachine-phone",
      { operationArguments: { "magnis.sync.fetch": { surface: "smp" } } },
      ({ packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-statemachine-phone",
          auth: "phone_code",
          delivery: "push",
          releaseTier: "development_fixture",
          surfaces: ["smp"],
          scenarioIds: expect.arrayContaining(["tst_statemock_phone_cert_001"]),
        });
        expect(successfulOperation(evidence, "listen_start")).toEqual({
          ok: true, subscription_id: "certification-probe",
        });
        expect(successfulOperation(evidence, "listen_stop")).toEqual({ ok: true });
        expect(successfulOperation(evidence, "magnis.sync.listen")).toEqual({
          ok: true, subscription_id: "sub:certification",
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
