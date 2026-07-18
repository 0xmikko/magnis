import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { XClient, type FetchLike, type XMedia, type XTweet, type XUser } from "./api";

const PLATFORM = "x";
const RECENT_TWEETS = 10;

// Map an X user → a x.profile envelope (entity_type "profile" — the x
// module ingest discriminator). remote_id = idempotency key (INV-4).
function profileEnvelope(user: XUser): Envelope {
  return {
    surface: "x",
    remote_id: `x:profile:${user.id}`,
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

// ContentOS ingest port (social-post-rendering S4 / INV-1): X truncates `.text`
// at 280 — the FULL body lives in article.plain_text (Article) or
// note_tweet.text (long-form). Store the full text, never the teaser.
function fullText(tweet: XTweet): string {
  return tweet.article?.plain_text ?? tweet.note_tweet?.text ?? tweet.text;
}

// Type precedence: article > long_form > reply > post (ContentOS tweetType;
// threads deferred — no conversation assembly in v1).
function postType(tweet: XTweet, isReply: boolean): string {
  if (tweet.article?.plain_text || tweet.article?.title) return "article";
  if (tweet.note_tweet?.text) return "long_form";
  if (isReply) return "reply";
  return "post";
}

function postEnvelope(user: XUser, tweet: XTweet, mediaByKey: Map<string, XMedia>): Envelope {
  const refs = tweet.referenced_tweets ?? [];
  const m = tweet.public_metrics ?? {};
  const isReply = refs.some((r) => r.type === "replied_to");

  // media_keys resolve against includes.media; keys with no include entry are
  // dropped (nothing to render). INV-2: the key is absent when there is none.
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
    surface: "x",
    remote_id: `x:post:${tweet.id}`,
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
 * Only tracked handles are queried (INV-1 — an untracked handle is never even
 * looked up). Missing bearer → auth error (DEC-7, fetch-time). Snapshot poll:
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
  // Poll is snapshot-per-cycle; no server cursor in v1 (DEC-5). hasMore=false.
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  return { envelopes, nextCursor: cursor + 1, hasMore: false };
}
