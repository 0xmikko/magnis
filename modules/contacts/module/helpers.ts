// Contacts plugin helpers — mirror the legacy Rust contacts service
// (compute_initials, pick_avatar_color, detect_channels) so list/detail
// output matches pre-migration.

import type { Entity, JsonObject, JsonValue } from "@magnis/sdk";
import type { ContactListItem } from "../types.ts";

const AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];

/// Max contacts.person entities folded into one applyBatch (mirrors email's
/// INGEST_CHUNK). A whole sync page is sliced into chunks so the lone PGlite
/// connection is freed between transactions.
export const INGEST_CHUNK = 200;

// Handles are stored bare: no leading `@`, trimmed. The sync scheduler builds
// the tracked-handle set from these; the connectors query the platform APIs by
// bare handle.
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

export function computeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function pickAvatarColor(id: string): string {
  const first = id.replace(/-/g, "").slice(0, 2);
  const hash = parseInt(first, 16);
  const idx = Number.isFinite(hash) ? hash % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  if (color === undefined) throw new Error("pickAvatarColor: AVATAR_COLORS is empty");
  return color;
}


/// The hub's channels, read off its `identity` edges (S6): a channel IS a
/// node the hub reaches, so the edge set is the answer — no schema-id
/// sniffing, and a channel the hub never linked cannot appear.
function dictString(dict: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = dict[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function channelsOf(identityNeighbours: readonly Entity[]): string[] {
  const out = new Set<string>();
  for (const n of identityNeighbours) {
    if (n.schemaId === "email.address") out.add("Email");
    else if (n.schemaId.startsWith("telegram.")) out.add("Telegram");
    else if (n.schemaId === "x.profile") out.add("X");
    else if (n.schemaId === "linkedin.profile") out.add("LinkedIn");
  }
  return [...out].sort();
}

// Pure list-item shaping from an entity and its `identity` neighbours. S6:
// name, phone, role and company come from the hub's own DICTIONARY (one
// writer, nothing to arbitrate); the email is the address node an identity
// edge reaches. The hot list path batches the edges — no per-row graph access.
export function buildListItem(
  entity: Entity,
  identityNeighbours: readonly Entity[],
): ContactListItem {
  const dict = entity.properties as Record<string, unknown>;
  const name =
    entity.name && entity.name.length > 0 ? entity.name : (dictString(dict, "name") ?? "Unknown");
  const address = identityNeighbours.find((n) => n.schemaId === "email.address");
  const phones = dict.phones;
  const phone = Array.isArray(phones)
    ? (phones
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).phone : null))
        .find((v): v is string => typeof v === "string" && v.length > 0) ?? null)
    : null;
  return {
    id: entity.id,
    schema_id: entity.schemaId,
    name,
    email: address ? (dictString(address.properties as Record<string, unknown>, "address") ?? address.name) : null,
    phone,
    role: dictString(dict, "role"),
    company: dictString(dict, "company"),
    channels: channelsOf(identityNeighbours),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    // The telegram relevance tier went with the archive that held it: the
    // fold moved every other card field into a dictionary and left the tier
    // without a destination, so nothing has written it since.
    relevance_tier: null,
    created_at: entity.createdAt,
    is_pinned: entity.isPinned,
  };
}

/** The keys of a Google payload a replica keeps. */
const REPLICA_KEYS = [
  "resource_name",
  "etag",
  "display_name",
  "given_name",
  "family_name",
  "emails",
  "phones",
  "organizations",
  "photo_url",
  "external_url",
] as const;

/** The google replica's dictionary (S3, plan §5): the payload's fields as
 * last synced, verbatim — including resource_name + etag (the write-back
 * base). Empty fields stay out, and so does the hashed legacy id (it is the
 * node's external id). */
export function replicaDict(payload: JsonObject): JsonObject {
  const d: Record<string, JsonValue> = {};
  for (const key of REPLICA_KEYS) {
    const value = payload[key];
    if (value === undefined) continue;
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) d[key] = value;
  }
  return d;
}

/** The card's channel badges, composed (S3 §5.1 / S6): an email channel when
 * an address node is linked, a phone channel from the composed phone section,
 * x / linkedin from the hub's tracking entries, and every replica the hub
 * reaches over `identity` — telegram included, now that the account replica
 * exists. Nothing reads a schema id to guess a channel any more. */
export function composeChannels(
  curated: Record<string, unknown>,
  hasEmail: boolean,
  replicas: { schema_id: string }[],
): string[] {
  const channels = new Set<string>();
  if (hasEmail) channels.add("email");
  if (Array.isArray(curated.phones) && curated.phones.length > 0) channels.add("phone");
  for (const r of replicas) {
    if (r.schema_id === "contacts.google_contact") channels.add("google");
    else if (r.schema_id.startsWith("telegram.")) channels.add("telegram");
    else if (r.schema_id === "x.profile") channels.add("x");
    else if (r.schema_id === "linkedin.profile") channels.add("linkedin");
  }
  if (Array.isArray(curated.tracking)) {
    for (const t of curated.tracking as { platform?: unknown; enabled?: unknown }[]) {
      if (t.enabled === true && typeof t.platform === "string") channels.add(t.platform);
    }
  }
  return [...channels].sort();
}
