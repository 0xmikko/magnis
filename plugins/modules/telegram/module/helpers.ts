// Telegram plugin — pure helpers (no graph/host access). Payload field readers,
// URL extraction, media→MIME mapping, and ingest tuning constants. Extracted
// from module/service.ts so the class body stays handler-only.

/// A loosely-typed facet/payload object (the connector snapshot / details facet).
export type Data = Record<string, unknown>;

// PGlite is single-connection, so a sync page (the telegram dialog list is ONE
// ~2400-chat page) must be applied in CHUNKS: at most this many entities per
// graph.apply_batch, so each transaction is short and the lone DB connection is
// freed between batches. Without this, one dispatch monopolizes the connection and
// every other RPC (frontend polls, search indexer) times out.
export const INGEST_CHUNK = 200;
// Above this many chats in a page = a bootstrap dialog list → batch + chunk them.
// At/below = a re-sync; keep the per-envelope path that merges last_message_* into
// chat.details (the connector snapshot doesn't carry those fields).
export const CHAT_BATCH_THRESHOLD = 50;
// Groups above this member count don't auto-create contacts (native default).
export const INDEXING_THRESHOLD = 100;

/** First non-empty string value at `k`, else null. */
export const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/** Numeric value at `k`, else null. */
export const num = (d: Data, k: string): number | null => (typeof d[k] === "number" ? d[k] : null);

/** Boolean value at `k` (numbers coerce: 0→false, else true), else null. */
export const boolFlag = (d: Data, k: string): boolean | null => {
  const v = d[k];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return null;
};

/** chat_id rendered as a string ("" when absent). */
export const chatIdStr = (d: Data): string => {
  const v = d.chat_id;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
};

/** chat_id as a string key, or null when the payload carries no usable chat id. */
export const chatIdOrNull = (d: Data): string | null => {
  const s = chatIdStr(d);
  return s.length > 0 ? s : null;
};

// http(s) URLs in free text, trailing punctuation trimmed.
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Extract http(s) URLs from free text, trimming trailing punctuation. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    out.push(m[0].replace(/[.,;:!?)\]}>"']+$/, ""));
  }
  return out;
}

/// Map a telegram media_type to a MIME type. Mirrors the host's
/// `media_type_to_mime` (backend/src/services/file/types.rs) so the plugin can
/// build a source-agnostic file_register command (DEC: file.object survives the
/// cutover).
export function mediaTypeToMime(mediaType: string): string {
  switch (mediaType) {
    case "photo":
      return "image/jpeg";
    case "voice":
      return "audio/ogg";
    case "video":
    case "video_note":
    case "animation":
      return "video/mp4";
    case "sticker":
      return "image/webp";
    case "audio":
      return "audio/mpeg";
    case "document":
    default:
      return "application/octet-stream";
  }
}
