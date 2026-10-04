// Shared schema→type maps for the email plugin (single source of truth for
// module/service.ts + ui/). Record schema_id → payload type; canonical key → value.
import type { RawSyncableEntity } from "@magnis/plugin-sdk";
import type { LinkedEntitySummary } from "@magnis/sdk";

/** One stored message record — the provider's dictionary MINUS what edges
 * carry: the recipients are `sent_to`, the sender's address is `authored_by`,
 * the attachments are `file.attachment`. `entities.ts` declares exactly this
 * and the build proves the two are one type. */
export interface EmailMessageDetails {
  message_id?: string;
  subject?: string | null;
  from_address?: string | null;
  from_name?: string | null;
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
}

export interface EmailAddressDetails {
  address: string;
  display_name?: string | null;
}

/** Record schema_id → payload type (parameterizes GraphService). */

/** Canonical key → value (parameterizes GraphService). */
export interface EmailCanonical {
  "email.message.sender": string | null;
  "email.message.subject": string | null;
  "email.message.preview": string | null;
  "email.message.body": string | null;
  "email.message.sender_name": string | null;
  "email.address.canonical": string;
}

// ── Read-surface DTOs — what email.list / email.get answer, declared once
// for module/ and ui/. The linked summaries inside them are the SDK's.

export interface MessageListItem {
  id: string;
  schemaId: string;
  sender: string | null;
  subject: string | null;
  preview: string | null;
  channel: string;
  timestamp: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface MessageDetailView {
  senderSync: Pick<RawSyncableEntity, "id" | "syncEnabled" | "syncRevision"> | null;
  id: string;
  schemaId: string;
  sender: string | null;
  subject: string | null;
  body: string | null;
  channel: string;
  timestamp: string;
  canonical: Record<string, unknown>;
  linkedEntities: LinkedEntitySummary[];
  createdAt: string;
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
