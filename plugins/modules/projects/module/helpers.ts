import type { RawEntity } from "@magnis/plugin-sdk";
import type { ProjectCanonical, ProjectListItem } from "../types/index.ts";

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
