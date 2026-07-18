import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { createHash } from "node:crypto";
import { notesDir, scan } from "./scan";

// magnis.sync.fetch for the `local` notes source — 1:1 with the Rust
// `fetch_result`:
//   direction "backward" (bootstrap) → every note;
//   direction "forward"  (catch-up)  → notes with mtime PAST cursor.last_mtime;
//   nextCursor = { last_mtime: <newest mtime of ALL notes> } (null when empty).
//
// The envelopes carry NO `kind` — the host defaults that to `snapshot`, which
// is what the Rust connector relied on. Do not "fix" this: adding kind:"live"
// would fire the notes module's live-only side effects on every backfill.

export function fetchLocalNotes(args: FetchArgs): Promise<FetchResult> {
  const entries = scan(notesDir());
  const cursor = args.cursor as { last_mtime?: unknown } | undefined;
  const cursorMtime =
    cursor && typeof cursor === "object" && typeof cursor.last_mtime === "number"
      ? cursor.last_mtime
      : 0;

  const newest = entries.length > 0 ? entries[0].mtime : null;
  const envelopes = entries
    .filter((e) => args.direction !== "forward" || e.mtime > cursorMtime)
    .map((e) => ({
      surface: "notes",
      payload: {
        path: e.path,
        filename: e.filename,
        body: e.body,
        size: e.size,
        mtime: e.mtime,
        content_hash: createHash("sha256").update(e.body, "utf8").digest("hex"),
      },
      remote_id: e.path,
    })) as unknown as Envelope[];

  return Promise.resolve({
    envelopes,
    nextCursor: newest === null ? null : { last_mtime: newest },
    hasMore: false,
  });
}
