// Shared DTOs for the telegram plugin (backend module + UI). These mirror
// the native module's wire shapes 1:1 (backend/src/modules/telegram/types.rs +
// backend/src/modules/shared.rs) so list/detail output is byte-compatible and
// the existing frontend renders unchanged.

/// One row per chat (telegram.chat), showing the latest message.
/// Mirrors native `TelegramChatListItem`.
/** One stored chat record — the connector's dictionary minus what ONE account
 * observes (unread counts and pins ride the observed_in edge) plus the last-
 * message fields the module carries forward. `entities.ts` declares exactly
 * this and the build proves the two are one type. */
export interface TelegramChatDetails {
  chat_id?: number;
  title?: string;
  type?: string;
  username?: string;
  avatar_url?: string;
  member_count?: number;
  message_count?: number;
  is_indexed?: boolean;
  read_inbox_max_id?: number;
  read_outbox_max_id?: number;
  unread_mentions_count?: number;
  top_message?: number;
  pts?: number;
  last_message_date?: string;
  last_message_preview?: string;
  last_sender_name?: string;
}

/** One stored message record — the connector's dictionary minus what edges
 * carry: the chat is an in_chat edge, the sender an authored_by edge. */
export interface TelegramMessageDetails {
  message_id?: number;
  text?: string;
  date?: string;
  is_outgoing?: boolean;
  chat_title?: string;
  reply_to_msg_id?: number;
  media_type?: string;
  has_media?: boolean;
  file_name?: string;
  is_pinned?: boolean;
  source_ref?: {
    account_id?: string;
    chat_id?: number;
    message_id?: number;
    media_type?: string;
    dest_subpath?: string;
  };
  sender_info?: {
    first_name?: string;
    last_name?: string;
    username?: string;
    phone?: string;
  };
}

/** One stored account record — the identity the module mints for a sender. */
export interface TelegramAccountDetails {
  telegram_user_id?: number;
  is_self?: boolean;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  phone?: string;
}

export interface TelegramChatListItem {
  schema_id: string;
  entity_id: string;
  chat_id: string;
  /** Exact Source account whose observed-in edge made this row actionable. */
  account_id: string | null;
  chat_title: string | null;
  last_message: string | null;
  last_message_time: string | null;
  last_message_sender: string | null;
  is_outgoing: boolean | null;
  message_count: number | null;
  avatar_url: string | null;
  is_pinned: boolean | null;
  pin_order: number | null;
  is_indexed: boolean | null;
  // Inlined messages for the top chats (page 0 only) — frontend cache seed.
  messages?: PaginatedResponse<MessageListItem>;
}

/// Generic message list item shared by telegram/email. Mirrors native
/// `MessageListItem` (backend/src/modules/shared.rs). Telegram-specific
/// fields (chat_id, message_id, text, sender_id, …) ride in `metadata`,
/// which is the message-details record payload.
export interface MessageListItem {
  id: string;
  schema_id: string;
  sender: string | null;
  subject: string | null;
  preview: string | null;
  channel: string;
  timestamp: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}


export interface LinkedEntitySummary {
  id: string;
  name: string | null;
  schema_id: string;
  link_kind: string;
  created_at: string;
  data?: Record<string, unknown> | null;
}

/// Message detail view. Mirrors native `MessageDetailView`.
export interface MessageDetailView {
  id: string;
  schema_id: string;
  sender: string | null;
  subject: string | null;
  body: string | null;
  channel: string;
  timestamp: string;
  canonical: Record<string, unknown>;
  linked_entities: LinkedEntitySummary[];
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/// A sync event from a source connector. Mirrors the Rust `SourceEnvelope`
/// (serde snake_case; `kind` is "snapshot"|"live"|"delete"|…). `user_id` is
/// injected host-side; the ingest handler's graph writes are owner-scoped by
/// the dispatch context, not by this field.
export interface SyncEnvelope {
  source_id: string;
  surface: string;
  account_id: string;
  user_id: string;
  /** S4: the provider-verified identity that observed this envelope —
   * stamped HOST-side from the account row's ProbeAuth subject. The
   * telegram ingest refuses envelopes without it (identity-scoped data). */
  identity_key?: string;
  kind: string;
  remote_id?: string;
  cursor?: unknown;
  payload: Record<string, unknown>;
  timestamp: string;
}

// chat_id accepts the telegram numeric id (string|number) OR — for messages
// list — an entity_id (chat entity UUID) resolved to chat_id via its record.
export interface ChatsListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface MessagesListParams {
  chat_id?: number | string;
  entity_id?: string;
  limit?: number;
  offset?: number;
}

export interface GetParams {
  id: string;
}

export interface SetIndexedParams {
  chat_id: number | string;
  is_indexed: boolean;
}

export interface SendParams {
  chat_id: number | string;
  text: string;
  reply_to_message_id?: number;
  account_id?: string;
}

export interface ReplyParams {
  chat_id: number | string;
  reply_to_message_id: number;
  text: string;
  account_id?: string;
}

export interface BatchSendMessage {
  chat_id: number | string;
  text: string;
  reply_to_message_id?: number;
  /** Recipient display name for the approval card's "To:" (so the user sees who,
   *  not a raw chat_id). Display-only — not used for delivery. */
  chat_name?: string;
}

export interface BatchSendParams {
  messages: BatchSendMessage[];
  account_id?: string;
  /** Recipient indices the user excluded in the approval card; skipped on send. */
  excluded_indices?: number[];
}

export interface BackfillParams {
  chat_id: number | string;
  before_message_id?: number;
  limit?: number;
  account_id?: string;
}

export interface SetTriggerParams {
  chat_id: number;
  gate_prompt: string;
  action_prompt: string;
  debounce_seconds?: number;
  episode_id?: string;
}

// record schema_id → payload shape (parameterises GraphService writes/reads)

export interface TelegramCanonical {
  "telegram.chat.title": string;
  "telegram.message.text": string;
  "telegram.message.sender": string;
}

/// A trigger.check event the host PluginModuleController bridge forwards to the
/// event_bus for LIVE messages (mirrors native ingest.rs). The trigger
/// evaluator consumes it; bulk Snapshot/backfill ingests never emit one.
export interface TriggerCheck {
  type: "trigger.check";
  event_kind: "new_message";
  schema_id: string;
  entity_id: string;
  phase: "live";
  touched_entity_ids: string[];
  user_id: string;
  context: { text: string; sender_name: string };
}
