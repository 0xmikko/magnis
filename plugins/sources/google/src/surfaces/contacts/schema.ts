// Remote-id builder for the `contacts` surface (Google People connections).
// Encodes the idempotency key the contacts module ingest dedups on.

/** People connection → stable remote_id (`gpeople:{stable_hash}`), so dedup
 *  survives a display-name change. */
export const contactRemoteId = (stableId: string): string => `gpeople:${stableId}`;
