// Remote-id builder for the `contacts` surface (the following import as
// social_contact envelopes, plan §7). Encodes the idempotency key (INV-4).

/** Social-contact → stable remote_id (`x:social:{handle}`, lowercased so dedup
 *  survives handle-casing changes). */
export const socialContactRemoteId = (handle: string): string => `x:social:${handle.toLowerCase()}`;
