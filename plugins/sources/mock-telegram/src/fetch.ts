import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { readItems, SURFACE } from "./store";

// magnis.sync.fetch for mock-telegram — 1:1 with the Rust `fetch_result`: the
// cursor is an INDEX into the surface's items in the shared file; the per-item
// `kind` (snapshot for chats, live for messages) is replayed verbatim.

export function fetchMockTelegram(args: FetchArgs): Promise<FetchResult> {
  const surface = args.surface || SURFACE;
  const cursor = typeof args.cursor === "number" && args.cursor >= 0 ? Math.floor(args.cursor) : 0;
  const items = readItems(surface);
  const envelopes: Envelope[] = items.slice(cursor).map((item) => ({
    surface,
    payload: item.payload ?? {},
    remote_id: item.remote_id ?? (null as unknown as string),
    kind: (typeof item.kind === "string" ? item.kind : "live") as Envelope["kind"],
  }));
  return Promise.resolve({ envelopes, nextCursor: items.length, hasMore: false });
}
