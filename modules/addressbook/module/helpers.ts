// Address book plugin helpers — pure shaping for the sync ingest.

import type { JsonObject, JsonValue } from "@magnis/sdk";

/// Max cards folded into one applyBatch (mirrors email's INGEST_CHUNK). A
/// whole sync page is sliced into chunks so the lone PGlite connection is
/// freed between transactions.
export const INGEST_CHUNK = 200;

/** The keys of a Google payload a card keeps. */
const REPLICA_KEYS = [
  "resource_name",
  "etag",
  "display_name",
  "given_name",
  "family_name",
  "emails",
  "phones",
  "organizations",
  "photo_url",
  "external_url",
] as const;

/** The card's dictionary: the payload's fields as last synced,
 * verbatim — including resource_name + etag (the write-back base). Empty
 * fields stay out, and so does the hashed legacy id (it is the node's
 * external id). */
export function replicaDict(payload: JsonObject): JsonObject {
  const d: Record<string, JsonValue> = {};
  for (const key of REPLICA_KEYS) {
    const value = payload[key];
    if (value === undefined) continue;
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) d[key] = value;
  }
  return d;
}
