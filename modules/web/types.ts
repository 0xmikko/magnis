/** The Web module's own vocabulary: the dictionaries of `web.link` and
 * `web.page`, the metadata of a `contents` period, the tool shapes, and what
 * `sources/web` answers, which the Source imports from here as the X Source
 * imports `ResolvedXProfile`.
 *
 * Types, not interfaces, where a value is stored: a dictionary has to be a
 * `JsonValue`. */
import type { CanonicalEntity, Entity } from "@magnis/sdk";

// ── what the Graph stores ────────────────────────────────────────────────────

/** The dictionary of a `web.link`. New links write only these two keys;
 * existing rows keep their other keys. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- a stored dictionary must be a JsonValue, which an interface is not
export type WebLinkDetails = { url: string; domain: string };

/** The dictionary of a `web.page`: written once, never changed. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- a stored dictionary must be a JsonValue, which an interface is not
export type WebPageDetails = {
  url: string;
  contentHash: string;
  mimeType: "text/markdown";
  sizeBytes: number;
  /** The HTTP validators this content was first stored with; they identify
   * the version, so they live on it. */
  etag: string | null;
  lastModified: string | null;
};

/** The `metadata` of one `contents` row, the same for every owner: when the
 * content was last confirmed, and until when it is trusted without a check. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- a stored dictionary must be a JsonValue, which an interface is not
export type ContentsMetadata = { lastGet: string; expiresAt: string | null };

/** One `contents` period as tools return it; `validFrom` is when this content
 * was first seen in the period. */
export type ContentsPeriod = ContentsMetadata & { validFrom: string; validUntil: string | null };

/** One item of `rpc.ensure` for `web.link`. */
export interface WebLinkEnsureItem { url: string; }

// ── the tools ────────────────────────────────────────────────────────────────

/** `web.link.open`: by `id`, or by `url`; `at` asks for the version seen at
 * that moment. */
export interface WebOpenParams { id: string | null; url: string | null; at: string | null; forceRefresh: boolean; }

/** What `open` and `web.page.get` answer: one window of at most 50 KiB of one
 * page. */
export interface WebPageRead {
  pageId: string;
  url: string;
  title: string | null;
  /** The page's `date`: when this content was first seen. */
  firstSeen: string;
  content: string;
  offset: number;
  /** Where the next window starts, or null at the end. */
  nextOffset: number | null;
  sizeBytes: number;
}

export interface WebPageGetParams { id: string; offset: number; }

/** `web.link.get`; `limit` is 1 to 50. */
export interface WebLinkGetParams { id: string; offset: number; limit: number; }

/** What `web.link.get` answers. */
export interface WebLinkDetail {
  link: CanonicalEntity;
  /** Newest first; a page seen twice is listed once per period. */
  versions: { page: CanonicalEntity; period: ContentsPeriod }[];
  /** Where the next page of versions starts, or null at the end. */
  nextOffset: number | null;
  /** The first 20 entities whose `references` point at this link. */
  referencedBy: Entity[];
}

// ── what sources/web answers ─────────────────────────────────────────────────

/** What the Source learned from one response's headers. */
export interface WebFreshness {
  /** When the response stops being fresh; null when it is never fresh. */
  expiresAt: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface WebSourcePage extends WebFreshness {
  /** The requested URL; a redirect target is not reported. */
  url: string;
  /** When the response arrived: the time of the observation. */
  fetchedAt: string;
  title: string | null;
  mimeType: "text/markdown";
  /** The whole page as Markdown, never cut. */
  content: string;
}

/** Action `read`. With validators the request is conditional; `forceRefresh`
 * sends none. */
export interface WebReadParams { url: string; etag: string | null; lastModified: string | null; forceRefresh: boolean; }

/** `unchanged` only when validators were sent and the server answered 304. */
export type WebReadAnswer =
  | { status: "changed"; page: WebSourcePage }
  | { status: "unchanged"; fetchedAt: string; freshness: WebFreshness };

/** Action `search` of `sources/web`, and the input of
 * `web.link.search_global`; `limit` is 1 to 10. */
export interface WebSearchParams { query: string; limit: number; }

export interface WebSearchResult { url: string; title: string; snippet: string; }

export interface WebSearchAnswer { results: WebSearchResult[]; }
