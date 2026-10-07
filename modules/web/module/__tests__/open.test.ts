/** Opening a page, of the web-source plan (`docs/plans/web-source.md` in
 * magnis-app, Stage D2-S3): every read writes what it saw in one batch, the
 * same content reuses its page, a fresh version is answered from storage,
 * and the text comes back in windows.
 * @test-id: tst_web_open_001, tst_web_open_002, tst_web_open_003, tst_web_ensure_001
 */
import { describe, expect, it } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";
import type { EnsureRequest } from "@magnis/sdk";

import { WebModule } from "../service.ts";
import { link as linkDeclaration, page as pageDeclaration } from "../../entities.ts";
import type { WebOpenParams, WebSourcePage } from "../../types.ts";
import { canonicalEntity, contentsRow, webGraph } from "./webGraph.ts";

type SourceAnswer = NonNullable<Parameters<typeof webGraph>[0]>[number];

const URL_A = "https://Example.com:443/a?x=1#top";
const KEY = "https://example.com/a?x=1";

function changed(content: string, fetchedAt: string, freshness: Partial<WebSourcePage> = {}): SourceAnswer {
  return {
    status: "changed",
    page: { url: KEY, fetchedAt, title: `Title at ${fetchedAt}`, mimeType: "text/markdown", content, expiresAt: null, etag: null, lastModified: null, ...freshness },
  };
}

function mount(answers: SourceAnswer[]) {
  const { state, overrides } = webGraph(answers);
  const module = mountModule(WebModule, { graph: mockGraph(overrides), ctx: { extensionId: "web" } }).module;
  return { state, module };
}

function byUrl(url: string, extra: Partial<WebOpenParams> = {}): WebOpenParams {
  return { id: null, url, at: null, forceRefresh: false, ...extra };
}

function periods(state: ReturnType<typeof mount>["state"]) {
  return state.links
    .filter((row) => row.kind === "contents")
    .map((row) => [state.entities.get(row.to)?.name, row.validFrom, row.validUntil]);
}

