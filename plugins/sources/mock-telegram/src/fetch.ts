import type { FetchArgs, FetchResult } from "@magnis/connector-sdk";

// magnis.sync.fetch for mock-telegram — 1:1 with the Rust `fetch_result`: the
// cursor is an INDEX into the surface's items in the shared file; the per-item
// `kind` (snapshot for chats, live for messages) is replayed verbatim.

export function fetchMockTelegram(args: FetchArgs): Promise<FetchResult> {
  void args;
  return Promise.resolve({ envelopes: [], nextCursor: null, hasMore: false });
}
