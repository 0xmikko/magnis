// ProbeAuth (plan §2.4): verify the key with a REAL provider call. X issues
// two token shapes: user-context (can call /2/users/me → @username) and
// app-only (DEC-5 — our documented shape; /2/users/me answers 403 for it).
// The probe is a two-step protocol, not a fallback: whoami first; a 403
// (token VALID but has no user context) verifies via a public lookup that
// app-only tokens are allowed to make. 401/anything-else = key rejected.
//
// Subject: @username for user-context keys; for app-only keys X exposes no
// identity, so the subject is the masked key (same idiom as linkedin).

import type { FetchLike } from "./api";

export async function probeXAuth(
  meta: Record<string, unknown> | undefined,
  fetchFn: FetchLike,
): Promise<{ subject: string }> {
  const bearer = typeof meta?.bearer_token === "string" ? (meta.bearer_token) : "";
  if (!bearer) throw new Error("x: missing bearer_token");
  const headers = { authorization: `Bearer ${bearer}` };

  const me = await fetchFn("https://api.x.com/2/users/me", { method: "GET", headers });
  if (me.ok) {
    const body = (await me.json()) as { data?: { username?: string } };
    const username = body.data?.username;
    if (!username) throw new Error("x: probe returned no username");
    return { subject: `@${username}` };
  }
  if (me.status !== 403) {
    throw new Error(`x: provider rejected the key (HTTP ${me.status})`);
  }

  // 403 = valid token WITHOUT user context (app-only). Verify it can read.
  const probe = await fetchFn("https://api.x.com/2/users/by/username/x", {
    method: "GET",
    headers,
  });
  if (!probe.ok) {
    throw new Error(`x: provider rejected the key (HTTP ${probe.status})`);
  }
  const body = (await probe.json()) as { data?: { id?: string } };
  if (!body.data?.id) throw new Error("x: probe lookup returned no data");
  return { subject: `x app …${bearer.slice(-4)}` };
}