describe("web.link.open", () => {
  it("tst_web_open_001 A, then B, then A again gives two pages, two stored texts and three periods", async () => {
    const { state, module } = mount([
      changed("# A", "2026-10-01T09:00:00.000Z", { etag: "\"a1\"" }),
      changed("# B", "2026-10-02T09:00:00.000Z", { etag: "\"b1\"" }),
      changed("# A", "2026-10-03T09:00:00.000Z", { etag: "\"a2\"" }),
    ]);

    const first = await module.open(byUrl(URL_A));
    expect(first).toMatchObject({ url: KEY, title: "Title at 2026-10-01T09:00:00.000Z", firstSeen: "2026-10-01T09:00:00.000Z", content: "# A", offset: 0, nextOffset: null, sizeBytes: 3 });
    const second = await module.open(byUrl(URL_A));
    expect(second.content).toBe("# B");
    const third = await module.open(byUrl(URL_A));
    expect(third).toMatchObject({ pageId: first.pageId, title: "Title at 2026-10-01T09:00:00.000Z", firstSeen: "2026-10-01T09:00:00.000Z", content: "# A" });

    expect(state.commands).toEqual([
      { action: "read", url: KEY, etag: null, lastModified: null, forceRefresh: false },
      { action: "read", url: KEY, etag: "\"a1\"", lastModified: null, forceRefresh: false },
      { action: "read", url: KEY, etag: "\"b1\"", lastModified: null, forceRefresh: false },
    ]);
    const links = [...state.entities.values()].filter((entity) => entity.schemaId === "web.link");
    const pages = [...state.entities.values()].filter((entity) => entity.schemaId === "web.page");
    expect(links.map((entity) => [entity.canonicalKey, entity.properties])).toEqual([[KEY, { url: KEY, domain: "example.com" }]]);
    expect(pages).toHaveLength(2);
    expect(state.bytes.size).toBe(2);
    expect(periods(state)).toEqual([
      ["Title at 2026-10-01T09:00:00.000Z", "2026-10-01T09:00:00.000Z", "2026-10-02T09:00:00.000Z"],
      ["Title at 2026-10-02T09:00:00.000Z", "2026-10-02T09:00:00.000Z", "2026-10-03T09:00:00.000Z"],
      ["Title at 2026-10-01T09:00:00.000Z", "2026-10-03T09:00:00.000Z", null],
    ]);
    // A reused page keeps the validators it was first stored with.
    expect(pages.map((entity) => (entity.properties as { etag: string }).etag).sort()).toEqual(["\"a1\"", "\"b1\""]);
    // Every record the module writes passes its own declaration.
    for (const batch of state.batches) {
      for (const entity of batch.fragment?.entities ?? []) {
        const declared = entity.ref.schemaId === "web.page" ? pageDeclaration : linkDeclaration;
        expect(declared.safeParse(entity.properties).error?.issues ?? []).toEqual([]);
      }
    }
    expect(state.batches).toHaveLength(3);
  });

  it("tst_web_open_002 a fresh version is answered from storage; unchanged and the same text only refresh the period", async () => {
    const far = "2999-01-01T00:00:00.000Z";
    const { state, module } = mount([
      changed("# A", "2026-10-01T09:00:00.000Z", { expiresAt: far, etag: "\"a1\"", lastModified: "Wed, 01 Oct 2026 08:00:00 GMT" }),
      { status: "unchanged", fetchedAt: "2026-10-02T09:00:00.000Z", freshness: { expiresAt: null, etag: "\"a1\"", lastModified: null } },
      changed("# A", "2026-10-03T09:00:00.000Z", { expiresAt: null, etag: "\"a3\"" }),
    ]);
    const first = await module.open(byUrl(KEY));

    // Fresh: storage answers, the Source is not asked and nothing is written.
    expect(await module.open(byUrl(KEY))).toEqual(first);
    expect(state.commands).toHaveLength(1);
    expect(state.batches).toHaveLength(1);

    // forceRefresh asks anyway; a 304 only refreshes the open period.
    expect(await module.open(byUrl(KEY, { forceRefresh: true }))).toEqual(first);
    expect(state.commands[1]).toEqual({ action: "read", url: KEY, etag: "\"a1\"", lastModified: "Wed, 01 Oct 2026 08:00:00 GMT", forceRefresh: true });
    expect(state.links.map((row) => [row.metadata, row.validFrom, row.validUntil])).toEqual([
      [{ lastGet: "2026-10-02T09:00:00.000Z", expiresAt: null }, "2026-10-01T09:00:00.000Z", null],
    ]);

    // Stale now; the same text again with a new ETag is the same version.
    expect((await module.open(byUrl(KEY))).pageId).toBe(first.pageId);
    expect(state.links.map((row) => row.metadata)).toEqual([{ lastGet: "2026-10-03T09:00:00.000Z", expiresAt: null }]);
    const pages = [...state.entities.values()].filter((entity) => entity.schemaId === "web.page");
    expect(pages.map((entity) => (entity.properties as { etag: string }).etag)).toEqual(["\"a1\""]);
  });

  it("tst_web_open_003 the text comes in windows of 50 KiB, a past moment is read from storage, and before the first version it fails", async () => {
    const text = `# Long\n\n${"Ж".repeat(40_000)}${"x".repeat(30_000)}`;
    const { state, module } = mount([
      changed(text, "2026-10-01T09:00:00.000Z"),
      changed("# Short", "2026-10-02T09:00:00.000Z"),
    ]);
    const first = await module.open(byUrl(KEY));
    const size = new TextEncoder().encode(text).length;
    expect(first.sizeBytes).toBe(size);
    let content = first.content;
    let next = first.nextOffset;
    let windows = 1;
    while (next !== null) {
      const window = await module.pageGet({ id: first.pageId, offset: next });
      expect(new TextEncoder().encode(window.content).length).toBeLessThanOrEqual(50 * 1024);
      content += window.content;
      next = window.nextOffset;
      windows += 1;
    }
    expect(content).toBe(text);
    expect(windows).toBe(3);

    await module.open(byUrl(KEY));
    const linkId = [...state.entities.values()].find((entity) => entity.schemaId === "web.link")?.id ?? "";
    const past = await module.open({ id: linkId, url: null, at: "2026-10-01T12:00:00.000Z", forceRefresh: false });
    expect(past.pageId).toBe(first.pageId);
    expect(state.commands).toHaveLength(2);
    await expect(module.open({ id: linkId, url: null, at: "2026-09-30T00:00:00.000Z", forceRefresh: false }))
      .rejects.toThrow("no version at or before 2026-09-30T00:00:00.000Z");
    await expect(module.open({ id: linkId, url: KEY, at: null, forceRefresh: false })).rejects.toThrow("give either id or url");
    await expect(module.open(byUrl("ftp://example.com/a"))).rejects.toThrow("is not an http or https URL");
  });
});

