// Companies plugin — helpers shared inside module/.
//
// Mirrors the legacy Rust `modules/shared::{compute_initials,
// pick_avatar_color}` so avatar colours and initials match what users
// saw before the migration.

import type { RawEntity } from "@magnis/plugin-sdk";
import type { CompanyCanonical, CompanyListItem } from "../types.ts";

const AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];

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

function canonicalString(map: Partial<CompanyCanonical>, key: keyof CompanyCanonical): string | null {
  const v = map[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Pure list-item shaping from an entity + its CANONICAL map. List fields read
// canonical (not the latest render facet): companies.* are single_aligned, which
// resolves by confidence then recency (core/canonical.rs), so a lower-confidence
// newer facet must NOT win — only canonical reproduces staging's values. The
// per-page canonical map is fetched in one list_canonical_for_entities batch, so
// there is no per-row N+1. `created_at` now comes from the real entity column
// instead of the old `new Date(0)` stub.
export function buildListItem(
  entity: RawEntity & { created_at?: string },
  canonical: Partial<CompanyCanonical>,
): CompanyListItem {
  const name =
    entity.name && entity.name.length > 0
      ? entity.name
      : (canonicalString(canonical, "companies.name") ?? "Unknown");
  return {
    id: entity.id,
    name,
    website: canonicalString(canonical, "companies.website"),
    industry: canonicalString(canonical, "companies.industry"),
    size: canonicalString(canonical, "companies.size"),
    location: canonicalString(canonical, "companies.location"),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    created_at: entity.created_at ?? new Date(0).toISOString(),
  };
}
