// Canonical envelope shaping — the telegram subset of the real connector's
// `envelope.rs`: the fields a mock needs to drive the UI. `remote_id` shapes are
// byte-identical to the real `telegram` connector. Ported 1:1 from the Rust
// `build_chat` / `build_message`.

import { readItems, SURFACE } from "./store";

type Json = Record<string, unknown>;

function int(v: unknown): number | undefined {
  // Rust `Value::as_i64` — only JSON integers, never strings or floats.
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function chatRemoteId(chatId: number): string {
  return `tg:chat:${String(chatId)}`;
}

export function messageRemoteId(chatId: number, messageId: number): string {
  return `tg:msg:${String(chatId)}:${String(messageId)}`;
}

/** Canonical chat payload + remote_id. `null` when chat_id is missing/non-integer. */
export function buildChat(req: Json): { payload: Json; remoteId: string } | null {
  const chatId = int(req.chat_id);
  if (chatId === undefined) return null;
  const rawTitle = str(req.title) ?? "";
  const payload: Json = {
    entity_type: "telegram_chat",
    chat_id: chatId,
    title: rawTitle === "" ? `Chat ${String(chatId)}` : rawTitle,
    type: str(req.type) ?? "private",
    is_pinned: bool(req.is_pinned, false),
    // Rust reads pin_order as u64 (negatives fall back to 0), the rest as i64.
    pin_order: typeof req.pin_order === "number" && Number.isInteger(req.pin_order) && req.pin_order >= 0 ? req.pin_order : 0,
    unread_count: int(req.unread_count) ?? 0,
    unread_mark: bool(req.unread_mark, false),
    read_inbox_max_id: int(req.read_inbox_max_id) ?? 0,
    read_outbox_max_id: int(req.read_outbox_max_id) ?? 0,
    unread_mentions_count: int(req.unread_mentions_count) ?? 0,
    top_message: int(req.top_message) ?? 0,
  };
  const memberCount = int(req.member_count);
  if (memberCount !== undefined) payload.member_count = memberCount;
  const username = str(req.username);
  if (username !== undefined) payload.username = username;
  const avatarUrl = str(req.avatar_url);
  if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;
  return { payload, remoteId: chatRemoteId(chatId) };
}

/** Canonical message payload + remote_id. `message_id` auto-assigns (monotonic
 * across the shared file) when omitted; `date` defaults to now. `null` when
 * chat_id is missing. */
export function buildMessage(req: Json): { payload: Json; remoteId: string } | null {
  const chatId = int(req.chat_id);
  if (chatId === undefined) return null;
  const messageId = int(req.message_id) ?? readItems(SURFACE).length + 1;
  const payload: Json = {
    message_id: messageId,
    chat_id: chatId,
    text: str(req.text) ?? "",
    date: str(req.date) ?? new Date().toISOString(),
    is_outgoing: bool(req.is_outgoing, false),
  };
  const chatTitle = str(req.chat_title);
  if (chatTitle !== undefined) payload.chat_title = chatTitle;
  const senderName = str(req.sender_name);
  if (senderName !== undefined) payload.sender_name = senderName;
  const senderId = int(req.sender_id);
  if (senderId !== undefined) payload.sender_id = senderId;
  const replyTo = int(req.reply_to_msg_id);
  if (replyTo !== undefined) payload.reply_to_msg_id = replyTo;
  return { payload, remoteId: messageRemoteId(chatId, messageId) };
}
