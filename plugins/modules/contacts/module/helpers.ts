// Contacts plugin helpers — mirror the legacy Rust contacts service
// (compute_initials, pick_avatar_color, detect_channels,
// detect_relevance_tier) so list/detail output matches pre-migration.

import type { FacetRecord, RawEntity } from "@magnis/plugin-sdk";
import type { ContactListItem } from "../types.ts";

const AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];

/// Max contacts.person entities folded into one apply_batch (mirrors email's
/// INGEST_CHUNK). A whole sync page is sliced into chunks so the lone PGlite
/// connection is freed between transactions.
export const INGEST_CHUNK = 200;

// Handles are stored bare: no leading `@`, trimmed. The sync scheduler builds
// the tracked-handle set from these; the connectors query the platform APIs by
// bare handle.
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** observed_at (RFC3339) → epoch ms; unparseable → 0 (never wins a max). */
export function facetTime(f: FacetRecord): number {
  const t = Date.parse(f.observed_at);
  return Number.isNaN(t) ? 0 : t;
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


/// Relevance tier read directly from facet data (canonical resolution
/// is skipped during bulk ingest), mirroring detect_relevance_tier.
export function detectRelevanceTier(facets: FacetRecord[]): string | null {
  for (const f of facets) {
    const data = f.data as Record<string, unknown> | null;
    const t = data?.relevance_tier;
    if (typeof t === "string") return t;
  }
  return null;
}


/// The hub's channels, read off its `identity` edges (S6): a channel IS a
/// node the hub reaches, so the edge set is the answer — no facet schema-id
/// sniffing, and a channel the hub never linked cannot appear.
function dictString(dict: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = dict[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function channelsOf(identityNeighbours: readonly RawEntity[]): string[] {
  const out = new Set<string>();
  for (const n of identityNeighbours) {
    if (n.schema_id === "email.address") out.add("Email");
    else if (n.schema_id.startsWith("telegram.")) out.add("Telegram");
    else if (n.schema_id === "x.profile") out.add("X");
    else if (n.schema_id === "linkedin.profile") out.add("LinkedIn");
  }
  return [...out].sort();
}

// Pure list-item shaping from an entity, its `identity` neighbours and the
// frozen facets that still hold the telegram relevance tier. S6: name, phone,
// role and company come from the hub's own DICTIONARY (one writer, nothing to
// arbitrate); the email is the address node an identity edge reaches. The hot
// list path batches the edges and the tier facets — no per-row graph access.
export function buildListItem(
  entity: RawEntity & { created_at?: string; is_pinned?: boolean | null },
  identityNeighbours: readonly RawEntity[],
  facets: FacetRecord[],
): ContactListItem {
  const dict = entity.properties ?? {};
  const name =
    entity.name && entity.name.length > 0 ? entity.name : (dictString(dict, "name") ?? "Unknown");
  const address = identityNeighbours.find((n) => n.schema_id === "email.address");
  const phones = dict.phones;
  const phone = Array.isArray(phones)
    ? (phones
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).phone : null))
        .find((v): v is string => typeof v === "string" && v.length > 0) ?? null)
    : null;
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    name,
    email: address ? (dictString(address.properties ?? {}, "address") ?? address.name) : null,
    phone,
    role: dictString(dict, "role"),
    company: dictString(dict, "company"),
    channels: channelsOf(identityNeighbours),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    // The telegram relevance tier is the one card field the property graph has
    // no home for yet: it describes how the hub knows a telegram account, and
    // S4 folded the facet that carried it without a destination. Until that
    // lands it is read from the frozen archive, where it still is.
    relevance_tier: detectRelevanceTier(facets),
    created_at: entity.created_at ?? new Date(0).toISOString(),
    is_pinned: entity.is_pinned ?? null,
  };
}

/** The google replica's dictionary (S3, plan §5): the payload's fields as
 * last synced, verbatim — including resource_name + etag (the write-back
 * base). The hashed legacy id stays out (it is the node's anchor). */
export function replicaDict(p: {
  resource_name?: string | null;
  etag?: string | null;
  display_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  emails?: unknown[];
  phones?: unknown[];
  organizations?: unknown[];
  photo_url?: string | null;
  external_url?: string | null;
}): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (p.resource_name) d.resource_name = p.resource_name;
  if (p.etag) d.etag = p.etag;
  if (p.display_name) d.display_name = p.display_name;
  if (p.given_name) d.given_name = p.given_name;
  if (p.family_name) d.family_name = p.family_name;
  if (p.emails && p.emails.length > 0) d.emails = p.emails;
  if (p.phones && p.phones.length > 0) d.phones = p.phones;
  if (p.organizations && p.organizations.length > 0) d.organizations = p.organizations;
  if (p.photo_url) d.photo_url = p.photo_url;
  if (p.external_url) d.external_url = p.external_url;
  return d;
}

/** The card's channel badges, composed (S3 §5.1 / S6): an email channel when
 * an address node is linked, a phone channel from the composed phone section,
 * x / linkedin from the hub's tracking entries, and every replica the hub
 * reaches over `identity` — telegram included, now that the account replica
 * exists. Nothing reads a facet schema id to guess a channel any more. */
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
