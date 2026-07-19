import type { EntityDetail } from "@magnis/plugin-sdk";
import type { FileDetails } from "../types.ts";

/// Extract a facet's data payload by schema_id from an EntityDetail (or
/// undefined when the entity carries no facet of that schema).
export function facetData(detail: EntityDetail, schemaId: string): Record<string, unknown> | undefined {
  const f = detail.facets.find((x) => x.schema_id === schemaId);
  return f?.data as Record<string, unknown> | undefined;
}

/// Route-correct serving URL (DEC-10): local content serves via
/// `/files/{entity_id}` (the actual `GET /files/:entity_id` route); otherwise the
/// `cloud_url` (S3) if set. Local takes precedence, mirroring native
/// `resolve_url`'s ordering — but native built `/files/{local_path}`, which does
/// NOT match the entity-id route, so we correct it to the entity id.
export function resolveUrl(entityId: string, details: FileDetails): string | null {
  if (details.local_path !== null && details.local_path !== undefined) return `/files/${entityId}`;
  if (details.cloud_url !== null && details.cloud_url !== undefined) return details.cloud_url;
  return null;
}

/// Whether the file has retrievable content visible from graph metadata. The
/// native check also probed `source_ref.dest_subpath` on disk; the V8 plugin has
/// no disk access, and the download worker sets `local_path` via `mark_downloaded`
/// on completion, so `local_path || cloud_url` is authoritative for
/// normally-downloaded files. Inconsistent dest_subpath-only rows are skipped.
export function hasContent(details: FileDetails): boolean {
  return (
    (details.local_path !== null && details.local_path !== undefined) ||
    (details.cloud_url !== null && details.cloud_url !== undefined)
  );
}

/// Build a list/get item from the file.details facet data + the entity id.
export function itemFromDetails(
  entityId: string,
  details: FileDetails,
): FileDetails & { entity_id: string; url: string | null } {
  return { ...details, entity_id: entityId, url: resolveUrl(entityId, details) };
}
