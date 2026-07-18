// magnis.auth.exchange / magnis.auth.revoke — twin of
// plugins/sources/google/src/oauth_exchange.rs (DEC-15/16/25/26/27).
//
// The HOST owns the OAuth ceremony (state/PKCE/nonce/consent URL) and, after
// the browser callback, calls exchange with `_meta = { client_id,
// client_secret?, code, code_verifier, redirect_uri, nonce }`. The connector
// exchanges the code at Google's token endpoint, validates the id_token
// CLAIMS (back-channel TLS flow → claims validation per OIDC Core §3.1.3.7;
// no JWKS signature check needed), confirms userinfo `sub`, and returns
// `{ credential: refresh_token, identity: { key: sub, label: email } }`.

import { fetchWithRetry, type FetchLike } from "./http";

/** Claims we extract + trust from a validated Google id_token. */
export interface IdTokenClaims {
  sub: string;
  email: string | null;
}

/** Google's accepted issuer values. */
const GOOGLE_ISS = ["accounts.google.com", "https://accounts.google.com"];

function base64UrlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(s)) return null;
  try {
    return Uint8Array.from(
      Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
    );
  } catch {
    return null;
  }
}

/** `aud` is a string for Google, but the spec allows an array — accept either. */
function audMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.some((v) => v === expected);
  return false;
}

/** Decode (without signature verification — see module docs) and validate the
 * claims of a Google id_token. Pure + `now`-injected → exhaustively
 * unit-testable. Throws with the reason on any violation. */
export function validateIdTokenClaims(
  idToken: string,
  expectedAud: string,
  expectedNonce: string,
  nowUnix: number,
): IdTokenClaims {
  // JWT = header.payload.signature — we read the payload segment.
  const payloadB64 = idToken.split(".")[1] as string | undefined;
  if (payloadB64 === undefined) throw new Error("id_token is not a JWT");
  const bytes = base64UrlDecode(payloadB64);
  if (bytes === null) throw new Error("id_token payload not base64url");

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`id_token claims not JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  if (typeof claims.iss !== "string" || !GOOGLE_ISS.includes(claims.iss)) {
    throw new Error(`id_token iss not Google: ${String(claims.iss)}`);
  }
  if (!audMatches(claims.aud, expectedAud)) {
    throw new Error("id_token aud != client_id");
  }
  if (claims.azp !== undefined && claims.azp !== null && claims.azp !== expectedAud) {
    throw new Error("id_token azp != client_id");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowUnix) {
    throw new Error("id_token expired");
  }
  // The nonce binds the token to THIS host ceremony; a MISSING nonce is
  // rejected too (a token minted outside our ceremony must not pass).
  if (claims.nonce !== expectedNonce) {
    throw new Error("id_token nonce mismatch");
  }
  if (typeof claims.sub !== "string") {
    throw new Error("id_token claims not JSON: missing sub");
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

function metaStr(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  if (typeof v !== "string" || v === "") {
    // NOTE: the Rust helper is shared by exchange AND revoke and always says
    // "magnis.auth.exchange:" — mirrored verbatim for wire parity.
    throw new Error(`magnis.auth.exchange: missing _meta.${key}`);
  }
  return v;
}

/** Host-driven code→token exchange. `meta` is the host-injected `_meta`. */
export async function exchange(
  meta: Record<string, unknown> | undefined,
  fetchFn: FetchLike,
  nowUnix: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown>> {
  const m = meta ?? {};
  const clientId = metaStr(m, "client_id");
  const code = metaStr(m, "code");
  const codeVerifier = metaStr(m, "code_verifier");
  const redirectUri = metaStr(m, "redirect_uri");
  const nonce = metaStr(m, "nonce");
  // Confidential web client → client_secret present; public PKCE → absent.
  const clientSecret =
    typeof m.client_secret === "string" && m.client_secret !== ""
      ? m.client_secret
      : undefined;

  const form = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  if (clientSecret !== undefined) form.set("client_secret", clientSecret);

  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!resp.ok) {
    throw new Error(`token exchange failed: ${await resp.text()}`);
  }
  const body = (await resp.json()) as {
    refresh_token?: string;
    id_token?: string;
    access_token?: string;
  };

  if (typeof body.refresh_token !== "string") {
    throw new Error(
      "token response missing refresh_token (add prompt=consent/access_type=offline)",
    );
  }
  if (typeof body.id_token !== "string") {
    throw new Error("token response missing id_token");
  }

  const claims = validateIdTokenClaims(body.id_token, clientId, nonce, nowUnix);

  // Confirm the userinfo subject matches the id_token subject (defence in depth).
  if (typeof body.access_token === "string") {
    const ui = await fetchWithRetry(
      fetchFn,
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${body.access_token}` } },
    );
    if (ui.ok) {
      const info = (await ui.json()) as { sub?: string };
      if (info.sub !== claims.sub) {
        throw new Error("userinfo sub != id_token sub");
      }
    }
  }

  const label = claims.email ?? claims.sub;
  return {
    credential: body.refresh_token,
    identity: { key: claims.sub, label },
  };
}

/** magnis.auth.revoke (DEC-27): ask Google to invalidate the stored
 * refresh_token. 200 = revoked; 400 = already invalid — both mean "not usable
 * anymore", which is the goal. */
export async function revoke(
  meta: Record<string, unknown> | undefined,
  fetchFn: FetchLike,
): Promise<Record<string, unknown>> {
  const token = metaStr(meta ?? {}, "refresh_token");
  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  return { revoked: resp.ok || resp.status === 400 };
}
