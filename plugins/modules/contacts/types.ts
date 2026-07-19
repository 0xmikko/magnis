// Shared DTOs for the contacts plugin — wire shapes the host frontend
// consumes. Mirrors the legacy Rust contacts ContactListItem /
// ContactDetailView 1:1.

import type { FacetRecord } from "@magnis/plugin-sdk";

export interface ContactListItem {
  id: string;
  schema_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  channels: string[];
  avatar_color: string;
  initials: string;
  relevance_tier?: string | null;
  created_at: string;
  is_pinned?: boolean | null;
}

export interface LinkedEntitySummary {
  id: string;
  name: string | null;
  schema_id: string;
  link_kind: string;
  created_at: string;
  data: unknown;
}

export interface ContactDetailView {
  id: string;
  schema_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  channels: string[];
  avatar_color: string;
  initials: string;
  canonical: Partial<ContactCanonical>;
  facets: FacetRecord[];
  linked_entities: LinkedEntitySummary[];
  created_at: string;
}

// ── schema → type maps that parameterise GraphService ──────────────
// Payloads mirror the native contacts handler exactly
// (contacts/controller.rs:99,114,130 + schemas.rs).
export interface ContactFacets {
  "contacts.person.profile": {
    first_name?: string;
    last_name?: string;
    username?: string;
    relevance_tier?: string;
  };
  "contacts.person.email": { email: string; is_primary?: boolean; type?: string };
  "contacts.person.phone": { phone: string; is_primary?: boolean; type?: string };
  "contacts.person.social": SocialTracking;
}

// contacts.person.social facet (DEC-9): per-person opt-in for social tracking.
// `contacts` OWNS this facet; the `social` plugin soft-reads it, and the sync
// scheduler builds the tracked-handle set (DEC-8/INV-1) from it. One handle per
// platform per person; handles are stored bare (no leading `@`).
export interface SocialTracking {
  tracked_x?: boolean;
  x_handle?: string;
  tracked_linkedin?: boolean;
  linkedin_handle?: string;
}

// contacts.set_social_tracking — opt a contact in/out of tracking on one
// platform, optionally setting/updating the handle.
export interface SetSocialTrackingParams {
  id: string;
  platform: "x" | "linkedin";
  tracked: boolean;
  handle?: string;
}

// contacts.get_social_tracking_by_handle (social-post-rendering DEC-A):
// resolve the owning contact + tracked state from a platform handle. Handles
// compare case-insensitively (stored = user-typed, profile = API-canonical).
export interface GetSocialTrackingByHandleParams {
  platform: "x" | "linkedin";
  handle: string;
}
export interface SocialTrackingByHandle {
  contact_id: string;
  tracked: boolean;
  handle: string;
}

// contacts.track_social_profile (social-contact-identity DEC-2): "+"/agent
// entry — URL or handle in, tracked contact out (find-or-create).
export interface TrackSocialProfileParams {
  platform: "x" | "linkedin";
  url_or_handle: string;
  name?: string;
}
export interface TrackSocialProfileResult {
  contact_id: string;
  handle: string;
  created: boolean;
}

// contacts.batch_track_social (DEC-3): agent batch — a pasted URL list in,
// tracked contacts out. Per-row isolation + client_id idempotency (INV-5).
export interface BatchTrackSocialParams {
  platform: "x" | "linkedin";
  profiles: { url_or_handle: string; name?: string }[];
  client_id?: string;
  excluded_indices?: number[];
}
export type BatchTrackSocialStatus = "tracked" | "created" | "invalid_url" | "excluded";
export interface BatchTrackSocialRow {
  contact_id: string | null;
  handle: string | null;
  url_or_handle: string;
  status: BatchTrackSocialStatus;
}
export interface BatchTrackSocialResult {
  results: BatchTrackSocialRow[];
  total: number;
  created: number;
  excluded: number;
}

// contacts.rename_if_placeholder (DEC-4, INV-7): compare-and-set rename.
export interface RenameIfPlaceholderParams {
  id: string;
  expected_name: string;
  new_name: string;
}

// contacts.create input. `client_id` is the frontend-only optimistic-
// create UUID (DEC-11) — kept out of the agent-facing tool schema.
export interface CreateParams {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  client_id?: string;
}

// contacts.update — native only updates the name (controller.rs:562).
export interface UpdateParams {
  id: string;
  name?: string;
}

// contacts.search — agent tool returning an MCP ToolResult of
// SearchResultItem[] (shared::search_entities, shared.rs:447).
export interface SearchParams {
  query?: string;
  context?: string;
  limit?: number;
}
export interface SearchResultItem {
  id: string;
  name: string | null;
  schema_id: string;
  schema_version: number;
}
export interface ToolResult {
  content: { type: "text"; text: string }[];
}

// contacts.merge / merge_preview — mirror the native handlers
// (controller.rs:631,656).
export interface MergePreviewParams {
  survivor_id: string;
  retired_id: string;
}
export interface MergeParams {
  survivor_id: string;
  retired_id: string;
  overrides?: { canonical_key: string; value: unknown }[];
  reason?: string;
}

// contacts.batch_create — mirrors the native handler (controller.rs:469).
export interface BatchCreateContact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
}
export interface BatchCreateParams {
  // batch idempotency key; per-row ids derive as
  // uuid_v5(client_id, `contacts.batch_create:${i}`).
  client_id?: string;
  contacts: BatchCreateContact[];
  excluded_indices?: number[];
}
export interface BatchCreateRow {
  id: string | null;
  name: string;
  email?: string | null;
  status: "created" | "excluded";
}
export interface BatchCreateResult {
  results: BatchCreateRow[];
  total: number;
  created: number;
  excluded: number;
}

export interface ContactCanonical {
  "person.full_name": string | null;
  "person.first_name": string | null;
  "person.last_name": string | null;
  "person.email": string | null;
  "person.phone": string | null;
  "person.role": string | null;
  "person.company": string | null;
}

// contacts.list optional flag (beyond the standard ListParams).
// By default the list hides Telegram "group"-tier contacts (people known only
// as co-members of a Telegram group, not real contacts). `include_all: true`
// shows every contact, group-tier included.
export interface ContactsListParams {
  limit?: number;
  offset?: number;
  search?: string;
  include_all?: boolean;
}

// ── sync-ingest envelope shapes (@syncHandler "contacts") ──────────
// Internal to the ingest path; the host bridge routes Google People-API
// snapshots to `contacts.__sync__` as these envelopes.

/// A sync envelope routed to the contacts surface by the host bridge.
/// `payload` is a Google connector `Contact` (plugins/sources/google/src/
/// surfaces.rs): { id, display_name, given_name, family_name, emails[],
/// phones[], organizations[], photo_url, external_url }.
export interface ContactsSyncEnvelope {
  source_id?: string;
  surface?: string;
  account_id?: string;
  user_id?: string;
  kind?: string;
  remote_id?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export interface GoogleContactEmail {
  address?: string;
  label?: string | null;
  is_primary?: boolean;
}
export interface GoogleContactPhone {
  number?: string;
  label?: string | null;
  is_primary?: boolean;
}
export interface GoogleContactPayload {
  id?: string;
  display_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  emails?: GoogleContactEmail[];
  phones?: GoogleContactPhone[];
  external_url?: string | null;
}
