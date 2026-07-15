// Shared schema→type maps for the email plugin (single source of truth for
// module/service.ts + ui/). Facet schema_id → payload type; canonical key → value.

export interface EmailMessageDetails {
  message_id?: string;
  subject?: string | null;
  from_address?: string | null;
  from_name?: string | null;
  to_addresses?: string | null;
  cc_addresses?: string | null;
  bcc_addresses?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  has_html_body?: boolean;
  sent_at?: string | null;
  received_at?: string | null;
  labels?: string[];
  is_read?: boolean;
  is_starred?: boolean;
  is_important?: boolean;
  has_attachments?: boolean;
  thread_id?: string;
  attachments?: { filename: string; mime_type: string; size: number; path: string }[];
}

export interface EmailAddressDetails {
  address: string;
  display_name?: string | null;
}

/** Facet schema_id → payload type (parameterizes GraphService). */
export interface EmailFacets {
  "email.message.details": EmailMessageDetails;
  "email.address.details": EmailAddressDetails;
}

/** Canonical key → value (parameterizes GraphService). */
export interface EmailCanonical {
  "email.message.sender": string | null;
  "email.message.subject": string | null;
  "email.message.preview": string | null;
  "email.message.body": string | null;
  "email.message.sender_name": string | null;
  "email.address.canonical": string;
}

// ── Read-surface DTOs — byte-compatible with the native module's
// MessageListItem / MessageDetailView (and the UI's plugins/email/ui/types.ts
// copies). These cross the RPC boundary, so they must stay structurally
// identical to both sides.

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

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface GetParams {
  id: string;
}

export interface BatchParams {
  ids: string[];
}

export interface SendParams {
  to: string;
  subject: string;
  body_text: string;
  attachment_ids?: string[];
}

export interface ReplyParams {
  email_id: string;
  body_text: string;
  attachment_ids?: string[];
}

export interface BatchSendParams {
  messages: SendParams[];
  excluded_indices?: number[];
}

export interface SetTriggerParams {
  from_addresses?: string[];
  /** legacy single-address form */
  from_address?: string;
  gate_prompt: string;
  action_prompt: string;
  debounce_seconds?: number;
  episode_id?: string;
}

/// One sync envelope as delivered by the host PluginModuleController bridge
/// (1:1 with the Rust SourceEnvelope). `kind` is "snapshot" | "live" | "delete".
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

/// A trigger.check event the host bridge forwards to the event_bus for LIVE
/// emails (mirrors native ingest's `new_email` event). Snapshot/backfill
/// ingests emit none.
export interface EmailTriggerCheck {
  type: "trigger.check";
  event_kind: "new_email";
  schema_id: "email.message";
  entity_id: string;
  phase: "live";
  touched_entity_ids: string[];
  user_id: string;
  context: { from_address: string | null; from_name: string | null; subject: string | null };
}
