import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { XClient, type FetchLike, type XMedia, type XTweet, type XUser } from "../../api";
import { fullText, postType } from "./helpers";
import { PLATFORM, SURFACE_X } from "../../schema";
import { postRemoteId, profileRemoteId } from "./schema";
import type { ResolvedXProfile } from "../../../../../modules/x/types";

const RECENT_TWEETS = 10;

// Map an X user → a x.profile envelope (entity_type "profile" — the x
// module ingest discriminator). remote_id = idempotency key. The profile
// states the window this pass plans — the recent RECENT_TWEETS of what the
// account counts, the rest skipped — when X counts the account at all.
// @tested-by: tst_x_011
function profileEnvelope(user: XUser): Envelope {
  const tweetCount = user.public_metrics?.tweet_count;
  const window = typeof tweetCount === "number"
    ? { posts_total: Math.min(tweetCount, RECENT_TWEETS), posts_skipped: tweetCount - Math.min(tweetCount, RECENT_TWEETS) }
    : {};
  return {
    surface: SURFACE_X,
    remote_id: profileRemoteId(user.id),
    kind: "snapshot",
    payload: {
      entity_type: "profile",
      platform: PLATFORM,
      handle: user.username,
      display_name: user.name,
      url: `https://x.com/${user.username}`,
      avatar_url: user.profile_image_url ?? null,
      bio: user.description ?? null,
      verified: user.verified ?? null,
      follower_count: user.public_metrics?.followers_count ?? null,
      ...window,
    },
  };
}

function postEnvelope(user: XUser, tweet: XTweet, mediaByKey: Map<string, XMedia>): Envelope {
  const refs = tweet.referenced_tweets ?? [];
  const m = tweet.public_metrics ?? {};
  const isReply = refs.some((r) => r.type === "replied_to");

  // media_keys resolve against includes.media; keys with no include entry are
  // dropped (nothing to render). The key is absent when there is none.
  const media = (tweet.attachments?.media_keys ?? [])
    .map((k) => mediaByKey.get(k))
    .filter((x): x is XMedia => !!x)
    .map((x) => ({
      type: x.type ?? null,
      url: x.url ?? null,
      preview_image_url: x.preview_image_url ?? null,
      alt_text: x.alt_text ?? null,
    }));
  const urls = (tweet.entities?.urls ?? []).map((u) => ({
    url: u.url ?? null,
    expanded_url: u.expanded_url ?? null,
    display_url: u.display_url ?? null,
  }));

  return {
    surface: SURFACE_X,
    remote_id: postRemoteId(tweet.id),
    kind: "live",
    payload: {
      entity_type: "post",
      platform: PLATFORM,
      post_id: tweet.id,
      author_handle: user.username,
      text: fullText(tweet),
      post_type: postType(tweet, isReply),
      created_at: tweet.created_at ?? null,
      url: `https://x.com/${user.username}/status/${tweet.id}`,
      lang: tweet.lang ?? null,
      is_reply: isReply,
      is_repost: refs.some((r) => r.type === "retweeted"),
      ...(tweet.article?.title ? { article_title: tweet.article.title } : {}),
      ...(tweet.conversation_id ? { conversation_id: tweet.conversation_id } : {}),
      ...(media.length ? { media } : {}),
      ...(urls.length ? { urls } : {}),
      metrics: {
        likes: m.like_count ?? null,
        reposts: m.retweet_count ?? null,
        replies: m.reply_count ?? null,
        impressions: m.impression_count ?? null,
      },
    },
  };
}

/** Read-only fetch: resolve each TRACKED handle → profile + recent tweets.
 * Only tracked handles are queried (an untracked handle is never even
 * looked up). Missing bearer → auth error (fetch-time). Snapshot poll:
 * one page, no cursor pagination in v1 (idempotent re-poll absorbs overlap). */
export async function fetchX(args: FetchArgs, fetchFn: FetchLike): Promise<FetchResult> {
  const bearer = typeof args.meta?.bearer_token === "string" ? args.meta.bearer_token : "";
  if (!bearer) {
    throw new Error("x: missing bearer_token (set SOURCE_X_BEARER_TOKEN)");
  }
  const handles = args.tracked_handles;
  const expected = args.expectedProfileIds;
  if (handles === undefined || expected === undefined) throw new Error("x: explicit profile selection is required");
  if (new Set(handles).size !== handles.length || Object.keys(expected).length !== handles.length
    || handles.some((handle) => !/^[a-z0-9_]{1,15}$/.test(handle) || !/^\d+$/.test(expected[handle] ?? ""))) throw new Error("x: invalid profile selection");
  const client = new XClient(bearer, fetchFn);
  const envelopes: Envelope[] = [];
  for (const handle of handles) {
    const user = await client.userByUsername(handle);
    if (!user || user.id !== expected[handle] || user.username.toLowerCase() !== handle) throw new Error(`x: handle ${handle} does not match its saved profile identity`);
    envelopes.push(profileEnvelope(user));
    const page = await client.recentTweets(user.id, RECENT_TWEETS);
    const mediaByKey = new Map(page.media.map((x) => [x.media_key, x]));
    for (const tweet of page.tweets) {
      envelopes.push(postEnvelope(user, tweet, mediaByKey));
    }
  }
  // Poll is snapshot-per-cycle; no server cursor in v1. hasMore=false.
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  return { envelopes, nextCursor: cursor + 1, hasMore: false };
}

/** Resolve identity and display metadata without acquiring posts. */
export async function resolveProfile(args: Record<string, unknown>, meta: Record<string, unknown> | undefined, fetchFn: FetchLike): Promise<ResolvedXProfile> {
  if (typeof args.handle !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(args.handle)) throw new Error("x: resolveProfile requires a bare handle");
  const bearer = meta?.bearer_token;
  if (typeof bearer !== "string" || bearer === "") throw new Error("x: missing bearer_token");
  const user = await new XClient(bearer, fetchFn).userByUsername(args.handle);
  if (user === null || !/^\d+$/.test(user.id) || typeof user.username !== "string" || user.username.toLowerCase() !== args.handle.toLowerCase()
    || typeof user.name !== "string") throw new Error("x: profile identity lookup failed");
  return { providerId: user.id, handle: user.username, displayName: user.name, bio: user.description ?? null, avatarUrl: user.profile_image_url ?? null };
}
