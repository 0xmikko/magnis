// anysite.io LinkedIn — READ-ONLY client. Auth is the `access-token`
// header (NOT Bearer), key injected by the host via _meta. Ported from
// content-os src/anysite/service.ts; resolve + reply/write paths kept only as
// far as needed for reads (no posting). See plugins/sources/linkedin/README.md.
// NOTE: endpoints/shapes are confirmed against content-os, pending a
// live re-confirmation via scripts/anysite-poc.ts before prod.

import { RateLimitError } from "@magnis/connector-sdk";

export const ANYSITE_BASE = "https://api.anysite.io";

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

const DEFAULT_RETRY_AFTER_SECS = 60;

function retryAfterSecs(headers?: { get(name: string): string | null }): number {
  const raw = headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SECS;
}

export interface KolProfile {
  name: string;
  /** fsd_profile urn — required by /user/posts. */
  urn: string;
  headline: string;
  followerCount: number;
  url: string;
  /** anysite `image` — the LinkedIn avatar (live-probed 2026-07-02). */
  avatarUrl: string | null;
}

export interface KolPost {
  urn: string;
  url: string;
  text: string;
  createdAt: number | null;
  /** null = anysite returned no counter (common on reshares) — NOT zero. */
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  /** Post image URLs — own, falling back to the nested original's (reshares). */
  images: string[];
  isRepost: boolean;
}

export class AnysiteError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`anysite ${String(status)}: ${detail}`);
    this.name = "AnysiteError";
  }
}

/** First value that is actually a string, else "" — preserves the nullish-first
 * precedence of `a ?? b ?? ""` while satisfying no-base-to-string (the fields are
 * string-or-absent in the anysite payload). */
function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string") return v;
  }
  return "";
}

/** anysite urn is `{ type, value }` or a bare string. */
export function extractUrn(u: unknown): string {
  if (typeof u === "string") return u;
  if (u && typeof u === "object" && "value" in u) {
    return firstString((u as { value?: unknown }).value);
  }
  return "";
}

/** Sum a `reactions: [{type,count}]` array (or a bare number) into a total.
 * null/undefined stays null — anysite ships no counters on many reshares and
 * a fabricated 0 would be a lie (operator feedback 2026-07-02). */
export function totalReactions(reactions: unknown): number | null {
  if (reactions === null || reactions === undefined) return null;
  if (!Array.isArray(reactions)) return Number(reactions) || 0;
  return reactions.reduce(
    (sum: number, r) => sum + (Number((r as { count?: unknown } | null)?.count ?? 0) || 0),
    0,
  );
}

/** A count field that must stay null when absent (never a lying zero). */
function countOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Post images: own list, falling back to the nested original's (reshares). */
function postImages(p: Record<string, unknown>, repost?: Record<string, unknown>): string[] {
  const own = Array.isArray(p.images) ? p.images : undefined;
  const nested = repost && Array.isArray(repost.images) ? repost.images : undefined;
  return (own ?? nested ?? []).filter((x): x is string => typeof x === "string");
}

function postText(p: Record<string, unknown>): string {
  const own = firstString(p.text, p.commentary, p.content).trim();
  if (own) return own;
  // Empty repost / reshare: the content lives in the nested original post
  // (confirmed live — i20h's feed is mostly `is_empty_repost` reshares).
  const repost = p.repost && typeof p.repost === "object" ? (p.repost as Record<string, unknown>) : undefined;
  if (repost) return firstString(repost.text, repost.commentary, repost.content).trim();
  return "";
}

export function toKolPost(p: Record<string, unknown>): KolPost {
  const repost = p.repost && typeof p.repost === "object" ? (p.repost as Record<string, unknown>) : undefined;
  return {
    urn: extractUrn(p.urn),
    url: firstString(p.share_url, p.url, repost?.url),
    text: postText(p),
    createdAt: p.created_at !== null && p.created_at !== undefined ? Number(p.created_at) : null,
    // Own counters, falling back to the nested original's; null preserved.
    reactions: totalReactions(p.reactions ?? p.reaction_count ?? repost?.reactions),
    comments: countOrNull(p.comment_count ?? p.comments ?? repost?.comment_count),
    shares: countOrNull(p.share_count ?? p.repost_count ?? repost?.share_count),
    images: postImages(p, repost),
    isRepost: Boolean(p.is_empty_repost) || repost !== undefined,
  };
}

export class AnysiteClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${ANYSITE_BASE}${path}`, {
      method: "POST",
      headers: { "access-token": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      throw new RateLimitError(retryAfterSecs(res.headers));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // anysite bills per call; a points/credits exhaustion is a QUOTA condition
      // (401/402 with a "points/limit/exhausted" body), not a permanent auth
      // failure — back off so the sync loop survives + auto-recovers when topped
      // up, instead of erroring the loop dead.
      if (
        (res.status === 402 || res.status === 401) &&
        /points|limit|exhaust|credit|quota/i.test(detail)
      ) {
        throw new RateLimitError(retryAfterSecs(res.headers));
      }
      throw new AnysiteError(res.status, detail.slice(0, 200));
    }
    return (await res.json()) as T;
  }

  /** Resolve a handle / profile URL → profile (incl. the fsd_profile urn). */
  async resolveProfile(handleOrUrl: string): Promise<KolProfile | null> {
    const d = await this.post<unknown>("/api/linkedin/user", { user: handleOrUrl });
    const p = (Array.isArray(d) ? d[0] : d) as Record<string, unknown> | undefined;
    if (!p) return null;
    return {
      name: firstString(p.name),
      urn: extractUrn(p.urn),
      headline: firstString(p.headline),
      followerCount: Number(p.follower_count ?? 0) || 0,
      url: firstString(p.url),
      avatarUrl: typeof p.image === "string" && p.image ? p.image : null,
    };
  }

  /** Recent posts for a resolved fsd_profile urn, newest first. */
  async userPosts(profileUrn: string, count: number): Promise<KolPost[]> {
    const d = await this.post<unknown>("/api/linkedin/user/posts", { urn: profileUrn, count });
    const obj = d as Record<string, unknown> | null;
    const arr = Array.isArray(d) ? d : (obj?.posts ?? obj?.data ?? obj?.elements ?? []);
    return (arr as Record<string, unknown>[]).map(toKolPost);
  }
}