describe("web.link.get", () => {
  it("tst_web_open_003 web.link.get pages the versions newest first and lists the entities that reference the link", async () => {
    const { state, module } = mount([
      changed("# A", "2026-10-01T09:00:00.000Z"),
      changed("# B", "2026-10-02T09:00:00.000Z"),
      changed("# A", "2026-10-03T09:00:00.000Z"),
    ]);
    for (let read = 0; read < 3; read += 1) await module.open(byUrl(KEY));
    const link = [...state.entities.values()].find((entity) => entity.schemaId === "web.link");
    if (link === undefined) throw new Error("the link was not recorded");
    const message = canonicalEntity("telegram.message", null, "msg", "2026-10-04T00:00:00.000Z", {});
    state.entities.set(message.id, message);
    state.links.push({ ...contentsRow(message.id, link.id, null, "2026-10-04T00:00:00.000Z", null), kind: "references", validFrom: null });

    const first = await module.linkGet({ id: link.id, offset: 0, limit: 2 });
    expect(first.link.id).toBe(link.id);
    expect(first.versions.map(({ page, period }) => [page.name, period.validFrom, period.validUntil])).toEqual([
      ["Title at 2026-10-01T09:00:00.000Z", "2026-10-03T09:00:00.000Z", null],
      ["Title at 2026-10-02T09:00:00.000Z", "2026-10-02T09:00:00.000Z", "2026-10-03T09:00:00.000Z"],
    ]);
    expect(first.nextOffset).toBe(2);
    expect(first.referencedBy.map((entity) => entity.id)).toEqual([message.id]);
    const rest = await module.linkGet({ id: link.id, offset: 2, limit: 2 });
    expect(rest.versions.map(({ period }) => period.validFrom)).toEqual(["2026-10-01T09:00:00.000Z"]);
    expect(rest.nextOffset).toBeNull();
    expect(state.batches).toHaveLength(3);
  });
});

describe("web.link.ensure", () => {
  it("tst_web_ensure_001 two URLs give two refs and a fragment, and no Graph or Source call happens", async () => {
    const module = mountModule(WebModule, { graph: mockGraph(), ctx: { extensionId: "web" } }).module;
    const request: EnsureRequest = { schemaId: "web.link", items: [{ url: URL_A }, { url: "http://other.org/b" }, { url: KEY }] };
    const answer = await module.ensure(request);
    expect(answer.refs).toEqual([
      { kind: "canonical", schemaId: "web.link", canonicalKey: KEY },
      { kind: "canonical", schemaId: "web.link", canonicalKey: "http://other.org/b" },
      { kind: "canonical", schemaId: "web.link", canonicalKey: KEY },
    ]);
    expect(answer.fragment).toEqual({
      entities: [
        { ref: { kind: "canonical", schemaId: "web.link", canonicalKey: KEY }, schemaVersion: 1, name: KEY, idx: null, date: null, properties: { url: KEY, domain: "example.com" } },
        { ref: { kind: "canonical", schemaId: "web.link", canonicalKey: "http://other.org/b" }, schemaVersion: 1, name: "http://other.org/b", idx: null, date: null, properties: { url: "http://other.org/b", domain: "other.org" } },
      ],
      links: [],
    });
    await expect(module.ensure({ schemaId: "web.link", items: [{ url: KEY }, { url: "not a url" }] })).rejects.toThrow("item 1 is not an http or https URL");
  });
});
