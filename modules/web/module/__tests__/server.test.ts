/** Opening pages through the real Web Source against a local HTTP server, of
 * the web-source plan (`docs/plans/web-source.md` in magnis-app, Stage D2-S3):
 * the server's headers decide what the next open asks, each distinct text is
 * stored once under its SHA-256, and a text the link served before keeps its
 * page. Only the address lookup is answered here, so every hop still passes
 * the Source's private-address check.
 * @test-id: tst_web_open_004
 * @deterministic: yes
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";

import { buildConnectorConfig } from "../../../../sources/web/src/connector.ts";
import { WebModule } from "../service.ts";
import type { WebOpenParams } from "../../types.ts";
import { webGraph } from "./webGraph.ts";

interface Served { etag: string; cacheControl: string | null; title: string; text: string }

const PUBLIC = "93.184.216.34";
const NEWS = "https://news.example/today";
const FRESH = "https://news.example/fresh";

let server: Server;
let base: string;
const routes = new Map<string, Served>();
const requests: { path: string; ifNoneMatch: string | null }[] = [];

beforeEach(async () => {
  routes.clear();
  requests.length = 0;
  server = createServer((request, response) => {
    const path = request.url ?? "/";
    const ifNoneMatch = request.headers["if-none-match"] ?? null;
    requests.push({ path, ifNoneMatch });
    const route = routes.get(path);
    if (route === undefined) { response.writeHead(404).end(); return; }
    const headers = { etag: route.etag, ...(route.cacheControl === null ? {} : { "cache-control": route.cacheControl }) };
    if (ifNoneMatch === route.etag) { response.writeHead(304, headers).end(); return; }
    response.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" })
      .end(`<html><head><title>${route.title}</title></head><body><article><h1>${route.title}</h1><p>${route.text}</p></article></body></html>`);
  });
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => { server.close((error) => { if (error === undefined) resolve(); else reject(error); }); });
});

function mount() {
  // The Source's clock runs in the past, a minute per read, so every period
  // starts before the module's own now and no two start together.
  let clock = Date.now() - 30 * 60_000;
  const source = buildConnectorConfig({
    fetch: (url, init) => { const target = new URL(url); return fetch(`${base}${target.pathname}${target.search}`, { ...init, redirect: "manual" }); },
    resolve: () => Promise.resolve([PUBLIC]),
    now: () => new Date(clock += 60_000),
  });
  const read = source.execute["read"];
  if (read === undefined) throw new Error("the Web Source has no read");
  const { state, overrides } = webGraph();
  overrides.sourceCommand = (payload) => read(payload, undefined);
  const module = mountModule(WebModule, { graph: mockGraph(overrides), ctx: { extensionId: "web" } }).module;
  return { state, module };
}

function open(url: string, forceRefresh = false): WebOpenParams {
  return { id: null, url, at: null, forceRefresh };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("web.link.open against a server", () => {
  it("tst_web_open_004 a changed text is a second page, the first text again reuses its page, and a fresh page asks nothing", async () => {
    const { state, module } = mount();
    const first = { etag: "\"a1\"", cacheControl: null, title: "Today", text: "The first edition of today's news." };
    routes.set("/today", first);

    const a = await module.open(open(NEWS));
    expect(a.content).toContain("The first edition");
    const unchanged = await module.open(open(NEWS));
    expect(unchanged).toMatchObject({ pageId: a.pageId, content: a.content });

    routes.set("/today", { ...first, etag: "\"b1\"", text: "The second edition replaces it." });
    const b = await module.open(open(NEWS));
    expect(b.content).toContain("The second edition");
    expect(b.pageId).not.toBe(a.pageId);

    routes.set("/today", { ...first, etag: "\"a2\"" });
    const again = await module.open(open(NEWS));
    expect(again).toMatchObject({ pageId: a.pageId, content: a.content });

    expect(requests).toEqual([
      { path: "/today", ifNoneMatch: null },
      { path: "/today", ifNoneMatch: "\"a1\"" },
      { path: "/today", ifNoneMatch: "\"a1\"" },
      { path: "/today", ifNoneMatch: "\"b1\"" },
    ]);
    const pages = [...state.entities.values()].filter((entity) => entity.schemaId === "web.page");
    expect(pages.map((page) => (page.properties as { contentHash: string }).contentHash).sort())
      .toEqual([sha256(a.content), sha256(b.content)].sort());
    expect([...state.bytes.keys()].sort()).toEqual([sha256(a.content), sha256(b.content)].sort());
    const periods = state.links.filter((row) => row.kind === "contents");
    expect(periods.map((row) => [row.to, row.validUntil === null])).toEqual([[a.pageId, false], [b.pageId, false], [a.pageId, true]]);

    routes.set("/fresh", { etag: "\"f1\"", cacheControl: "public, max-age=3600", title: "Fresh", text: "A page that stays fresh for an hour." });
    const fresh = await module.open(open(FRESH));
    const stored = await module.open(open(FRESH));
    expect(stored).toMatchObject({ pageId: fresh.pageId, content: fresh.content });
    const forced = await module.open(open(FRESH, true));
    expect(forced.pageId).toBe(fresh.pageId);
    expect(requests.slice(4)).toEqual([{ path: "/fresh", ifNoneMatch: null }, { path: "/fresh", ifNoneMatch: null }]);
  });
});
