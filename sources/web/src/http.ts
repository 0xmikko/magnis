// sources/web — one read of one public URL. Every hop is checked against
// private and reserved addresses before it is asked, at most four redirects
// are followed, validators make the request conditional, and freshness comes
// from the response headers. A failure is a typed error, never an empty page.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ConnectorError, RateLimitError } from "@magnis/connector-sdk";

import type { WebFreshness, WebReadAnswer, WebReadParams } from "../../../modules/web/types";
import { htmlToMarkdown, withoutControlCharacters } from "./markdown";

/** The redirects one read follows. */
export const MAX_REDIRECTS = 4;
/** The largest response body read. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** The largest page answered, as the host stores at most 3 MiB per write. */
export const MAX_MARKDOWN_BYTES = 3 * 1024 * 1024;
/** One command, redirects and conversion included. */
export const COMMAND_TIMEOUT_MS = 20_000;

const USER_AGENT = "Mozilla/5.0 (compatible; Magnis/1.0)";

/** The network as one read sees it. A request never follows a redirect by
 * itself, so every hop meets the address check. */
interface Transport {
  fetch(url: string, init: { headers: Record<string, string>; signal: AbortSignal }): Promise<Response>;
  /** Every address a host name resolves to. */
  resolve(host: string): Promise<readonly string[]>;
  now(): Date;
}

export function liveTransport(): Transport {
  return {
    fetch: (url, init) => fetch(url, { ...init, redirect: "manual" }),
    resolve: async (host) => (await lookup(host, { all: true })).map(({ address }) => address),
    now: () => new Date(),
  };
}

/** Whether an address belongs to a private or reserved range: loopback,
 * RFC 1918, link-local, unspecified, and IPv6 unique-local and link-local. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return false;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 169 && b === 254) || octets.every((octet) => octet === 0);
  }
  if (version === 6) {
    const segments = ipv6Segments(ip);
    if (segments === null) return false;
    const [first] = segments;
    if (first === undefined) return false;
    const mappedV4 = segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff;
    if (mappedV4) {
      const high = segments[6] ?? 0;
      const low = segments[7] ?? 0;
      return isPrivateAddress(`${String(high >> 8)}.${String(high & 0xff)}.${String(low >> 8)}.${String(low & 0xff)}`);
    }
    return segments.every((segment, index) => (index === 7 ? segment === 1 : segment === 0)) ||
      segments.every((segment) => segment === 0) || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

function ipv6Segments(ip: string): number[] | null {
  const halves = (ip.split("%")[0] ?? ip).split("::");
  if (halves.length > 2) return null;
  const parts = (half: string | undefined): string[] => (half === undefined || half === "" ? [] : half.split(":"));
  const segments = (list: string[]): number[] | null => {
    const out: number[] = [];
    for (const part of list) {
      if (part.includes(".")) {
        const v4 = part.split(".").map(Number);
        if (v4.length !== 4 || v4.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
        out.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
        continue;
      }
      const value = Number.parseInt(part, 16);
      if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
      out.push(value);
    }
    return out;
  };
  const head = segments(parts(halves[0]));
  const tail = segments(parts(halves[1]));
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing < 0 ? null : [...head, ...(new Array(missing).fill(0) as number[]), ...tail];
}

/** Refuse a hop whose host is not http or https, or resolves to a private
 * or reserved address. */
async function checkTarget(url: URL, transport: Transport): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectorError(`${url.href} is not an http or https URL`, { kind: "unsupported_url" });
  }
  const host = url.hostname.replace(/^\[(.*)\]$/u, "$1");
  const addresses = isIP(host) === 0 ? await transport.resolve(host) : [host];
  if (addresses.length === 0) throw new ConnectorError(`${host} resolves to no address`, { kind: "network" });
  const refused = addresses.find(isPrivateAddress);
  if (refused !== undefined) {
    throw new ConnectorError(`${url.href} resolves to the private or reserved address ${refused}`, { kind: "private_address" });
  }
}

/** GET a public URL, following at most four redirects and checking every hop
 * before it is asked. Answers the last response and the URL that served it. */
export async function fetchPublic(
  url: string,
  headers: Record<string, string>,
  transport: Transport,
  signal: AbortSignal,
): Promise<{ response: Response; url: URL }> {
  let target = new URL(url);
  for (let hop = 0; ; hop += 1) {
    await checkTarget(target, transport);
    const response = await transport.fetch(target.href, { headers: { "user-agent": USER_AGENT, ...headers }, signal });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || response.status === 304 || location === null) {
      return { response, url: target };
    }
    await response.body?.cancel();
    if (hop === MAX_REDIRECTS) {
      throw new ConnectorError(`${url} redirects more than ${String(MAX_REDIRECTS)} times`, { kind: "too_many_redirects" });
    }
    target = new URL(location, target);
  }
}

/** Read a body, refusing one larger than `maxBytes` instead of cutting it. */
export async function readBody(response: Response, maxBytes: number, url: string): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ConnectorError(`${url} is larger than ${String(maxBytes)} bytes`, { kind: "too_large" });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

/** Freshness from the headers: `no-store` or `no-cache` is never fresh;
 * otherwise `max-age` minus `Age`, or, without `max-age`, `Expires` minus
 * `Date`. With neither, the response is never fresh; nothing is invented. */
