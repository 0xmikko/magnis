export const FIXTURE_PHONE_CODE = "24680";
export const FIXTURE_PHONE_PASSWORD = "fixture-password";
export const FIXTURE_PHONE_SESSION = "fixture-phone-session";
/** A code that makes this connector answer a state NOBODY's screen plans
 * for. Real connectors grow states, and a screen that meets one and quietly
 * stays where it is leaves the person pressing a button that only ever
 * answers `409`. The fixture can produce that on demand so a walk can prove
 * the screen SAYS something.
 *
 * @tested-by: tst_e2e_source_auth_screen_002 */
export const FIXTURE_PHONE_STRANGE_CODE = "13579";

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
    const code = requireMeta(meta, "code");
    if (code === FIXTURE_PHONE_STRANGE_CODE) {
      // Passed through by the host verbatim: a status no screen names.
      return Promise.resolve({ state: "somewhere_else" });
    }
    if (code !== FIXTURE_PHONE_CODE) {
      throw new Error("fixture phone code is invalid");
    }
    phase = "awaiting_password";
    // The CONNECTOR's own word, which is what a real one answers — Telegram
    // says `password` here. The host renames it to its own
    // `password_required` on the way to the browser, and a fixture that
    // answered the host's word instead left that rename unexercised: a
    // screen reading the connector's spelling passed every test here and
    // then sat frozen on a live stand while the ceremony had moved on.
    // @tested-by: tst_e2e_source_auth_screen_001
    return Promise.resolve({ state: "password" });
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
