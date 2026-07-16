// Fixture / replay mode — TS twin of plugins/sources/telegram/src/fixture.rs.
//
// When TELEGRAM_FIXTURE_FILE is set, the connector reads canned chats + messages
// from that JSON file instead of connecting to Telegram. Crucially it runs the
// SAME payload builders live mode does (`envelope.ts`), so fixture-mode envelopes
// are byte-identical to real-mode ones — which is what the host-side ingest test
// verifies.
//
// The fixture check runs BEFORE any credential parsing: fixture mode needs no
// `_meta` at all.
//
// ## Fixture file format (single JSON object)
//
//   {
//     "chats":    [ { "chat_id": 111, "title": "Project X", "type": "group", … } ],
//     "messages": [ { "message_id": 42, "chat_id": 111, "text": "Hi", "date": "…", … } ]
//   }
//
// `magnis.sync.fetch` returns, in chat order, each chat's snapshot envelope
// followed by that chat's message snapshot envelopes (mirroring the in-backend
// bootstrap interleaving). The cursor is the per-chat `last_msg_id` watermark.
// Messages flagged `"live": true` are NOT served by fetch — the listener replays
// them as push notifications.

import { readFileSync } from "node:fs";
import type { TgChat, TgMessage } from "./envelope";
import {
  chatEnvelope,
  messageEnvelope,
  messagePayload,
  messageRemoteId,
  toRfc3339Utc,
} from "./envelope";

/** Path of the active fixture file, or undefined for live mode. */
export function fixturePath(): string | undefined {
  return process.env.TELEGRAM_FIXTURE_FILE;
}

export interface Fixture {
  chats: TgChat[];
  messages: TgMessage[];
}

const EMPTY: Fixture = { chats: [], messages: [] };

/** Apply the Rust serde defaults to one raw fixture message. NOTE `has_media`
 * defaults to TRUE (`#[serde(default = "default_true")]`) so a fixture only needs
 * to set `media_type`; every other field defaults to empty/false. */
function normalizeMessage(raw: Record<string, unknown>): TgMessage {
  const opt = <T>(v: unknown, want: string): T | undefined =>
    typeof v === want ? (v as T) : undefined;
  const senderInfo = raw.sender_info;
  return {
    message_id: Number(raw.message_id),
    chat_id: Number(raw.chat_id),
    text: typeof raw.text === "string" ? raw.text : "",
    date: typeof raw.date === "string" ? raw.date : "",
    is_outgoing: raw.is_outgoing === true,
    ...(opt<string>(raw.chat_title, "string") === undefined
      ? {}
      : { chat_title: raw.chat_title as string }),
    ...(opt<string>(raw.sender_name, "string") === undefined
      ? {}
      : { sender_name: raw.sender_name as string }),
    ...(opt<number>(raw.sender_id, "number") === undefined
      ? {}
      : { sender_id: raw.sender_id as number }),
    ...(opt<number>(raw.reply_to_msg_id, "number") === undefined
      ? {}
      : { reply_to_msg_id: raw.reply_to_msg_id as number }),
    ...(opt<string>(raw.media_type, "string") === undefined
      ? {}
      : { media_type: raw.media_type as string }),
    // serde `default = "default_true"`: absent → true.
    has_media: raw.has_media === undefined ? true : raw.has_media === true,
    ...(opt<string>(raw.file_name, "string") === undefined
      ? {}
      : { file_name: raw.file_name as string }),
    is_pinned: raw.is_pinned === true,
    ...(senderInfo !== null && typeof senderInfo === "object"
      ? { sender_info: senderInfo as TgMessage["sender_info"] }
      : {}),
    account_id: typeof raw.account_id === "string" ? raw.account_id : "",
    live: raw.live === true,
  };
}

/** Apply the Rust serde defaults to one raw fixture chat. `type` is the serde
 * rename of `chat_type`. */
function normalizeChat(raw: Record<string, unknown>): TgChat {
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  return {
    chat_id: Number(raw.chat_id),
    title: typeof raw.title === "string" ? raw.title : "",
    chat_type: typeof raw.type === "string" ? raw.type : "",
    is_pinned: raw.is_pinned === true,
    pin_order: num(raw.pin_order),
    unread_count: num(raw.unread_count),
    unread_mark: raw.unread_mark === true,
    read_inbox_max_id: num(raw.read_inbox_max_id),
    read_outbox_max_id: num(raw.read_outbox_max_id),
    unread_mentions_count: num(raw.unread_mentions_count),
    top_message: num(raw.top_message),
    ...(typeof raw.pts === "number" ? { pts: raw.pts } : {}),
    ...(typeof raw.member_count === "number" ? { member_count: raw.member_count } : {}),
    ...(typeof raw.username === "string" ? { username: raw.username } : {}),
    ...(typeof raw.avatar_url === "string" ? { avatar_url: raw.avatar_url } : {}),
  };
}

/** Load + parse the fixture file. A missing/malformed file yields an EMPTY
 * fixture (logged to stderr) — never an error. */
