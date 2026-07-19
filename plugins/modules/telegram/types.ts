// Shared DTOs for the telegram plugin (backend module + UI). These mirror
// the native module's wire shapes 1:1 (backend/src/modules/telegram/types.rs +
// backend/src/modules/shared.rs) so list/detail output is byte-compatible and
// the existing frontend renders unchanged.

/// One row per chat (telegram.chat), showing the latest message.
/// Mirrors native `TelegramChatListItem`.
export interface TelegramChatListItem {
  schema_id: string;
  entity_id: string;
  chat_id: string;
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
/// which is the message-details facet payload.
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

export interface FacetSummary {
  id: string;
  schema_id: string;
  source: string;
  observed_at: string;
  data: unknown;
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
  facets: FacetSummary[];
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
  kind: string;
  remote_id?: string;
  cursor?: unknown;
  payload: Record<string, unknown>;
  timestamp: string;
}

// chat_id accepts the telegram numeric id (string|number) OR — for messages
// list — an entity_id (chat entity UUID) resolved to chat_id via its facet.
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

// facet schema_id → payload shape (parameterises GraphService writes/reads)
export interface TelegramFacets {
  "telegram.chat.details": Record<string, unknown>;
  "telegram.message.details": Record<string, unknown>;
  "telegram.account.details": Record<string, unknown>;
  "telegram.contact": Record<string, unknown>;
}

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
