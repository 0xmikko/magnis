// Canonical envelope shaping — TS twin of plugins/sources/telegram/src/envelope.rs.
//
// Both live mode (gramjs `Api.Message` / dialogs) and fixture mode feed a small
// serializable intermediate (`TgMessage` / `TgChat` / `TgSenderInfo`) into the
// SAME payload builders here, so the JSON the host ingests is identical
// regardless of source. The in-core `telegram` module consumes these payloads
// unchanged, so field names, optionality, and `remote_id` / `cursor` shapes MUST
// match the Rust connector exactly.
//
// KEY ORDER NOTE (resolved by reading the Rust): the Rust connector builds these
// payloads with `serde_json::json!` and does NOT enable serde_json's
// `preserve_order` feature — so its `Map` is a `BTreeMap` and the bytes it emits
// are ALPHABETICALLY sorted, not in the source's insertion order. JS objects
// serialize in insertion order instead. Both parse to the SAME object, which is
// what the host consumes (it never byte-compares), so parity holds at the level
// that matters. We follow the Rust SOURCE's insertion order below for
// readability; do not read "byte-identical" as "same key order".

/** Sender details for module-side person-entity creation. */
export interface TgSenderInfo {
  first_name: string;
  last_name?: string;
  username?: string;
  phone?: string;
}

/** One message in canonical (intermediate) form. Live mode fills this from a
 * gramjs message; fixture mode deserializes it from JSON. */
export interface TgMessage {
  message_id: number;
  chat_id: number;
  text: string;
  /** RFC3339 timestamp string (`+00:00` offset form — see `toRfc3339Utc`). */
  date: string;
  is_outgoing: boolean;
  chat_title?: string;
  sender_name?: string;
  sender_id?: number;
  reply_to_msg_id?: number;
  /** `photo` | `video` | `voice` | `audio` | `document` | `sticker` |
   * `unsupported`, etc. Absent when the message has no media. */
  media_type?: string;
  /** True only for actually downloadable media (drives `source_ref`/`file_name`
   * emission). Non-downloadable types (`unsupported`) carry `media_type` but no
   * `source_ref`. Defaults to TRUE when omitted (serde `default_true`), so a
   * fixture only needs to set `media_type`. */
  has_media: boolean;
  /** Original filename, if the document carried one. */
  file_name?: string;
  is_pinned: boolean;
  sender_info?: TgSenderInfo;
  /** Account id stamped into `source_ref` for downloadable media. Live mode
   * passes the real account id; fixtures may omit it (defaults empty). */
  account_id: string;
  /** Marks a fixture message as a live arrival, replayed by the listener as a
   * push notification. Ignored by `magnis.sync.fetch` shaping. */
  live: boolean;
}

/** One chat/dialog in canonical (intermediate) form. */
export interface TgChat {
  chat_id: number;
  title: string;
  /** `private` | `group` | `supergroup`. Serde-renamed to `type` on the wire. */
  chat_type: string;
  is_pinned: boolean;
  pin_order: number;
  unread_count: number;
  unread_mark: boolean;
  read_inbox_max_id: number;
  read_outbox_max_id: number;
  unread_mentions_count: number;
  top_message: number;
  pts?: number;
  member_count?: number;
  username?: string;
  avatar_url?: string;
}

/** Format a Date as the Rust connector does. chrono's `to_rfc3339()` on a
 * `DateTime<Utc>` emits the `+00:00` offset form (NOT the `Z` form
 * `toISOString()` produces) and omits a zero fractional part. Telegram dates are
 * unix SECONDS, so the fraction is always zero in practice. */
export function toRfc3339Utc(d: Date): string {
  return d.toISOString().replace(/\.000Z$/, "Z").replace(/Z$/, "+00:00");
}

/** `remote_id` for a message envelope — twin of `format!("tg:msg:{}:{}", …)`. */
export function messageRemoteId(chatId: number, messageId: number): string {
  return `tg:msg:${chatId}:${messageId}`;
}

/** `remote_id` for a chat envelope — twin of `format!("tg:chat:{}", …)`. */
export function chatRemoteId(chatId: number): string {
  return `tg:chat:${chatId}`;
}

/** Subdirectory under `files/telegram/` for a given Telegram media type. */
export function tgMediaSubdir(mediaType: string): string {
  switch (mediaType) {
    case "photo":
      return "photos";
    case "voice":
      return "voice";
    case "video":
    case "video_note":
    case "animation":
      return "videos";
    case "sticker":
      return "stickers";
    default:
      return "documents";
  }
}

