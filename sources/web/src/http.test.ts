/** sources/web reads one public URL, of the web-source plan
 * (`docs/plans/web-source.md` in magnis-app, Stage D2-S2): every hop is
 * checked against private and reserved addresses, at most 4 redirects are
 * followed, validators make the request conditional, freshness comes from the
 * response headers, and size, time and rate limits fail explicitly.
 * @test-id: tst_web_src_read_001
 * @deterministic: yes
 */
import { describe, expect, test } from "bun:test";

import { RateLimitError } from "@magnis/connector-sdk";

import { freshnessOf, readUrl, withDeadline } from "./http";
import { parseResults, searchWeb } from "./search";

const NOW = new Date("2026-10-07T10:00:00.000Z");
const PUBLIC = "93.184.216.34";

interface Hop { url: string; headers: Record<string, string> }

/** A transport that answers by URL and records every request it was asked
 * to make; host names resolve through the table, IP literals skip it. */
function transport(
  routes: Record<string, () => Response>,
  hosts: Record<string, string[]> = { "public.example": [PUBLIC], "other.example": ["1.1.1.1"] },
) {
  const hops: Hop[] = [];
  return {
    hops,
    transport: {
      fetch: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => {
        hops.push({ url, headers: init.headers });
        const route = routes[url];
        return route === undefined ? Promise.reject(new Error(`no route for ${url}`)) : Promise.resolve(route());
      },
      resolve: (host: string) => Promise.resolve(hosts[host] ?? []),
      now: () => NOW,
    },
  };
}

function page(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/markdown; charset=utf-8", ...headers } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

const read = { url: "https://public.example/a", etag: null, lastModified: null, forceRefresh: false };

describe("reading a URL", () => {
  test("tst_web_src_read_001 a private hop is refused, a 304 answers unchanged, and limits fail explicitly", async () => {
    // A redirect that lands on a private address is refused before it is asked.
    const private_ = transport({ "https://public.example/a": () => redirect("http://10.0.0.1/secret") });
    await expect(readUrl(read, private_.transport)).rejects.toMatchObject({ data: { kind: "private_address" } });
    expect(private_.hops.map(({ url }) => url)).toEqual(["https://public.example/a"]);
    const local = transport({}, { localhost: ["127.0.0.1"] });
    await expect(readUrl({ ...read, url: "http://localhost/a" }, local.transport)).rejects.toMatchObject({ data: { kind: "private_address" } });
    expect(local.hops).toEqual([]);

    // Validators make the request conditional, and a 304 answers unchanged.
    const conditional = transport({ "https://public.example/a": () => new Response(null, { status: 304, headers: { "cache-control": "max-age=60" } }) });
    expect(await readUrl({ ...read, etag: "\"a1\"", lastModified: "Tue, 06 Oct 2026 10:00:00 GMT" }, conditional.transport)).toEqual({
      status: "unchanged",
      fetchedAt: NOW.toISOString(),
      freshness: { expiresAt: "2026-10-07T10:01:00.000Z", etag: "\"a1\"", lastModified: "Tue, 06 Oct 2026 10:00:00 GMT" },
    });
    expect(conditional.hops[0]?.headers).toMatchObject({ "if-none-match": "\"a1\"", "if-modified-since": "Tue, 06 Oct 2026 10:00:00 GMT" });

    // forceRefresh sends no validators; a redirect is followed and the page is the requested URL's.
    const forced = transport({
      "https://public.example/a": () => redirect("/b"),
      "https://public.example/b": () => page("# B\u0007\r\n\ttext", { etag: "\"b1\"", "cache-control": "no-store, max-age=600" }),
    });
    expect(await readUrl({ ...read, etag: "\"a1\"", forceRefresh: true }, forced.transport)).toEqual({
      status: "changed",
      page: {
        url: "https://public.example/a", fetchedAt: NOW.toISOString(), title: null, mimeType: "text/markdown",
        content: "# B\n\ttext", expiresAt: null, etag: "\"b1\"", lastModified: null,
      },
    });
    expect(forced.hops.map(({ headers }) => headers["if-none-match"])).toEqual([undefined, undefined]);

    // At most four redirects.
    const chain = transport(Object.fromEntries(
      [0, 1, 2, 3, 4].map((hop) => [`https://public.example/${String(hop)}`, () => redirect(`https://public.example/${String(hop + 1)}`)]),
    ));
    await expect(readUrl({ ...read, url: "https://public.example/0" }, chain.transport)).rejects.toMatchObject({ data: { kind: "too_many_redirects" } });
    expect(chain.hops).toHaveLength(5);

    // A rate limit carries its Retry-After; another status is an error, never an empty page.
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("", { "retry-after": "120" }, 429) }).transport))
      .rejects.toBeInstanceOf(RateLimitError);
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("", { "retry-after": "120" }, 429) }).transport))
      .rejects.toMatchObject({ retryAfterSecs: 120 });
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("gone", {}, 410) }).transport))
      .rejects.toMatchObject({ data: { kind: "http_status", status: 410 } });
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("%PDF", { "content-type": "application/pdf" }) }).transport))
      .rejects.toMatchObject({ data: { kind: "unsupported_content" } });

    // A body over 8 MiB, or Markdown over 3 MiB, is too large rather than cut.
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("x".repeat(8 * 1024 * 1024 + 1)) }).transport))
      .rejects.toMatchObject({ data: { kind: "too_large" } });
    await expect(readUrl(read, transport({ "https://public.example/a": () => page("x".repeat(3 * 1024 * 1024 + 1)) }).transport))
      .rejects.toMatchObject({ data: { kind: "too_large" } });

    // One command is bounded, and its end is a typed timeout.
    await expect(withDeadline(10, "reading https://public.example/a", (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { reject(new Error("aborted")); });
    }))).rejects.toMatchObject({ data: { kind: "timeout" } });
  });

  test("tst_web_src_read_001 freshness comes from Cache-Control, Age, Expires and Date, and is never invented", () => {
    const headers = (values: Record<string, string>) => new Headers(values);
    expect(freshnessOf(headers({ "cache-control": "public, max-age=300", age: "100", etag: "\"e\"" }), NOW))
      .toEqual({ expiresAt: "2026-10-07T10:03:20.000Z", etag: "\"e\"", lastModified: null });
    expect(freshnessOf(headers({ "cache-control": "max-age=60", age: "90" }), NOW).expiresAt).toBeNull();
    expect(freshnessOf(headers({ "cache-control": "no-cache, max-age=60" }), NOW).expiresAt).toBeNull();
    expect(freshnessOf(headers({ expires: "Wed, 07 Oct 2026 12:00:00 GMT", date: "Wed, 07 Oct 2026 11:00:00 GMT" }), NOW).expiresAt)
      .toBe("2026-10-07T11:00:00.000Z");
    expect(freshnessOf(headers({ expires: "Wed, 07 Oct 2026 12:00:00 GMT" }), NOW).expiresAt).toBeNull();
    expect(freshnessOf(headers({ "last-modified": "Tue, 06 Oct 2026 10:00:00 GMT" }), NOW))
      .toEqual({ expiresAt: null, etag: null, lastModified: "Tue, 06 Oct 2026 10:00:00 GMT" });
  });
});

