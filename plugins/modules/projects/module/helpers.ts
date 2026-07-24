import type { RawEntity } from "@magnis/plugin-sdk";
import type { LinkedEntitySummary, ProjectCanonical, ProjectListItem } from "../types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `s` is a hyphenated UUID accepted as a project `client_id`. */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Entity `created_at`, falling back to the epoch when absent (native parity). */
export function entityCreatedAt(e: RawEntity & { created_at?: string }): string {
  return e.created_at ?? new Date(0).toISOString();
}

/** Shape a link neighbour into the detail-view summary (native parity). */
export function linkSummary(
  e: { id: string; schema_id: string; name: string },
  kind: string,
): LinkedEntitySummary {
  return {
    id: e.id,
    name: e.name && e.name.length > 0 ? e.name : null,
    schema_id: e.schema_id,
    link_kind: kind,
    created_at: entityCreatedAt(e),
    data: null,
  };
}

export function canonicalString(
  c: Partial<ProjectCanonical>,
  key: keyof ProjectCanonical,
): string | null {
  const v = c[key];
  return typeof v === "string" ? v : null;
}

// Mirrors the native ProjectsModuleService list-item shaping
// (service.rs:94-127): name from entity.name or canonical project.name, status
// from canonical project.status. Pure — reads the CANONICAL map (project.* are
// single_aligned, resolved by confidence→recency, so a window's latest facet
// would not reproduce it). The per-page canonical map is fetched in one
// list_canonical_for_entities batch — no per-row N+1.
export function buildProjectListItem(
  entity: RawEntity & { created_at?: string; is_pinned?: boolean | null },
  canonical: Partial<ProjectCanonical>,
): ProjectListItem {
  const name =
    entity.name && entity.name.length > 0
      ? entity.name
      : (canonicalString(canonical, "project.name") ?? "Untitled Project");
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    name,
    status: canonicalString(canonical, "project.status"),
    created_at: entity.created_at ?? new Date(0).toISOString(),
    is_pinned: entity.is_pinned ?? null,
  };
}
