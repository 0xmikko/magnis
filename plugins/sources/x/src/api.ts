// X (Twitter) API v2 — READ-ONLY client. App-only Bearer auth for reads
// (the bearer the host injects via _meta). Stripped to the two read calls
// the x connector needs: resolve a handle → profile, and recent tweets.
// NO write paths, NO OAuth, NO persistence.

import { RateLimitError } from "@magnis/connector-sdk";

export const X_API_BASE = "https://api.x.com";

/** Minimal fetch surface so tests inject a fake (no live API call). */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json: () => Promise<unknown>;
}>;

const DEFAULT_RETRY_AFTER_SECS = 60;

/** Parse a Retry-After (seconds) header, defaulting when absent/garbage. */
function retryAfterSecs(headers?: { get(name: string): string | null }): number {
  const raw = headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SECS;
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  description?: string;
  verified?: boolean;
  public_metrics?: { followers_count?: number };
}

export interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  conversation_id?: string;
  referenced_tweets?: { type: string; id: string }[];
  /** Long-form body — X truncates `.text` at 280; the full text lives here. */
  note_tweet?: { text?: string };
  /** X Article (premium long-form) — full body in plain_text. */
  article?: { title?: string; plain_text?: string };
  entities?: {
    urls?: { url?: string; expanded_url?: string; display_url?: string }[];
  };
  attachments?: { media_keys?: string[] };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
}

export interface XMedia {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
}

export interface XTweetPage {
  tweets: XTweet[];
  media: XMedia[];
}

export class XApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`X API ${String(status)}: ${detail}`);
    this.name = "XApiError";
  }
}

const USER_FIELDS = "name,username,profile_image_url,description,verified,public_metrics";
// note_tweet + article carry the FULL text X truncates in `.text`;
// entities/attachments feed urls + media.
const TWEET_FIELDS =
  "created_at,public_metrics,text,lang,referenced_tweets,conversation_id,note_tweet,article,entities,attachments";
// media_keys are bare keys — they only resolve to URLs when the expansion AND
// media.fields are both requested.
const TWEET_EXPANSIONS = "attachments.media_keys";
const MEDIA_FIELDS = "media_key,type,url,preview_image_url,alt_text";

/** Read-only X v2 client. A 401/403 surfaces as XApiError (auth) so the host
 * degrades the surface without crashing the connector. */
export class XClient {
  constructor(
    private readonly bearer: string,
    private readonly fetchFn: FetchLike,
  ) {}

  private async getBody(path: string): Promise<{ data?: unknown; includes?: { media?: XMedia[] } }> {
    const res = await this.fetchFn(`${X_API_BASE}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${this.bearer}` },
    });
    if (res.status === 429) {
      throw new RateLimitError(retryAfterSecs(res.headers));
    }
    const body = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      includes?: { media?: XMedia[] };
      detail?: string;
    };
    if (!res.ok) {
      // A 402 credits-depleted / quota condition is transient (top up) — back off
      // so the sync loop survives instead of erroring dead.
      if (res.status === 402 || /credit|quota|points|exhaust/i.test(body.detail ?? "")) {
        throw new RateLimitError(retryAfterSecs(res.headers));
      }
      throw new XApiError(res.status, body.detail ?? "request failed");
    }
    return body;
  }

  private async get<T>(path: string): Promise<T | undefined> {
    return (await this.getBody(path)).data as T | undefined;
  }

  /** Resolve a bare handle (no leading @) → user, or null when not found. */
  async userByUsername(handle: string): Promise<XUser | null> {
    try {
      return (await this.get<XUser>(
        `/2/users/by/username/${encodeURIComponent(handle)}?user.fields=${USER_FIELDS}`,
      )) ?? null;
    } catch (e) {
      if (e instanceof XApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** Recent tweets for a user id (most-recent-first, capped at `max`) plus the
   * media includes their attachment keys resolve against. */
  async recentTweets(userId: string, max: number): Promise<XTweetPage> {
    const body = await this.getBody(
      `/2/users/${encodeURIComponent(userId)}/tweets?max_results=${String(max)}` +
        `&tweet.fields=${TWEET_FIELDS}&expansions=${TWEET_EXPANSIONS}&media.fields=${MEDIA_FIELDS}`,
    );
    return {
      tweets: Array.isArray(body.data) ? (body.data as XTweet[]) : [],
      media: body.includes?.media ?? [],
    };
  }
}
