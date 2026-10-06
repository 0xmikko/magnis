export const FIXTURE_OAUTH_CLIENT_ID = "magnis-fixture-oauth-client";
export const FIXTURE_OAUTH_CODE = "magnis-fixture-oauth-code";
export const FIXTURE_OAUTH_REFRESH_TOKEN = "magnis-fixture-refresh-token";

function requireMeta(meta: Record<string, unknown> | undefined, key: string): string {
  const value = meta?.[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`fixture OAuth ${key} is missing`);
  }
  return value;
}

/**
 * @tested-by: tst_statemock_oauth_auth_001
 * @invariant: the fixture exchanges only its shipped client and fixed code
 */
export function exchangeFixtureOAuth(
  _args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (requireMeta(meta, "client_id") !== FIXTURE_OAUTH_CLIENT_ID) {
    throw new Error("fixture OAuth client_id is invalid");
  }
  if (requireMeta(meta, "code") !== FIXTURE_OAUTH_CODE) {
    throw new Error("fixture OAuth code is invalid");
  }
  return Promise.resolve({
    credential: FIXTURE_OAUTH_REFRESH_TOKEN,
    identity: {
      key: "fixture-oauth-user",
      label: "fixture-oauth@example.com",
    },
  });
}

/**
 * @tested-by: tst_statemock_oauth_auth_001
 * @invariant: revoke accepts only the credential minted by this fixture
 */
export function revokeFixtureOAuth(
  _args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (requireMeta(meta, "refresh_token") !== FIXTURE_OAUTH_REFRESH_TOKEN) {
    throw new Error("fixture OAuth refresh_token is invalid");
  }
  return Promise.resolve({ revoked: true });
}
