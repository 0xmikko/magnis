// File plugin module — exercised through @magnis/testkit/module (mockGraph +
// mountModule), mirroring the other module __tests__. Validates the ported
// file.list / file.get / file.attach behaviour incl. cross-user isolation,
// the attachment-kind tightening, mime_prefix prefix-match +
// content-skip, and route-correct URL.

import { describe, expect, it } from "vitest";
import type { EntityWithLinks, JsonObject } from "@magnis/sdk";
import { entity, link, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
import { FileModule } from "../service.ts";

type G = MockGraph;

function makeGraph(): G {
  return mockGraph({
    getEntityFull: () => Promise.resolve(null),
    addLink: () => Promise.resolve(undefined),
    listEntitiesWindow: () => Promise.resolve(page([])),
    listLinksForEntity: () => Promise.resolve([]),
  });
}

function makeModule(graph: G): FileModule {
  return mountModule(FileModule, { graph, ctx: { extensionId: "file" } }).module;
}

// noUncheckedIndexedAccess: `spies` is Record<string, Mock>, so each lookup is
// `Mock | undefined`. Every op referenced below IS arranged by makeGraph, so a
// missing spy is a harness bug — surface it, never mask it.
function spy(graph: G, op: string): G["spies"][string] {
  const s = graph.spies[op];
  if (s === undefined) throw new Error(`file module test: spy '${op}' not arranged`);
  return s;
}

const ID_F = "00000000-0000-0000-0000-0000000000f1";
const ID_T = "00000000-0000-0000-0000-0000000000a1";

// S1: the dictionary rides the entity — arrangements set `properties`.
function detail(id: string, schemaId = "file.object", properties: JsonObject = {}): EntityWithLinks {
  return { entity: entity(id, "f", { schemaId, properties }), links: [] };
}
const DETAILS = { mime_type: "image/png", source_module: "uploads", source_ref: {}, local_path: "2020-01/uploads/a.png" };

describe("file.attach (per-user isolation + allowed link kinds)", () => {
  it("attaches when both entities are owned and file_id is a file.object", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull")
      .mockResolvedValueOnce(detail(ID_F, "file.object")) // file_id
      .mockResolvedValueOnce(detail(ID_T, "company.org")); // target_id
    const res = await makeModule(g).attach({ file_id: ID_F, target_id: ID_T });
    expect(res).toEqual({ status: "ok", file_id: ID_F, target_id: ID_T, kind: "file.attachment" });
    expect(g.spies.addLink).toHaveBeenCalledWith({ from: ID_T, to: ID_F, kind: "file.attachment" });
  });

  it("rejects a cross-user / missing file_id (getEntityFull → null) without linking", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull").mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.addLink).not.toHaveBeenCalled();
  });

  it("rejects a file_id that is not a file.object", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull").mockResolvedValueOnce(detail(ID_F, "notes.note"));
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.addLink).not.toHaveBeenCalled();
  });

  it("rejects a cross-user / missing target_id without linking", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull")
      .mockResolvedValueOnce(detail(ID_F, "file.object"))
      .mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.addLink).not.toHaveBeenCalled();
  });

  it("rejects an unsupported link kind", async () => {
    const g = makeGraph();
    await expect(
      makeModule(g).attach({ file_id: ID_F, target_id: ID_T, kind: "custom" }),
    ).rejects.toThrow(/unsupported attach kind/);
    expect(g.spies.addLink).not.toHaveBeenCalled();
  });
});

describe("file.get (ownership + schema + URL)", () => {
  it("returns details + route-correct url for an owned file", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull").mockResolvedValueOnce(
      detail(ID_F, "file.object", DETAILS),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.entity_id).toBe(ID_F);
    expect(res.url).toBe(`/files/${ID_F}`);
    expect(res.mime_type).toBe("image/png");
  });

  it("uses cloud_url when there is no local_path", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull").mockResolvedValueOnce(
      detail(ID_F, "file.object", { mime_type: "application/pdf", source_module: "s", source_ref: {}, cloud_url: "https://cdn/x.pdf" }),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.url).toBe("https://cdn/x.pdf");
  });

  it("not-found for a non-owned (null) or wrong-schema id", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull").mockResolvedValueOnce(null);
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
    spy(g, "getEntityFull").mockResolvedValueOnce(detail(ID_F, "notes.note"));
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
  });
});

describe("file.list (filters + content skip)", () => {
  it("filters by mime_prefix and skips rows without content", async () => {
    const g = makeGraph();
    // S1: the dictionary rides each entity of the window page.
    spy(g, "listEntitiesWindow").mockResolvedValue(page([
      entity("i1", "a.png", { schemaId: "file.object", properties: { mime_type: "image/png", source_module: "u", source_ref: {}, local_path: "a" } }),
      entity("i2", "b.pdf", { schemaId: "file.object", properties: { mime_type: "application/pdf", source_module: "u", source_ref: {}, local_path: "b" } }),
      entity("i3", "c.jpg", { schemaId: "file.object", properties: { mime_type: "image/jpeg", source_module: "u", source_ref: {} } }), // no content
    ]));
    const res = await makeModule(g).list({ mime_prefix: "image/" });
    expect(res.total).toBe(3); // total is the unfiltered count (matches native)
    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]); // i2 wrong mime, i3 no content
  });
});

/**
 * @test-id: tst_cat_entity_one_type_006
 * @covers: modules/file/module/service.ts::FileModule.list
 * @covers: modules/file/module/service.ts::FileModule.attach
 * @deterministic: yes
 *
 * The file module reads and writes the SDK shapes: a window page's items ARE
 * the entities, a link names its endpoints `from` and `to`, and an attachment
 * is written as the SDK `AddLinkParams`.
 */
describe("tst_cat_entity_one_type_006 — file speaks the SDK shapes", () => {
  it("tst_cat_entity_one_type_006 list reads window entities and filters by a parent link's `from`", async () => {
    const g = makeGraph();
    spy(g, "listEntitiesWindow").mockResolvedValue(page([
      entity("i1", "a", { schemaId: "file.object", properties: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "a" } }),
      entity("i2", "b", { schemaId: "file.object", properties: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "b" } }),
    ]));
    spy(g, "listLinksForEntity").mockImplementation((id: string) =>
      Promise.resolve(id === "i1" ? [link("parentX", "i1", "file.attachment")] : [link("other", "i2", "file.attachment")]),
    );

    const res = await makeModule(g).list({ parent_id: "parentX" });

    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]);
    expect(g.spies.listEntitiesWindow).toHaveBeenCalledWith({
      schema: "file.object",
      order: [{ field: { entityField: "date" }, desc: true }],
      limit: 50,
      offset: 0,
    });
  });

  it("tst_cat_entity_one_type_006 attach writes the SDK link input", async () => {
    const g = makeGraph();
    spy(g, "getEntityFull")
      .mockResolvedValueOnce(detail(ID_F, "file.object"))
      .mockResolvedValueOnce(detail(ID_T, "companies.company"));

    await makeModule(g).attach({ file_id: ID_F, target_id: ID_T });

    expect(g.spies.addLink).toHaveBeenCalledWith({ from: ID_T, to: ID_F, kind: "file.attachment" });
  });
});