export function freshnessOf(headers: Headers, now: Date): WebFreshness {
  const freshness = { etag: headers.get("etag"), lastModified: headers.get("last-modified") };
  const directives = (headers.get("cache-control") ?? "").toLowerCase().split(",").map((directive) => directive.trim());
  if (directives.includes("no-store") || directives.includes("no-cache")) return { expiresAt: null, ...freshness };
  const maxAge = directives.find((directive) => directive.startsWith("max-age="));
  let lifetimeMs: number | null = null;
  if (maxAge !== undefined) {
    const seconds = Number.parseInt(maxAge.slice("max-age=".length), 10);
    const age = Number.parseInt(headers.get("age") ?? "0", 10);
    if (Number.isInteger(seconds)) lifetimeMs = (seconds - (Number.isInteger(age) ? age : 0)) * 1000;
  } else {
    const expires = Date.parse(headers.get("expires") ?? "");
    const date = Date.parse(headers.get("date") ?? "");
    if (!Number.isNaN(expires) && !Number.isNaN(date)) lifetimeMs = expires - date;
  }
  return { expiresAt: lifetimeMs === null || lifetimeMs <= 0 ? null : new Date(now.getTime() + lifetimeMs).toISOString(), ...freshness };
}

/** Seconds a 429 asks to wait, from `Retry-After` as seconds or as a date. */
function retryAfterOf(headers: Headers, now: Date, url: string): number {
  const value = headers.get("retry-after");
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isInteger(seconds) && seconds >= 0) return seconds;
    const at = Date.parse(value);
    if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - now.getTime()) / 1000));
  }
  throw new ConnectorError(`${url} is rate limited without a Retry-After`, { kind: "rate_limited" });
}

/** Run one command within `ms`; its end is a typed timeout. */
export async function withDeadline<T>(ms: number, label: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = (): ConnectorError => new ConnectorError(`${label} took longer than ${String(ms / 1000)} s`, { kind: "timeout" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeout());
    }, ms);
  });
  let result: T;
  try {
    result = await Promise.race([work(controller.signal), deadline]);
  } catch (error: unknown) {
    // Whatever the abort made the work throw, the cause is the deadline.
    if (controller.signal.aborted) throw timeout();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  // Conversion runs on the event loop and cannot be interrupted, so the
  // deadline is checked again once it is done.
  if (controller.signal.aborted) throw timeout();
  return result;
}

function mediaTypeOf(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value === null ? null : (value.split(";")[0] ?? "").trim().toLowerCase();
}

function decode(body: Uint8Array, headers: Headers): string {
  const charset = /charset=([^;]+)/iu.exec(headers.get("content-type") ?? "")?.[1]?.trim().replace(/^"|"$/gu, "");
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

/** Action `read`: one conditional request when validators are given and no
 * `forceRefresh`, the page as Markdown, and its freshness. */
export function readUrl(params: WebReadParams, transport: Transport = liveTransport()): Promise<WebReadAnswer> {
  return withDeadline(COMMAND_TIMEOUT_MS, `reading ${params.url}`, async (signal) => {
    const headers: Record<string, string> = { accept: "text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9" };
    const conditional = !params.forceRefresh && (params.etag !== null || params.lastModified !== null);
    if (conditional && params.etag !== null) headers["if-none-match"] = params.etag;
    if (conditional && params.lastModified !== null) headers["if-modified-since"] = params.lastModified;
    const { response, url } = await fetchPublic(params.url, headers, transport, signal);
    const now = transport.now();
    const fetchedAt = now.toISOString();
    if (response.status === 304) {
      if (!conditional) throw new ConnectorError(`${params.url} answered 304 to a request without validators`, { kind: "http_status", status: 304 });
      const freshness = freshnessOf(response.headers, now);
      return {
        status: "unchanged",
        fetchedAt,
        freshness: { expiresAt: freshness.expiresAt, etag: freshness.etag ?? params.etag, lastModified: freshness.lastModified ?? params.lastModified },
      };
    }
    if (response.status === 429) throw new RateLimitError(retryAfterOf(response.headers, now, params.url));
    if (!response.ok) throw new ConnectorError(`${params.url} answered HTTP ${String(response.status)}`, { kind: "http_status", status: response.status });

    const mediaType = mediaTypeOf(response.headers);
    const html = mediaType === "text/html" || mediaType === "application/xhtml+xml";
    if (!html && mediaType !== "text/markdown" && mediaType !== "text/plain") {
      throw new ConnectorError(`${params.url} is ${mediaType ?? "of no content type"}, not a page`, { kind: "unsupported_content" });
    }
    const text = decode(await readBody(response, MAX_BODY_BYTES, params.url), response.headers);
    const converted = html ? htmlToMarkdown(text, url.href) : { title: null, markdown: withoutControlCharacters(text).replaceAll("\r", "") };
    if (new TextEncoder().encode(converted.markdown).length > MAX_MARKDOWN_BYTES) {
      throw new ConnectorError(`${params.url} is more than ${String(MAX_MARKDOWN_BYTES)} bytes of Markdown`, { kind: "too_large" });
    }
    return {
      status: "changed",
      page: { url: params.url, fetchedAt, title: converted.title, mimeType: "text/markdown", content: converted.markdown, ...freshnessOf(response.headers, now) },
    };
  });
}
