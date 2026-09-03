import { describe, expect, test } from "bun:test";

import {
  FIXTURE_OAUTH_CLIENT_ID,
  FIXTURE_OAUTH_CODE,
  FIXTURE_OAUTH_REFRESH_TOKEN,
  exchangeFixtureOAuth,
  revokeFixtureOAuth,
} from "./auth";

/**
 * @test-id: tst_statemock_oauth_auth_001
 * @scenario: scn_statemock_oauth_ceremony_001
 * @covers: plugins/sources/mock-statemachine-oauth/src/auth.ts
 * @deterministic: yes
 * @fixtures: fixed OAuth code, client id, identity and refresh token
 *
 * Test environment: in-process deterministic fixture ceremony.
 * Clients: direct calls.
 * Mocks: no provider transport.
 * Data: package-owned OAuth fixture constants.
 */
describe("fixture OAuth ceremony", () => {
  test("tst_statemock_oauth_auth_001 exchanges and revokes only the fixed fixture values", async () => {
    await expect(exchangeFixtureOAuth({}, {
      client_id: FIXTURE_OAUTH_CLIENT_ID,
      code: FIXTURE_OAUTH_CODE,
    })).resolves.toEqual({
      credential: FIXTURE_OAUTH_REFRESH_TOKEN,
      identity: {
        key: "fixture-oauth-user",
        label: "fixture-oauth@example.com",
      },
    });
    await expect(revokeFixtureOAuth({}, {
      refresh_token: FIXTURE_OAUTH_REFRESH_TOKEN,
    })).resolves.toEqual({ revoked: true });

    await expect(Promise.resolve().then(() => exchangeFixtureOAuth({}, {
      client_id: "wrong-client",
      code: FIXTURE_OAUTH_CODE,
    }))).rejects.toThrow("fixture OAuth client_id is invalid");
    await expect(Promise.resolve().then(() => exchangeFixtureOAuth({}, {
      client_id: FIXTURE_OAUTH_CLIENT_ID,
      code: "wrong-code",
    }))).rejects.toThrow("fixture OAuth code is invalid");
    await expect(Promise.resolve().then(() => revokeFixtureOAuth({}, {
      refresh_token: "wrong-token",
    }))).rejects.toThrow("fixture OAuth refresh_token is invalid");
  });
});