/** File extension for a given Telegram media type. */
export function tgMediaExt(mediaType: string): string {
  switch (mediaType) {
    case "photo":
      return "jpg";
    case "voice":
      return "ogg";
    case "video":
    case "video_note":
    case "animation":
      return "mp4";
    case "sticker":
      return "webp";
    case "audio":
      return "mp3";
    default:
      return "bin";
  }
}

/** Build the canonical message payload. Field set + conditional emission mirror
 * the Rust `message_payload` exactly. */
export function messagePayload(m: TgMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    message_id: m.message_id,
    chat_id: m.chat_id,
    text: m.text,
    date: m.date,
    is_outgoing: m.is_outgoing,
  };

  if (m.chat_title !== undefined) payload.chat_title = m.chat_title;
  if (m.sender_name !== undefined) payload.sender_name = m.sender_name;
  if (m.sender_id !== undefined) payload.sender_id = m.sender_id;
  if (m.reply_to_msg_id !== undefined) payload.reply_to_msg_id = m.reply_to_msg_id;

  if (m.media_type !== undefined) {
    const mt = m.media_type;
    payload.media_type = mt;
    // Only attach source_ref for actually downloadable media. Non-downloadable
    // types (WebPage, Contact, Geo, Poll, …) get media_type for display purposes
    // but no file download attempt.
    if (m.has_media) {
      const subdir = tgMediaSubdir(mt);
      const ext = tgMediaExt(mt);
      payload.source_ref = {
        account_id: m.account_id,
        chat_id: m.chat_id,
        message_id: m.message_id,
        media_type: mt,
        dest_subpath: `telegram/${subdir}/tg_${m.chat_id}_${m.message_id}.${ext}`,
      };
      // Attach the original filename or generate a descriptive one.
      payload.file_name =
        m.file_name !== undefined
          ? m.file_name
          : `${mt}_${m.chat_id}_${m.message_id}.${ext}`;
    }
  }

  // `is_pinned` is emitted ONLY when true (omitted, not `false`).
  if (m.is_pinned) payload.is_pinned = true;

  if (m.sender_info !== undefined) {
    const si = m.sender_info;
    const senderInfo: Record<string, unknown> = { first_name: si.first_name };
    // `!= null` (not `!== undefined`): fixture JSON may carry explicit nulls,
    // which Rust's Option + skip_serializing_if (envelope.rs:19-24) would omit.
    if (si.last_name != null) senderInfo.last_name = si.last_name;
    if (si.username != null) senderInfo.username = si.username;
    if (si.phone != null) senderInfo.phone = si.phone;
    payload.sender_info = senderInfo;
  }

  return payload;
}

/** The per-message cursor: `{ chat_id, message_id }`. */
export function messageCursor(m: TgMessage): Record<string, unknown> {
  return { chat_id: m.chat_id, message_id: m.message_id };
}

/** One message → a wire envelope `{ surface, payload, remote_id, kind, cursor }`. */
export function messageEnvelope(m: TgMessage, kind: string): Record<string, unknown> {
  return {
    surface: "telegram",
    payload: messagePayload(m),
    remote_id: messageRemoteId(m.chat_id, m.message_id),
    kind,
    cursor: messageCursor(m),
  };
}

/** Build the canonical chat payload. */
export function chatPayload(c: TgChat): Record<string, unknown> {
  // Title fallback mirrors the Rust `format!("Chat {}", chat_id)` when empty.
  const title = c.title === "" ? `Chat ${c.chat_id}` : c.title;

  const payload: Record<string, unknown> = {
    entity_type: "telegram_chat",
    chat_id: c.chat_id,
    title,
    type: c.chat_type,
    is_pinned: c.is_pinned,
    pin_order: c.pin_order,
    unread_count: c.unread_count,
    unread_mark: c.unread_mark,
    read_inbox_max_id: c.read_inbox_max_id,
    read_outbox_max_id: c.read_outbox_max_id,
    unread_mentions_count: c.unread_mentions_count,
    top_message: c.top_message,
  };
  if (c.pts !== undefined) payload.pts = c.pts;
  if (c.member_count !== undefined) payload.member_count = c.member_count;
  if (c.username !== undefined) payload.username = c.username;
  if (c.avatar_url !== undefined) payload.avatar_url = c.avatar_url;

  return payload;
}

/** One chat → a wire envelope. Chats are ALWAYS `snapshot` and carry NO cursor
 * field (mirroring the Rust `chat_envelope`). */
export function chatEnvelope(c: TgChat): Record<string, unknown> {
  return {
    surface: "telegram",
    payload: chatPayload(c),
    remote_id: chatRemoteId(c.chat_id),
    kind: "snapshot",
  };
}
