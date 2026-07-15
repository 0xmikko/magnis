// Per-call credentials + access-token refresh — twin of the Rust
// `creds_from_meta` (main.rs) and `refresh_access_token` (auth.rs).
//
// The host injects `_meta = { refresh_token, client_id, client_secret }` on
// each fetch/execute call; the connector mints a short-lived access token
// before every Google REST call (no caching, matching the Rust connector).

import { AuthExpiredError, fetchWithRetry, type FetchLike } from "./http";

export interface Creds {
  refresh_token: string;
  client_id: string;
  client_secret: string;
}

/** Pull `{ refresh_token, client_id, client_secret }` out of the tool-call
 * `_meta`. All three are required — a missing key is an error (NO FALLBACK). */
export function credsFromMeta(meta: Record<string, unknown> | undefined): Creds {
  if (meta === undefined) {
    throw new Error("missing _meta with Google credentials");
  }
  const get = (k: string): string => {
    const v = meta[k];
    if (typeof v !== "string" || v === "") {
      throw new Error(`missing credential '${k}' in _meta`);
    }
    return v;
  };
  return {
    refresh_token: get("refresh_token"),
    client_id: get("client_id"),
    client_secret: get("client_secret"),
  };
}

/** Refresh a Google OAuth access token using the injected refresh token.
 * A non-2xx body containing "invalid_grant" → auth expired (re-authorize). */
export async function refreshAccessToken(
  creds: Creds,
  fetchFn: FetchLike,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  }).toString();

  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (text.includes("invalid_grant")) throw new AuthExpiredError(text);
    throw new Error(`Token refresh failed: ${text}`);
  }

  const json = (await resp.json()) as { access_token?: string };
  if (typeof json.access_token !== "string") {
    throw new Error("Token refresh failed: response missing access_token");
  }
  return json.access_token;
}
