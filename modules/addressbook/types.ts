// Shared shapes for the address book plugin: the sync envelope the host routes
// to `addressbook.__sync__`, the Google connector payload it carries, and the
// card record the ingest stores.

/** One stored card record — exactly what `replicaDict` writes. The payload
 * type below is the connector's INPUT; this is what lands in the graph.
 * `entities.ts` declares exactly this and the build proves the two are one
 * type. */
export interface CardRecord {
  source_id?: string;
  account_id?: string;
  sync_pass?: string;
  resource_name?: string;
  etag?: string;
  display_name?: string;
  given_name?: string;
  family_name?: string;
  emails?: GoogleContactEmail[];
  phones?: GoogleContactPhone[];
  organizations?: { name?: string | null; title?: string | null; is_current?: boolean }[];
  photo_url?: string;
  external_url?: string;
}

export interface GoogleContactEmail {
  address?: string;
  label?: string | null;
  is_primary?: boolean;
}
export interface GoogleContactPhone {
  number?: string;
  label?: string | null;
  is_primary?: boolean;
}
export interface GoogleContactPayload {
  id?: string;
  /** Verbatim People API identity — the card's write-back base. */
  resource_name?: string | null;
  /** Verbatim optimistic-concurrency tag. */
  etag?: string | null;
  display_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  emails?: GoogleContactEmail[];
  phones?: GoogleContactPhone[];
  organizations?: { name?: string | null; title?: string | null; is_current?: boolean }[];
  photo_url?: string | null;
  external_url?: string | null;
}
