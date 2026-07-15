// Contacts plugin helpers — mirror the legacy Rust contacts service
// (compute_initials, pick_avatar_color, detect_channels,
// detect_relevance_tier) so list/detail output matches pre-migration.

import type { FacetRecord, RawEntity } from "@magnis/plugin-sdk";
import type { ContactCanonical, ContactListItem } from "../types/index.ts";

const AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];

export function computeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
}

export function pickAvatarColor(id: string): string {
  const first = id.replace(/-/g, "").slice(0, 2);
  const hash = parseInt(first, 16);
  const idx = Number.isFinite(hash) ? hash % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[idx]!;
}

function canonicalString(map: Partial<ContactCanonical>, key: keyof ContactCanonical): string | null {
  const v = map[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/// Relevance tier read directly from facet data (canonical resolution
/// is skipped during bulk ingest), mirroring detect_relevance_tier.
export function detectRelevanceTier(facets: FacetRecord[]): string | null {
  for (const f of facets) {
    const data = f.data as Record<string, unknown> | null;
    const t = data?.["relevance_tier"];
    if (typeof t === "string") return t;
  }
  return null;
}

/// Channels inferred from facet schema_ids, mirroring detect_channels.
export function detectChannels(facets: FacetRecord[]): string[] {
  const out = new Set<string>();
  for (const f of facets) {
    const s = f.schema_id;
    if (s.startsWith("contacts.identity.telegram") || s.startsWith("telegram.")) out.add("Telegram");
    else if (s.startsWith("contacts.identity.email") || s.includes("email")) out.add("Email");
    else if (s.startsWith("contacts.identity.slack")) out.add("Slack");
    else if (s.startsWith("contacts.identity.zoom")) out.add("Zoom");
  }
  return [...out].sort();
}

// Pure list-item shaping from an entity + its canonical map + ALL its facets
// (channels/relevance_tier are read across facet schemas). The hot list/get
// paths fetch canonical (list_canonical_for_entities) and facets
// (list_facets_for_entities) in two batches and pass them here — no per-row
// graph access (graph-read-api adoption). email/phone/role/company come from the
// canonical map (collection-merged for emails/phones), reproduced exactly by
// the batch op, NOT from a latest-facet window.
export function buildListItem(
  entity: RawEntity & { created_at?: string; is_pinned?: boolean | null },
  canonical: Partial<ContactCanonical>,
  facets: FacetRecord[],
): ContactListItem {
  const name =
    entity.name && entity.name.length > 0
      ? entity.name
      : (canonicalString(canonical, "person.full_name") ?? "Unknown");
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    name,
    email: canonicalString(canonical, "person.email"),
    phone: canonicalString(canonical, "person.phone"),
    role: canonicalString(canonical, "person.role"),
    company: canonicalString(canonical, "person.company"),
    channels: detectChannels(facets),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    relevance_tier: detectRelevanceTier(facets),
    created_at: entity.created_at ?? new Date(0).toISOString(),
    is_pinned: entity.is_pinned ?? null,
  };
}
