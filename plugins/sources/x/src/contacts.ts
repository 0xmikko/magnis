// contacts surface (plan §7, S5): the following list flows through the ONE
// canonical ingest path — social_contact envelopes into the contacts module's
// @syncHandler — instead of the old direct-write import. The import spec
// arrives in the CURSOR (seeded host-side by `source.sync.bootstrap` when the
// operator runs x.import_following): { import: { handle, limit? }, token? }.
// A null/unseeded cursor is a clean empty fetch — nothing was requested.

import { RateLimitError } from "@magnis/connector-sdk";
import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { X_API_BASE, XApiError, XClient, type FetchLike, type XUser } from "./api";

const PAGE_SIZE = 1000;
const HARD_MAX = 5000;
const USER_FIELDS = "name,username,profile_image_url,description,public_metrics";

interface ContactsCursor {
  import?: { handle?: string; limit?: number };
  owner_id?: string;
  token?: string;
  fetched?: number;
}

// Plan §7: payload {kind, handle, display_name, profile_url} — ALL fields
// required. display_name falls back to the handle only because the provider
// may omit `name`; it is never absent from the envelope.
function socialContactEnvelope(user: XUser): Envelope {
  return {
    surface: "contacts",
    remote_id: `x:social:${user.username.toLowerCase()}`,
    kind: "snapshot",
    payload: {
      kind: "social_contact",
      handle: user.username,
      display_name: user.name,
      profile_url: `https://x.com/${user.username}`,
    },
  };
}

export async function fetchXContacts(args: FetchArgs, fetchFn: FetchLike): Promise<FetchResult> {
  const bearer = typeof args.meta?.bearer_token === "string" ? (args.meta.bearer_token) : "";
  const cursor = (args.cursor ?? {}) as ContactsCursor;
  const spec = cursor.import;
  const handle = typeof spec?.handle === "string" ? spec.handle : "";
  if (!handle) {
    // No import requested — the surface idles (clean empty fetch).
    return { envelopes: [], nextCursor: null, hasMore: false };
  }
  if (!bearer) throw new Error("x: missing bearer_token (set SOURCE_X_BEARER_TOKEN)");

  const limit = Math.min(Math.max(spec?.limit ?? PAGE_SIZE, 1), HARD_MAX);
  const already = cursor.fetched ?? 0;
  const client = new XClient(bearer, fetchFn);

  // First page resolves the owner (1 extra call); later pages carry owner_id.
  let ownerId = cursor.owner_id;
  if (!ownerId) {
    const owner = await client.userByUsername(handle);
    if (!owner) throw new Error(`handle_not_found: no X account @${handle}`);
    ownerId = owner.id;
  }

  const pageSize = Math.max(Math.min(PAGE_SIZE, limit - already), 1);
  const url =
    `${X_API_BASE}/2/users/${encodeURIComponent(ownerId)}/following` +
    `?max_results=${String(pageSize)}&user.fields=${USER_FIELDS}` +
    (cursor.token ? `&pagination_token=${encodeURIComponent(cursor.token)}` : "");
  const res = await fetchFn(url, {
    method: "GET",
    headers: { authorization: `Bearer ${bearer}` },
  });
  if (res.status === 429) throw new RateLimitError(30);
  const body = (await res.json().catch(() => ({}))) as {
    data?: XUser[];
    meta?: { next_token?: string };
  };
  if (!res.ok) throw new XApiError(res.status, "following page failed");

  const envelopes = (body.data ?? []).slice(0, limit - already).map(socialContactEnvelope);
  const fetched = already + envelopes.length;
  const nextToken = body.meta?.next_token;
  const hasMore = !!nextToken && fetched < limit;

  return {
    envelopes,
    nextCursor: hasMore
      ? { import: spec, owner_id: ownerId, token: nextToken, fetched }
      : null,
    hasMore,
  };
}
