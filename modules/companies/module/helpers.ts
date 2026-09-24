// Companies plugin — helpers shared inside module/.
//
// Mirrors the legacy Rust `modules/shared::{compute_initials,
// pick_avatar_color}` so avatar colours and initials match what users
// saw before the migration.

import type { RawEntity } from "@magnis/plugin-sdk";
import type { CompanyListItem } from "../types.ts";

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

function dictString(dict: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = dict[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Pure list-item shaping from an entity and its DICTIONARY. The hub has one
// writer, so there is nothing to arbitrate between: the dict rides the entity
// row the list already fetched — no canonical read, no dictionary hydrate, no
// per-row N+1. `created_at` comes from the real entity column.
export function buildListItem(entity: RawEntity & { created_at?: string }): CompanyListItem {
  const dict = entity.properties ?? {};
  const name =
    entity.name && entity.name.length > 0 ? entity.name : (dictString(dict, "name") ?? "Unknown");
  return {
    id: entity.id,
    name,
    website: dictString(dict, "website"),
    industry: dictString(dict, "industry"),
    size: dictString(dict, "size"),
    location: dictString(dict, "location"),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    created_at: entity.created_at ?? new Date(0).toISOString(),
  };
}
