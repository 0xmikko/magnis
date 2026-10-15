// sources/web — search the internet through DuckDuckGo's HTML endpoint, which
// needs no key, as the host did before Web left it. Nothing is stored.
import { ConnectorError, RateLimitError } from "@magnis/connector-sdk";
import { parseHTML } from "linkedom";

import type { WebSearchAnswer, WebSearchParams, WebSearchResult } from "../../../modules/web/types";
import { COMMAND_TIMEOUT_MS, fetchPublic, MAX_BODY_BYTES, readBody, retryAfterOf, withDeadline } from "./http";

const ENDPOINT = "https://html.duckduckgo.com/html/";

function text(node: { textContent: string | null } | null): string {
  return (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

/** A result link is DuckDuckGo's redirect; the target is its `uddg`. */
function targetOf(href: string): string {
  const absolute = href.startsWith("//") ? `https:${href}` : href.startsWith("/") ? `https://duckduckgo.com${href}` : href;
  try {
    return new URL(absolute).searchParams.get("uddg") ?? href;
  } catch {
    return href;
  }
}

/** The ordered results of one DuckDuckGo HTML page, at most `limit`. */
export function parseResults(html: string, limit: number): WebSearchResult[] {
  const { document } = parseHTML(html) as unknown as { document: Document };
  const results: WebSearchResult[] = [];
  for (const element of document.querySelectorAll(".result, .web-result")) {
    if (results.length >= limit) break;
    const anchor = element.querySelector(".result__a, h2 a");
    const href = anchor?.getAttribute("href") ?? "";
    const title = text(anchor);
    if (href === "" || title === "") continue;
    results.push({ url: targetOf(href), title, snippet: text(element.querySelector(".result__snippet")) });
  }
  return results;
}

type Transport = Parameters<typeof fetchPublic>[2];

/** Action `search`: one result page, `limit` 1 to 10. */
export function searchWeb(params: WebSearchParams, transport: Transport): Promise<WebSearchAnswer> {
  if (params.query.trim() === "") return Promise.reject(new ConnectorError("search needs a query", { kind: "validation" }));
  if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 10) {
    return Promise.reject(new ConnectorError("search limit must be 1 to 10", { kind: "validation" }));
  }
  const url = `${ENDPOINT}?${new URLSearchParams({ q: params.query }).toString()}`;
  return withDeadline(COMMAND_TIMEOUT_MS, `searching ${params.query}`, async (signal) => {
    const { response } = await fetchPublic(url, { accept: "text/html" }, transport, signal);
    if (response.status === 429) throw new RateLimitError(retryAfterOf(response.headers, transport.now(), url));
    if (!response.ok) throw new ConnectorError(`DuckDuckGo answered HTTP ${String(response.status)}`, { kind: "http_status", status: response.status });
    const html = new TextDecoder("utf-8").decode(await readBody(response, MAX_BODY_BYTES, url));
    return { results: parseResults(html, params.limit) };
  });
}
