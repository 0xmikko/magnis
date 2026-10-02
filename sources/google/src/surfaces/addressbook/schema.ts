// Remote-id builder for the `addressbook` surface (Google People connections).
// Encodes the idempotency key the addressbook module ingest dedups on.

/** People connection → stable remote_id (`gpeople:{stable_hash}`), so dedup
 *  survives a display-name change. */
export const contactRemoteId = (stableId: string): string => `gpeople:${stableId}`;
