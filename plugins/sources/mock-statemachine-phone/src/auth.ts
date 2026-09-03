export const FIXTURE_PHONE_CODE = "24680";
export const FIXTURE_PHONE_PASSWORD = "fixture-password";
export const FIXTURE_PHONE_SESSION = "fixture-phone-session";

type PhoneAuthPhase = "idle" | "awaiting_code" | "awaiting_password";

let phase: PhoneAuthPhase = "idle";

function requireMeta(meta: Record<string, unknown> | undefined, key: string): string {
  const value = meta?.[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`fixture phone ${key} is missing`);
  }
  return value;
}

export function resetFixturePhoneAuth(): void {
  phase = "idle";
}

/**
 * @tested-by: tst_statemock_phone_auth_001
 * @invariant: every begin starts one fresh code challenge in this auth process
 */
export function beginFixturePhone(
  _args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  requireMeta(meta, "phone");
  phase = "awaiting_code";
  return Promise.resolve({ state: "code_sent" });
}

/**
 * @tested-by: tst_statemock_phone_auth_001
 * @invariant: the session is minted only after the fixed code and password
 */
export function stepFixturePhone(
  _args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (phase === "awaiting_code") {
    if (requireMeta(meta, "code") !== FIXTURE_PHONE_CODE) {
      throw new Error("fixture phone code is invalid");
    }
    phase = "awaiting_password";
    return Promise.resolve({ state: "password_required" });
  }
  if (phase === "awaiting_password") {
    if (requireMeta(meta, "password") !== FIXTURE_PHONE_PASSWORD) {
      throw new Error("fixture phone password is invalid");
    }
    phase = "idle";
    return Promise.resolve({
      credential: FIXTURE_PHONE_SESSION,
      identity: {
        key: "fixture-phone-user",
        label: "Fixture Phone User",
      },
    });
  }
  throw new Error("fixture phone auth has no active ceremony");
}

/**
 * @tested-by: tst_statemock_phone_auth_001
 * @invariant: revoke accepts only the session minted by this fixture
 */
export function revokeFixturePhone(
  _args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (requireMeta(meta, "session") !== FIXTURE_PHONE_SESSION) {
    throw new Error("fixture phone session is invalid");
  }
  return Promise.resolve({ revoked: true });
}
