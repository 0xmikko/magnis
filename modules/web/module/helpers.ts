// Web plugin — pure helpers: URL normalization, Graph refs, period and Source
// answer decoding, and the window cut. No host calls.
import type { GraphEntityDeclaration, GraphLinkDeclaration, GraphRef, JsonObject, JsonValue, Link } from "@magnis/sdk";

import type {
  ContentsMetadata,
  ContentsPeriod,
  WebFreshness,
  WebPageDetails,
  WebReadAnswer,
  WebSearchAnswer,
} from "../types.ts";
import { CONTENTS, LINK, PAGE } from "../schema.ts";

/** One window of a page's text: at most 50 KiB of UTF-8. */
export const WINDOW_BYTES = 50 * 1024;

/** Normalize a URL as the host did before Web left it, byte for byte, so the
 * canonical keys the migration gave existing links match: http or https only,
 * lowercase host, no fragment or user info, the default port dropped. */
export function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (host === "") return null;
  const scheme = parsed.protocol.slice(0, -1);
  let normalized = `${scheme}://${host.toLowerCase()}`;
  if (parsed.port !== "") {
    const defaultPort = scheme === "http" ? "80" : "443";
    if (parsed.port !== defaultPort) normalized += `:${parsed.port}`;
  }
  normalized += parsed.pathname;
  if (parsed.search !== "") normalized += parsed.search;
  return normalized;
}

/** The lowercase host of a normalized URL. */
export function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function linkRef(url: string): Extract<GraphRef, { kind: "canonical" }> {
  return { kind: "canonical", schemaId: LINK, canonicalKey: url };
}

/** A page is keyed by its content and the URL that served it. */
export function pageKey(contentHash: string, url: string): string {
  return `${contentHash}:${url}`;
}

export function pageRef(contentHash: string, url: string): Extract<GraphRef, { kind: "canonical" }> {
  return { kind: "canonical", schemaId: PAGE, canonicalKey: pageKey(contentHash, url) };
}

/** The link's declaration: it resolves to the existing link, whose dictionary
 * a declaration never rewrites. */
export function linkDeclaration(url: string): GraphEntityDeclaration {
  return { ref: linkRef(url), schemaVersion: 1, name: url, idx: null, date: null, properties: { url, domain: domainOf(url) } };
}

export function pageDeclaration(details: WebPageDetails, title: string | null, firstSeen: string): GraphEntityDeclaration {
  return {
    ref: pageRef(details.contentHash, details.url), schemaVersion: 1, name: title, idx: null, date: firstSeen,
    properties: details,
  };
}

