import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { XClient, type FetchLike, type XMedia, type XTweet, type XUser } from "../../api";
import { fullText, postType } from "./helpers";
import { PLATFORM, SURFACE_X } from "../../schema";
import { postRemoteId, profileRemoteId } from "./schema";

const RECENT_TWEETS = 10;

// Map an X user → a x.profile envelope (entity_type "profile" — the x
// module ingest discriminator). remote_id = idempotency key.
function profileEnvelope(user: XUser): Envelope {
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
  const handles = args.tracked_handles ?? [];
  const client = new XClient(bearer, fetchFn);
  const envelopes: Envelope[] = [];
  for (const handle of handles) {
    const user = await client.userByUsername(handle);
    if (!user) continue;
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
