import type { FileDetails } from "../types.ts";

/// Serving URL: stored bytes serve via `/files/{entity_id}` (the
/// `GET /files/:entity_id` route, which reads them by `contentHash`); otherwise
/// the `cloud_url` (S3) if set. Stored bytes take precedence.
export function resolveUrl(entityId: string, details: FileDetails): string | null {
  if (details.contentHash !== null && details.contentHash !== undefined) return `/files/${entityId}`;
  if (details.cloud_url !== null && details.cloud_url !== undefined) return details.cloud_url;
  return null;
}

/// Whether the file has retrievable content visible from graph metadata. The
/// host writes `contentHash` once the bytes are in its byte store, on upload or
/// when a download completes, so `contentHash || cloud_url` is authoritative.
export function hasContent(details: FileDetails): boolean {
  return (
    (details.contentHash !== null && details.contentHash !== undefined) ||
    (details.cloud_url !== null && details.cloud_url !== undefined)
  );
}

/// Build a list/get item from the file.details record data + the entity id.
export function itemFromDetails(
  entityId: string,
  details: FileDetails,
): FileDetails & { entity_id: string; url: string | null } {
  return { ...details, entity_id: entityId, url: resolveUrl(entityId, details) };
}
