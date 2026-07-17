// `magnis.auth.begin` / `.step` / `.revoke` — the connector half of the Telegram
// MTProto login. TS twin of plugins/sources/telegram/src/auth.rs.
//
// phone_code is **stateful**: `begin` requests the login code and must keep the
// live client + its phoneCodeHash in memory for the subsequent `step`. The host
// runs ONE connector instance per auth session, so this module parks the
// in-flight flow in a process-global slot across calls.
//
// The host injects the app-creds `api_id`/`api_hash` + the user-typed `phone` /
// `code` / `password` per call via `_meta` — none of them are arguments the
// isolate/browser can forge. On success the connector serializes the now
// authorized session and returns it as the `credential` (the host stores it
// keyed by connection_id; it never returns to the browser).
//
// !! SESSION FORMAT BREAK: the minted `credential` is a gramjs
// `StringSession.save()` string. The Rust connector mints
// `base64(grammers Session::save())` — a DIFFERENT, mutually unreadable format.
// A session minted here CANNOT be used by the Rust `telegram` connector and vice
// versa: cutting over between the two requires the user to RE-AUTHENTICATE.

// `import type` ONLY: the gramjs stack is loaded LAZILY (see `resolveFactory`)
// so fixture-mode runs — and these unit tests — never pay for the MTProto stack.
import type { AuthClientLike, AuthClientFactory, TgUserLike } from "./live";

/** Resolve the client factory: the caller's (tests) or the real gramjs one. */
async function resolveFactory(factory?: AuthClientFactory): Promise<AuthClientFactory> {
  if (factory !== undefined) return factory;
  const { defaultAuthClientFactory } = await import("./live");
  return defaultAuthClientFactory;
}

/** In-flight login state, parked between `begin` and `step` within the session's
 * single connector process. */
type AuthFlow =
  | { state: "awaiting_code"; client: AuthClientLike; phone: string; phoneCodeHash: string }
  | { state: "awaiting_password"; client: AuthClientLike };

/** Process-global slot (twin of the Rust `OnceLock<Mutex<Option<AuthFlow>>>`).
 * One connector process serves ONE auth session. */
let flowSlot: AuthFlow | null = null;

/** Test seam: reset the parked flow between tests. */
export function resetAuthFlow(): void {
  flowSlot = null;
}

function metaOf(args: Record<string, unknown>): Record<string, unknown> {
  const m = args._meta;
  return m !== null && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function metaStr(m: Record<string, unknown>, key: string): string {
  const v = m[key];
  if (typeof v !== "string" || v === "") {
    throw new Error(`magnis.auth: missing _meta.${key}`);
  }
  return v;
}

/** The host may inject api_id as a number or a string (env is a string). */
function metaApiId(m: Record<string, unknown>): number {
  const v = m.api_id;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  throw new Error("magnis.auth: missing or invalid _meta.api_id");
}

/** Twin of grammers' `User::full_name()`. */
function fullName(user: TgUserLike): string {
  return [user.firstName ?? "", user.lastName ?? ""].join(" ").trim();
}

/** Serialize the now-authorized session as the credential and project the
 * account identity (key = the immutable numeric user id). */
function minted(client: AuthClientLike, user: TgUserLike): Record<string, unknown> {
  const label =
    user.username !== undefined && user.username !== ""
      ? `@${user.username}`
      : fullName(user);
  return {
    credential: client.session.save(),
    identity: { key: String(user.id), label },
  };
}

/** `magnis.auth.begin`: connect with a FRESH session and request the login code. */
export async function begin(
  args: Record<string, unknown>,
  factory?: AuthClientFactory,
): Promise<Record<string, unknown>> {
  const m = metaOf(args);
  const apiId = metaApiId(m);
  const apiHash = metaStr(m, "api_hash");
  const phone = metaStr(m, "phone");

  const client = await (await resolveFactory(factory)).connectFresh(apiId, apiHash);
  const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, phone);

  flowSlot = { state: "awaiting_code", client, phone, phoneCodeHash };
  return { state: "code_sent" };
}

/** `magnis.auth.step`: submit the login code (and, if 2FA, the password).
 * Returns an intermediate `{ state: "password" }` when 2FA is required, else the
 * minted `{ credential, identity }`. */
export async function step(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const m = metaOf(args);
  const flow = flowSlot;
  // Take the flow: every arm below either mints (flow consumed), re-parks
  // explicitly, or drops it.
  flowSlot = null;
  if (flow === null) {
    throw new Error("no telegram login in progress (call begin first)");
  }

  if (flow.state === "awaiting_code") {
    const code = metaStr(m, "code");
    try {
      const user = await flow.client.signIn({
        phoneNumber: flow.phone,
        phoneCodeHash: flow.phoneCodeHash,
        phoneCode: code,
      });
      return minted(flow.client, user);
    } catch (e) {
      if (isPasswordRequired(e)) {
        // Park for the password step; the browser prompts for it.
        flowSlot = { state: "awaiting_password", client: flow.client };
        return { state: "password" };
      }
      if (isInvalidCode(e)) {
        // Recoverable: RE-PARK UNCHANGED so the user can re-enter the code.
        flowSlot = flow;
        throw new Error("invalid login code");
      }
      throw new Error(`sign_in failed: ${errText(e)}`);
    }
  }

  const password = metaStr(m, "password");
  try {
    const user = await flow.client.signInWithPassword(password);
    return minted(flow.client, user);
  } catch (e) {
    throw new Error(`check_password failed: ${errText(e)}`);
  }
}

/** `magnis.auth.revoke`: log the session out provider-side so the minted blob can
 * no longer be used. The host injects the stored `session` (+ app-creds).
 * Best-effort: NEVER throws on a logout failure — reports `{ revoked: false }`. */
export async function revoke(
  args: Record<string, unknown>,
  factory?: AuthClientFactory,
): Promise<Record<string, unknown>> {
  const m = metaOf(args);
  const apiId = metaApiId(m);
  const apiHash = metaStr(m, "api_hash");
  const session = metaStr(m, "session");

  const client = await (await resolveFactory(factory)).connectWithSession(
    apiId,
    apiHash,
    session,
  );
  const ok = await client.logOut().then(
    () => true,
    () => false,
  );
  return { revoked: ok };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** gramjs raises SESSION_PASSWORD_NEEDED (a 401 RPCError) when 2FA is on. */
function isPasswordRequired(e: unknown): boolean {
  return errMessageOf(e).includes("SESSION_PASSWORD_NEEDED");
}

/** gramjs raises PHONE_CODE_INVALID for a wrong login code — recoverable. */
function isInvalidCode(e: unknown): boolean {
  return errMessageOf(e).includes("PHONE_CODE_INVALID");
}

function errMessageOf(e: unknown): string {
  if (e === null || typeof e !== "object") return String(e);
  const rpc = e as { errorMessage?: string; message?: string };
  return `${rpc.errorMessage ?? ""} ${rpc.message ?? ""}`;
}