export function load(): Fixture {
  const path = fixturePath();
  if (path === undefined) return EMPTY;
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    console.error(`magnis-telegram-ts: cannot read TELEGRAM_FIXTURE_FILE ${path}: ${e}`);
    return EMPTY;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`magnis-telegram-ts: malformed TELEGRAM_FIXTURE_FILE ${path}: ${e}`);
    return EMPTY;
  }
  const d = (doc ?? {}) as Record<string, unknown>;
  return {
    chats: Array.isArray(d.chats)
      ? d.chats.map((c) => normalizeChat(c as Record<string, unknown>))
      : [],
    messages: Array.isArray(d.messages)
      ? d.messages.map((m) => normalizeMessage(m as Record<string, unknown>))
      : [],
  };
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Build the `magnis.sync.fetch` result from the fixture — the Sync-Profile
 * shape `{ envelopes, nextCursor, hasMore }` with NO total/discovered.
 *
 * `direction = "forward"` (CatchUp) drops messages at/below the per-chat cursor
 * `last_msg_id`; `"backward"` (or absent) is a Bootstrap page returning
 * everything. */
export function fetchResult(direction: string, cursor: unknown): Record<string, unknown> {
  const fx = load();

  const cursorChats = asObject(asObject(cursor)?.chats);
  const offsetFor = (chatId: number): number => {
    const entry = asObject(cursorChats?.[String(chatId)]);
    const last = entry?.last_msg_id;
    return typeof last === "number" ? last : 0;
  };

  const envelopes: Record<string, unknown>[] = [];
  const nextChats: Record<string, unknown> = {};

  // Interleave: each chat's envelope, then its (filtered) messages — the same
  // ordering the in-backend bootstrap/catch-up emit.
  for (const chat of fx.chats) {
    envelopes.push(chatEnvelope(chat));

    const offset = direction === "forward" ? offsetFor(chat.chat_id) : 0;
    let highest = offset;
    for (const m of fx.messages) {
      if (m.chat_id !== chat.chat_id) continue;
      if (m.live) continue; // live arrivals are pushed via listen, not fetched
      if (direction === "forward" && offset > 0 && m.message_id <= offset) continue;
      envelopes.push(messageEnvelope(m, "snapshot"));
      if (m.message_id > highest) highest = m.message_id;
    }
    if (highest > 0) nextChats[String(chat.chat_id)] = { last_msg_id: highest };
  }

  // Messages whose chat has no fixture entry: still serve them (cursor too) so a
  // minimal fixture (messages only) works.
  const chatIds = new Set(fx.chats.map((c) => c.chat_id));
  const orphanHigh = new Map<number, number>();
  for (const m of fx.messages) {
    if (chatIds.has(m.chat_id)) continue;
    if (m.live) continue;
    const offset = direction === "forward" ? offsetFor(m.chat_id) : 0;
    if (direction === "forward" && offset > 0 && m.message_id <= offset) continue;
    envelopes.push(messageEnvelope(m, "snapshot"));
    const entry = orphanHigh.get(m.chat_id) ?? offset;
    if (m.message_id > entry) orphanHigh.set(m.chat_id, m.message_id);
    else orphanHigh.set(m.chat_id, entry);
  }
  for (const [chatId, high] of orphanHigh) {
    if (high > 0) nextChats[String(chatId)] = { last_msg_id: high };
  }

  const nextCursor =
    Object.keys(nextChats).length === 0
      ? null
      : { date: toRfc3339Utc(new Date()), chats: nextChats };

  return { envelopes, nextCursor, hasMore: false };
}

/** Live messages (`"live": true`) to replay as `notifications/magnis/envelope`
 * after a listen ack. Each is `(payload, remote_id)` — the exact shape the host's
 * `parse_push_params` reads. */
export function livePushes(): { payload: Record<string, unknown>; remote_id: string }[] {
  return load()
    .messages.filter((m) => m.live)
    .map((m) => ({
      payload: messagePayload(m),
      remote_id: messageRemoteId(m.chat_id, m.message_id),
    }));
}

/** A deterministic-enough synthetic message id for fixture sends. Negative so it
 * never collides with a real Telegram id. */
export function fixtureMessageId(): number {
  return -(Math.abs(Date.now()) % 1_000_000_000);
}

/** Fixture-mode `magnis.execute`: no live send — echo the action back so a
 * caller can assert the connector accepted and routed it. */
export function executeResult(args: Record<string, unknown>): Record<string, unknown> {
  const action = typeof args.action === "string" ? args.action : "";
  switch (action) {
    case "send_message":
    case "reply":
      return {
        message_id: fixtureMessageId(),
        chat_id: args.chat_id ?? null,
        text: args.text ?? null,
        schema_id: "telegram.message",
        recorded: true,
        action,
      };
    case "backfill_chat":
      return { envelopes: [], recorded: true, action: "backfill_chat" };
    case "download_file":
      return {
        local_path: args.dest ?? null,
        size_bytes: 0,
        recorded: true,
        action: "download_file",
      };
    default:
      return { recorded: true, action };
  }
}
