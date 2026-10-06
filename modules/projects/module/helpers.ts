import { linkedEntitySummary } from "@magnis/plugin-sdk";
import type { Entity, Link, LinkedEntitySummary } from "@magnis/sdk";
import type { ProjectCanonical, ProjectListItem } from "../types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `s` is a hyphenated UUID accepted as a project `client_id`. */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Shape a link neighbour into the detail-view summary; an empty name reads
 * as no name (native parity). */
export function linkSummary(e: Entity, link: Link, kind: string): LinkedEntitySummary {
  return { ...linkedEntitySummary(e, link, kind), name: e.name && e.name.length > 0 ? e.name : null };
}

/// S1: project the node's dictionary into the canonical-keyed map the shaping
/// helpers already consume — the seam that let every reader move to the
/// dictionary without reshaping the list item.
export function projectCanonFromProperties(e: Entity): Partial<ProjectCanonical> {
  const p = e.properties as { name?: unknown; status?: unknown };
  const out: Record<string, unknown> = {};
  if (typeof p.name === "string") out["project.name"] = p.name;
  if (typeof p.status === "string") out["project.status"] = p.status;
  return out;
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
// single_aligned, resolved by confidence→recency, so a window's latest record
// would not reproduce it). The per-page canonical map is fetched in one
// list_canonical_for_entities batch — no per-row N+1.
export function buildProjectListItem(
  entity: Entity,
  canonical: Partial<ProjectCanonical>,
): ProjectListItem {
  const name =
    entity.name && entity.name.length > 0
      ? entity.name
      : (canonicalString(canonical, "project.name") ?? "Untitled Project");
  return {
    id: entity.id,
    schemaId: entity.schemaId,
    name,
    status: canonicalString(canonical, "project.status"),
    createdAt: entity.createdAt,
    isPinned: entity.isPinned,
  };
}
