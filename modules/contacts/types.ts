// Shared DTOs for the contacts plugin — wire shapes the host frontend
// consumes, declared once for module/ and ui/. The SDK shapes inside them
// (the linked summaries) are the SDK's.
import type { LinkedEntitySummary, Syncable } from "@magnis/sdk";

export interface ContactListItem {
  id: string;
  schemaId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  channels: string[];
  avatarColor: string;
  initials: string;
  relevanceTier?: string | null;
  createdAt: string;
  isPinned?: boolean | null;
}

export interface ContactSyncTarget {
  identityId: string;
  schemaId: string;
  name: string | null;
  state:
    | ({ kind: "ready" } & Pick<Syncable, "id" | "syncEnabled" | "syncRevision">)
    | { kind: "unavailable"; message: string };
}

export interface ContactDetailView {
  syncTargets: readonly ContactSyncTarget[];
  id: string;
  schemaId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  channels: string[];
  avatarColor: string;
  initials: string;
  canonical: Partial<ContactCanonical>;
  linkedEntities: LinkedEntitySummary[];
  createdAt: string;
  /** S3 (§5.1): the composed card — the hub's curated dictionary. */
  curated: Record<string, unknown>;
  /** Composed emails: the shared email.address nodes one identity hop away. */
  emails: { id: string; address: string }[];
  /** Composed phones: hub phones[] ∪ replica phones, deduped by normalised
   * value, labeled by origin ("curated" | source id). */
  phones: { phone: string; type?: string | null; origin: string }[];
  /** Source claims: the replica dictionaries one identity hop away, each
   * labeled by its schema (addressbook.card, …). */
  replicas: { id: string; schemaId: string; name: string | null; properties: Record<string, unknown> }[];
}

// ── schema → type maps that parameterise GraphService ──────────────
// Payloads mirror the native contacts handler exactly
// (contacts/controller.rs:99,114,130 + schemas.rs).

// contacts.person.social record: per-person opt-in for social tracking.
// `contacts` OWNS this record; the `social` plugin soft-reads it, and the sync
// scheduler builds the tracked-handle set from it. One handle per
// platform per person; handles are stored bare (no leading `@`).
export interface SocialTracking {
  tracked_x?: boolean;
  x_handle?: string;
  tracked_linkedin?: boolean;
  linkedin_handle?: string;
}

// contacts.get_social_tracking_by_handle:
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

// contacts.rename_if_placeholder: compare-and-set rename.
export interface RenameIfPlaceholderParams {
  id: string;
  expected_name: string;
  new_name: string;
}

// contacts.create input. `client_id` is the frontend-only optimistic-
// create UUID — kept out of the agent-facing tool schema.
export interface CreateParams {
  name: string;
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

// contacts.search — agent tool returning an MCP ToolResult of the SDK
// EntitySearchHit[].
export interface SearchParams {
  query?: string;
  context?: string;
  limit?: number;
}
export interface ToolResult {
  content: { type: "text"; text: string }[];
}

// contacts.batch_create — mirrors the native handler (controller.rs:469).
export interface BatchCreateContact {
  name: string;
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

/** One stored hub record — the curated claims the module writes onto a person,
 * plus the name parts its merge path reads back out of the dictionary.
 * `entities.ts` declares exactly this and the build proves the two are one
 * type. Profile facts are NOT here: they live on the replicas the hub reaches
 * over `identity`. */
export interface PersonDetails {
  description?: string | null;
  role?: string | null;
  company?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phones?: { phone: string; type: string | null; is_primary: boolean }[];
  tracking?: { platform: "x" | "linkedin"; handle?: string | null; enabled: boolean }[];
}

export interface CompleteXSyncMigrationParams {
  contactId: string;
  profileId: string;
  handle: string;
  enabled: boolean;
}
