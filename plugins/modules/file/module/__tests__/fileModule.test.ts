// File plugin module — exercised through @magnis/testkit/module (mockGraph +
// mountModule), mirroring the other module __tests__. Validates the ported
// file.list / file.get / file.attach behaviour incl. cross-user isolation,
// the attachment-kind tightening, mime_prefix prefix-match +
// content-skip, and route-correct URL.

import { describe, expect, it } from "vitest";
import type { EntityDetail } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { FileModule } from "../service.ts";
import type { FileCanonical, FileFacets } from "../../types.ts";

type G = MockGraph<FileFacets, FileCanonical>;

function makeGraph(): G {
  return mockGraph<FileFacets, FileCanonical>({
    get_entity_full: () => Promise.resolve(null),
    add_link: () => Promise.resolve(undefined),
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    list_entities_by_facet_field: () => Promise.resolve({ items: [], total: 0 }),
    list_facets_for_entities: () => Promise.resolve([]),
    list_links_for_entity: () => Promise.resolve([]),
  });
}

function makeModule(graph: G): FileModule {
  return mountModule(FileModule, { graph, ctx: { extension_id: "file" } }).module;
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

function entity(id: string, schema = "file.object", facets: unknown[] = []): EntityDetail {
  return {
    entity: { id, schema_id: schema, name: "f", created_at: "2020-01-01T00:00:00Z" },
    facets,
    links: [],
  } as unknown as EntityDetail;
}
const detailsFacet = (data: Record<string, unknown>) => ({
  id: "fd",
  schema_id: "file.details",
  source: "x",
  observed_at: "2020-01-01T00:00:00Z",
  data,
});
const DETAILS = { mime_type: "image/png", source_module: "uploads", source_ref: {}, local_path: "2020-01/uploads/a.png" };

describe("file.attach (per-user isolation + allowed link kinds)", () => {
  it("attaches when both entities are owned and file_id is a file.object", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full")
      .mockResolvedValueOnce(entity(ID_F, "file.object")) // file_id
      .mockResolvedValueOnce(entity(ID_T, "company.org")); // target_id
    const res = await makeModule(g).attach({ file_id: ID_F, target_id: ID_T });
    expect(res).toEqual({ status: "ok", file_id: ID_F, target_id: ID_T, kind: "attachment" });
    expect(g.spies.add_link).toHaveBeenCalledWith({ from_id: ID_T, to_id: ID_F, kind: "attachment" });
  });

  it("rejects a cross-user / missing file_id (get_entity_full → null) without linking", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full").mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.add_link).not.toHaveBeenCalled();
  });

  it("rejects a file_id that is not a file.object", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full").mockResolvedValueOnce(entity(ID_F, "notes.note"));
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.add_link).not.toHaveBeenCalled();
  });

  it("rejects a cross-user / missing target_id without linking", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full")
      .mockResolvedValueOnce(entity(ID_F, "file.object"))
      .mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.spies.add_link).not.toHaveBeenCalled();
  });

  it("rejects an unsupported link kind", async () => {
    const g = makeGraph();
    await expect(
      makeModule(g).attach({ file_id: ID_F, target_id: ID_T, kind: "custom" }),
    ).rejects.toThrow(/unsupported attach kind/);
    expect(g.spies.add_link).not.toHaveBeenCalled();
  });
});

describe("file.get (ownership + schema + URL)", () => {
  it("returns details + route-correct url for an owned file", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full").mockResolvedValueOnce(
      entity(ID_F, "file.object", [detailsFacet(DETAILS)]),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.entity_id).toBe(ID_F);
    expect(res.url).toBe(`/files/${ID_F}`);
    expect(res.mime_type).toBe("image/png");
  });

  it("uses cloud_url when there is no local_path", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full").mockResolvedValueOnce(
      entity(ID_F, "file.object", [
        detailsFacet({ mime_type: "application/pdf", source_module: "s", source_ref: {}, cloud_url: "https://cdn/x.pdf" }),
      ]),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.url).toBe("https://cdn/x.pdf");
  });

  it("not-found for a non-owned (null) or wrong-schema id", async () => {
    const g = makeGraph();
    spy(g, "get_entity_full").mockResolvedValueOnce(null);
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
    spy(g, "get_entity_full").mockResolvedValueOnce(entity(ID_F, "notes.note"));
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
  });
});

describe("file.list (filters + content skip)", () => {
  it("filters by mime_prefix and skips rows without content", async () => {
    const g = makeGraph();
    spy(g, "list_entities_window").mockResolvedValue({
      items: [{ entity: { id: "i1" } }, { entity: { id: "i2" } }, { entity: { id: "i3" } }],
      total: 3,
    });
    spy(g, "list_facets_for_entities").mockResolvedValue([
      { entity_id: "i1", schema_id: "file.details", data: { mime_type: "image/png", source_module: "u", source_ref: {}, local_path: "a" } },
      { entity_id: "i2", schema_id: "file.details", data: { mime_type: "application/pdf", source_module: "u", source_ref: {}, local_path: "b" } },
      { entity_id: "i3", schema_id: "file.details", data: { mime_type: "image/jpeg", source_module: "u", source_ref: {} } }, // no content
    ]);
    const res = await makeModule(g).list({ mime_prefix: "image/" });
    expect(res.total).toBe(3); // total is the unfiltered count (matches native)
    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]); // i2 wrong mime, i3 no content
  });

  it("filters by parent_id via a links query", async () => {
    const g = makeGraph();
    spy(g, "list_entities_window").mockResolvedValue({
      items: [{ entity: { id: "i1" } }, { entity: { id: "i2" } }],
      total: 2,
    });
    spy(g, "list_facets_for_entities").mockResolvedValue([
      { entity_id: "i1", schema_id: "file.details", data: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "a" } },
      { entity_id: "i2", schema_id: "file.details", data: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "b" } },
    ]);
    spy(g, "list_links_for_entity").mockImplementation(async (id: string) =>
      id === "i1" ? [{ from_id: "parentX", to_id: "i1", kind: "attachment" }] : [],
    );
    const res = await makeModule(g).list({ parent_id: "parentX" });
    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]);
  });
});
