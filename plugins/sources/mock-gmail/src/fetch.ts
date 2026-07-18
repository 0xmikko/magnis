import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { readItems } from "./store";

// magnis.sync.fetch for mock-gmail — 1:1 with the Rust `fetch_result`:
// the cursor is an INDEX into the surface's items in the shared file; every
// item past it is returned, `nextCursor` is the total count, `hasMore` false.

export function fetchMockGmail(args: FetchArgs): Promise<FetchResult> {
  // Rust: `surface` defaults to "email", `cursor` to 0 (as_u64 → non-numeric
  // cursors read as 0 too).
  const surface = args.surface || "email";
  const cursor = typeof args.cursor === "number" && args.cursor >= 0 ? Math.floor(args.cursor) : 0;
  const items = readItems(surface);
  const envelopes: Envelope[] = items.slice(cursor).map((item) => ({
    surface,
    payload: item.payload ?? {},
    // Rust emits `null` when the stored line has no remote_id.
    remote_id: item.remote_id ?? (null as unknown as string),
    // Injected items are fresh arrivals (matching the old in-core mock, which
    // stamped Live) so the modules' trigger.check fires.
    kind: "live",
  }));
  return Promise.resolve({ envelopes, nextCursor: items.length, hasMore: false });
}