/** One `contents` row from the link to a page. */
export function contentsLink(
  url: string,
  page: GraphRef,
  metadata: ContentsMetadata,
  validFrom: string,
  validUntil: string | null,
): GraphLinkDeclaration {
  return { from: linkRef(url), to: page, kind: CONTENTS, confidence: null, metadata, declaredBy: null, validFrom, validUntil };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown, label: string): string | null {
  if (value === null || typeof value === "string") return value;
  throw new Error(`${label} must be a string or null`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

/** A stored `contents` row as a period; anything else is an error. */
export function periodOf(link: Link): ContentsPeriod {
  if (link.origin !== "canonical" || link.kind !== CONTENTS) throw new Error(`link ${link.id} is not a contents period`);
  if (link.validFrom === null) throw new Error(`contents period ${link.id} has no validFrom`);
  const metadata = link.metadata;
  if (!isObject(metadata)) throw new Error(`contents period ${link.id} has no metadata`);
  return {
    lastGet: requiredString(metadata.lastGet, `contents period ${link.id} lastGet`),
    expiresAt: stringOrNull(metadata.expiresAt, `contents period ${link.id} expiresAt`),
    validFrom: link.validFrom,
    validUntil: link.validUntil,
  };
}

/** The dictionary of a stored page; a page that does not carry it is an error. */
export function pageDetailsOf(id: string, properties: JsonValue): WebPageDetails {
  if (!isObject(properties)) throw new Error(`web.page ${id} has no dictionary`);
  const sizeBytes = properties.sizeBytes;
  if (typeof sizeBytes !== "number") throw new Error(`web.page ${id} sizeBytes must be a number`);
  if (properties.mimeType !== "text/markdown") throw new Error(`web.page ${id} mimeType must be text/markdown`);
  return {
    url: requiredString(properties.url, `web.page ${id} url`),
    contentHash: requiredString(properties.contentHash, `web.page ${id} contentHash`),
    mimeType: "text/markdown",
    sizeBytes,
    etag: stringOrNull(properties.etag, `web.page ${id} etag`),
    lastModified: stringOrNull(properties.lastModified, `web.page ${id} lastModified`),
  };
}

function freshnessOf(value: unknown, label: string): WebFreshness {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return {
    expiresAt: stringOrNull(value.expiresAt, `${label}.expiresAt`),
    etag: stringOrNull(value.etag, `${label}.etag`),
    lastModified: stringOrNull(value.lastModified, `${label}.lastModified`),
  };
}

/** What `sources/web` answered to `read`, checked; a malformed answer is an
 * error, never an empty page. */
export function readAnswerOf(raw: Record<string, unknown>): WebReadAnswer {
  if (raw.status === "unchanged") {
    return { status: "unchanged", fetchedAt: requiredString(raw.fetchedAt, "read answer fetchedAt"), freshness: freshnessOf(raw.freshness, "read answer freshness") };
  }
  if (raw.status !== "changed") throw new Error(`read answer status must be changed or unchanged, got ${JSON.stringify(raw.status ?? null)}`);
  const page = raw.page;
  if (!isObject(page)) throw new Error("read answer page must be an object");
  if (page.mimeType !== "text/markdown") throw new Error("read answer page mimeType must be text/markdown");
  return {
    status: "changed",
    page: {
      ...freshnessOf(page, "read answer page"),
      url: requiredString(page.url, "read answer page url"),
      fetchedAt: requiredString(page.fetchedAt, "read answer page fetchedAt"),
      title: stringOrNull(page.title, "read answer page title"),
      mimeType: "text/markdown",
      content: requiredString(page.content, "read answer page content"),
    },
  };
}

/** What `sources/web` answered to `search`, checked. */
export function searchAnswerOf(raw: Record<string, unknown>): WebSearchAnswer {
  if (!Array.isArray(raw.results)) throw new Error("search answer results must be an array");
  return {
    results: raw.results.map((result: unknown, index) => {
      if (!isObject(result)) throw new Error(`search answer result ${String(index)} must be an object`);
      return {
        url: requiredString(result.url, `search answer result ${String(index)} url`),
        title: requiredString(result.title, `search answer result ${String(index)} title`),
        snippet: requiredString(result.snippet, `search answer result ${String(index)} snippet`),
      };
    }),
  };
}

/** Whether a period's content is still trusted without a check. */
export function isFresh(period: ContentsPeriod, now: string): boolean {
  return period.expiresAt !== null && Date.parse(period.expiresAt) > Date.parse(now);
}

/** The length of the longest prefix of `bytes` that ends on a complete UTF-8
 * character, as the host cuts a `bytesRead` window. */
function utf8Prefix(bytes: Uint8Array): number {
  let lead = bytes.length - 1;
  while (lead >= 0 && ((bytes[lead] ?? 0) & 0xc0) === 0x80) lead -= 1;
  if (lead < 0) return 0;
  const first = bytes[lead] ?? 0;
  const width = first < 0x80 ? 1 : first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : 2;
  return lead + width <= bytes.length ? bytes.length : lead;
}

/** One window of text in hand, cut the way `bytesRead` cuts a stored one. */
export function windowOf(text: string, offset: number): { content: string; length: number; sizeBytes: number } {
  const bytes = new TextEncoder().encode(text);
  if (offset > bytes.length) throw new Error(`offset ${String(offset)} is past the end of ${String(bytes.length)} bytes`);
  const slice = bytes.subarray(offset, offset + WINDOW_BYTES);
  const length = utf8Prefix(slice);
  return { content: new TextDecoder("utf-8", { fatal: true }).decode(slice.subarray(0, length)), length, sizeBytes: bytes.length };
}

/** Where the next window starts, or null at the end. */
export function nextOffsetOf(offset: number, length: number, sizeBytes: number): number | null {
  return offset + length < sizeBytes ? offset + length : null;
}

export function asObject(value: JsonValue | undefined): JsonObject | null {
  return isObject(value) ? value : null;
}
