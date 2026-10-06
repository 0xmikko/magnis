// Remote-id builders for the `telegram` surface — the idempotency keys the
// `telegram` module ingest dedups on. Twins of the Rust connector's
// `format!("tg:msg:{}:{}", …)` / `format!("tg:chat:{}", …)`.

/** `remote_id` for a message envelope — `tg:msg:{chat_id}:{message_id}`. */
export function messageRemoteId(chatId: number, messageId: number): string {
  return `tg:msg:${String(chatId)}:${String(messageId)}`;
}

/** `remote_id` for a chat envelope — `tg:chat:{chat_id}`. */
export function chatRemoteId(chatId: number): string {
  return `tg:chat:${String(chatId)}`;
}
