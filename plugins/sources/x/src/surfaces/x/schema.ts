// Remote-id builders for the `x` surface (tracked profiles + their posts).
// These encode the idempotency keys the x module ingest dedups on.

/** Profile entity → stable remote_id (`x:profile:{user_id}`). */
export const profileRemoteId = (userId: string): string => `x:profile:${userId}`;
/** Post entity → stable remote_id (`x:post:{tweet_id}`). */
export const postRemoteId = (tweetId: string): string => `x:post:${tweetId}`;
