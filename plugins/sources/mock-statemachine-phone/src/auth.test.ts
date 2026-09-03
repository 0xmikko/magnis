import { beforeEach, describe, expect, test } from "bun:test";

import {
  FIXTURE_PHONE_CODE,
  FIXTURE_PHONE_PASSWORD,
  FIXTURE_PHONE_SESSION,
  beginFixturePhone,
  resetFixturePhoneAuth,
  revokeFixturePhone,
  stepFixturePhone,
} from "./auth";

/**
 * @test-id: tst_statemock_phone_auth_001
 * @scenario: scn_statemock_phone_ceremony_001
 * @covers: plugins/sources/mock-statemachine-phone/src/auth.ts
 * @deterministic: yes
 * @fixtures: fixed phone, code, password, identity and session credential
 *
 * Test environment: in-process deterministic fixture ceremony.
 * Clients: direct calls.
 * Mocks: no provider transport.
 * Data: package-owned phone fixture constants.
 */
describe("fixture phone-code ceremony", () => {
  beforeEach(() => {
    resetFixturePhoneAuth();
  });

  test("tst_statemock_phone_auth_001 requires code then password before minting one session", async () => {
    await expect(beginFixturePhone({}, { phone: "+15550001111" }))
      .resolves.toEqual({ state: "code_sent" });
    await expect(stepFixturePhone({}, { code: FIXTURE_PHONE_CODE }))
      .resolves.toEqual({ state: "password_required" });
    await expect(stepFixturePhone({}, { password: FIXTURE_PHONE_PASSWORD }))
      .resolves.toEqual({
        credential: FIXTURE_PHONE_SESSION,
        identity: {
          key: "fixture-phone-user",
          label: "Fixture Phone User",
        },
      });
    await expect(revokeFixturePhone({}, { session: FIXTURE_PHONE_SESSION }))
      .resolves.toEqual({ revoked: true });
    await expect(Promise.resolve().then(
      () => stepFixturePhone({}, { password: FIXTURE_PHONE_PASSWORD }),
    ))
      .rejects.toThrow("fixture phone auth has no active ceremony");
  });
});
