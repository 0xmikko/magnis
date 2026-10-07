/** Existing links move over, of the web-source plan (`docs/plans/web-source.md`
 * in magnis-app, Stage D2-S3): `web.repair` turns each native link's stored
 * text into its first page in bounded passes that a repeated call resumes,
 * and `open` repairs such a link before it records anything newer.
 * @test-id: tst_web_repair_001
 */
import { describe, expect, it } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";
import type { JsonObject } from "@magnis/sdk";

import { WebModule } from "../service.ts";
import { canonicalEntity, contentsRow, webGraph } from "./webGraph.ts";

type SourceAnswer = NonNullable<Parameters<typeof webGraph>[0]>[number];

function nativeLink(url: string, createdAt: string, content: JsonObject | null) {
  return canonicalEntity("web.link", url, "A page", createdAt, {
    url: "https://preview.example/overwritten", domain: new URL(url).hostname, title: `Native ${url}`,
    ...(content === null ? {} : { content }),
  }, createdAt);
}

function mount(answers: SourceAnswer[] = []) {
  const { state, overrides } = webGraph(answers);
  const module = mountModule(WebModule, { graph: mockGraph(overrides), ctx: { extensionId: "web" } }).module;
  return { state, module };
}

describe("web.repair", () => {
  it("tst_web_repair_001 two passes of two cover three links, a third repairs nothing, and a link without extracted_at fails", async () => {
    const { state, module } = mount();
    const links = ["https://a.example/1", "https://b.example/2", "https://c.example/3"].map((url, index) =>
      nativeLink(url, `2026-09-0${String(index + 1)}T00:00:00.000Z`, {
        content_markdown: `# ${url}`, content_length: 10, extracted_at: `2026-09-1${String(index)}T10:00:00.000Z`,
        etag: `"e${String(index)}"`, last_modified: "Tue, 01 Sep 2026 00:00:00 GMT", expires_at: "2026-09-20T00:00:00.000Z",
      }));
    const plain = nativeLink("https://d.example/4", "2026-09-04T00:00:00.000Z", null);
    const message = canonicalEntity("telegram.message", null, "msg", "2026-09-05T00:00:00.000Z", {});
    for (const entity of [...links, plain, message]) state.entities.set(entity.id, entity);
    const [first] = links;
    if (first === undefined) throw new Error("fixture links missing");
    state.links.push({ ...contentsRow(message.id, first.id, null, "2026-09-05T00:00:00.000Z", null), kind: "references", validFrom: null });
    const dictionaries = links.map((entity) => structuredClone(entity.properties));

    expect(await module.repair({ offset: 0, limit: 2 })).toEqual({ repaired: 2, scanned: 2, nextOffset: 2 });
    expect(await module.repair({ offset: 2, limit: 2 })).toEqual({ repaired: 1, scanned: 1, nextOffset: null });
    expect(await module.repair({ offset: 0, limit: 2 })).toEqual({ repaired: 0, scanned: 2, nextOffset: 2 });

    for (const [index, link] of links.entries()) {
      expect(state.entities.get(link.id)?.properties).toEqual(dictionaries[index]);
      const rows = state.links.filter((row) => row.kind === "contents" && row.from === link.id);
      expect(rows.map((row) => [row.validFrom, row.validUntil, row.metadata])).toEqual([[
        `2026-09-1${String(index)}T10:00:00.000Z`, null,
        { lastGet: `2026-09-1${String(index)}T10:00:00.000Z`, expiresAt: "2026-09-20T00:00:00.000Z" },
      ]]);
      const page = state.entities.get(rows[0]?.to ?? "");
      expect(page).toMatchObject({
        schemaId: "web.page", name: `Native ${link.canonicalKey ?? ""}`, date: `2026-09-1${String(index)}T10:00:00.000Z`,
        properties: { url: link.canonicalKey, mimeType: "text/markdown", etag: `"e${String(index)}"`, lastModified: "Tue, 01 Sep 2026 00:00:00 GMT" },
      });
    }
    expect(state.links.filter((row) => row.kind === "references").map((row) => [row.from, row.to])).toEqual([[message.id, first.id]]);
    expect(state.batches).toHaveLength(2);

    const broken = nativeLink("https://e.example/5", "2026-09-06T00:00:00.000Z", { content_markdown: "# no date" });
    state.entities.set(broken.id, broken);
    await expect(module.repair({ offset: 0, limit: 10 })).rejects.toThrow(`web.link ${broken.id} has native text but no extracted_at`);
  });

  it("tst_web_repair_001 open repairs a native link's text in the batch that records the fetch", async () => {
    const { state, module } = mount([
      { status: "unchanged", fetchedAt: "2026-10-01T09:00:00.000Z", freshness: { expiresAt: null, etag: "\"e0\"", lastModified: null } },
    ]);
    const native = nativeLink("https://a.example/1", "2026-09-01T00:00:00.000Z", {
      content_markdown: "# native", extracted_at: "2026-09-10T10:00:00.000Z", etag: "\"e0\"",
    });
    state.entities.set(native.id, native);

    const read = await module.open({ id: native.id, url: null, at: null, forceRefresh: false });
    expect(read).toMatchObject({ url: "https://a.example/1", title: "Native https://a.example/1", firstSeen: "2026-09-10T10:00:00.000Z", content: "# native" });
    expect(state.commands).toEqual([{ action: "read", url: "https://a.example/1", etag: "\"e0\"", lastModified: null, forceRefresh: false }]);
    expect(state.batches).toHaveLength(1);
    expect(state.links.map((row) => [row.validFrom, row.validUntil, row.metadata])).toEqual([
      ["2026-09-10T10:00:00.000Z", null, { lastGet: "2026-10-01T09:00:00.000Z", expiresAt: null }],
    ]);
  });
});
