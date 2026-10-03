// Address book plugin helpers — pure shaping for the sync ingest.

/// Max cards folded into one apply_batch (mirrors email's INGEST_CHUNK). A
/// whole sync page is sliced into chunks so the lone PGlite connection is
/// freed between transactions.
export const INGEST_CHUNK = 200;

/** The card's dictionary: the payload's fields as last synced,
 * verbatim — including resource_name + etag (the write-back base). The hashed
 * legacy id stays out (it is the node's anchor). */
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