/** A recorded DuckDuckGo HTML result page, cut to three results. */
const RESULT_PAGE = `<!DOCTYPE html><html><body><div id="links" class="results">
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&amp;rut=abc">Example <b>A</b></a></h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">The first   result's snippet.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="https://example.org/b">Example B</a></h2>
    <a class="result__snippet">Second.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.net%2Fc">Example C</a></h2>
  </div>
</div>
</div></body></html>`;

describe("searching the web", () => {
  test("tst_web_src_search_001 a recorded result page parses into ordered results, and the request is bounded", async () => {
    expect(parseResults(RESULT_PAGE, 10)).toEqual([
      { url: "https://example.com/a?x=1", title: "Example A", snippet: "The first result's snippet." },
      { url: "https://example.org/b", title: "Example B", snippet: "Second." },
      { url: "https://example.net/c", title: "Example C", snippet: "" },
    ]);
    expect(parseResults(RESULT_PAGE, 2).map(({ title }) => title)).toEqual(["Example A", "Example B"]);

    const endpoint = "https://html.duckduckgo.com/html/?q=magnis+web";
    const ddg = transport({ [endpoint]: () => new Response(RESULT_PAGE, { headers: { "content-type": "text/html" } }) }, { "html.duckduckgo.com": [PUBLIC] });
    expect((await searchWeb({ query: "magnis web", limit: 1 }, ddg.transport)).results).toEqual([
      { url: "https://example.com/a?x=1", title: "Example A", snippet: "The first result's snippet." },
    ]);
    expect(ddg.hops.map(({ url }) => url)).toEqual([endpoint]);

    await expect(searchWeb({ query: " ", limit: 1 }, ddg.transport)).rejects.toMatchObject({ data: { kind: "validation" } });
    await expect(searchWeb({ query: "x", limit: 11 }, ddg.transport)).rejects.toMatchObject({ data: { kind: "validation" } });
    const down = transport({ "https://html.duckduckgo.com/html/?q=x": () => new Response("busy", { status: 503 }) }, { "html.duckduckgo.com": [PUBLIC] });
    await expect(searchWeb({ query: "x", limit: 1 }, down.transport)).rejects.toMatchObject({ data: { kind: "http_status", status: 503 } });
  });

  test("tst_web_src_search_001 an HTML page reads as its article with absolute links", async () => {
    const html = transport({ "https://public.example/a": () => redirect("https://other.example/post") ,
      "https://other.example/post": () => new Response(
        `<html><head><title>Post</title></head><body><article><h1>Post</h1><p>${"Text with a <a href=\"/next\">link</a>. ".repeat(30)}</p></article></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ) });
    const answer = await readUrl(read, html.transport);
    if (answer.status !== "changed") throw new Error("expected a changed page");
    expect(answer.page.title).toBe("Post");
    expect(answer.page.content).toContain("[link](https://other.example/next)");
  });
});
