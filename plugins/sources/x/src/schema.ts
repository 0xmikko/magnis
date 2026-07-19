// x connector — surface set + remote-id scheme, in one place. The remote-id
// builders encode the idempotency keys (INV-4) the x module ingest dedups on;
// they were inline template literals in fetch.ts / contacts.ts. `PLATFORM` is
// the payload platform tag; the SURFACE_* consts are the wire surface names
// (advertised in initialize, routed in the fetch switch).

/** Payload platform tag (`payload.platform`). */
export const PLATFORM = "x";

/** Wire surface: tracked profiles + their recent posts. */
export const SURFACE_X = "x";
/** Wire surface: the following import as social_contact envelopes (plan §7). */
export const SURFACE_CONTACTS = "contacts";

/** Profile entity → stable remote_id (`x:profile:{user_id}`). */
export const profileRemoteId = (userId: string): string => `x:profile:${userId}`;
/** Post entity → stable remote_id (`x:post:{tweet_id}`). */
export const postRemoteId = (tweetId: string): string => `x:post:${tweetId}`;
/** Social-contact → stable remote_id (`x:social:{handle}`, lowercased so dedup
 *  survives handle-casing changes). */
export const socialContactRemoteId = (handle: string): string => `x:social:${handle.toLowerCase()}`;
