// File plugin module — unit tests against a mock GraphService (vi.fn spies),
// mirroring plugins/email/module/__tests__. Validates the ported file.list /
// file.get / file.attach behaviour incl. cross-user isolation (DEC-7), the
// attachment-kind tightening (DEC-11), mime_prefix prefix-match + content-skip
// (DEC-8), and route-correct URL (DEC-10).

import { describe, expect, it, vi } from "vitest";
import type { EntityDetail, GraphService, PluginDeps } from "@magnis/plugin-sdk";
import { FileModule } from "../service.ts";
import type { FileCanonical, FileFacets } from "../../types/index.ts";

function makeGraph() {
  return {
    get_entity_full: vi.fn<[string, unknown?], Promise<EntityDetail | null>>(),
    add_link: vi.fn().mockResolvedValue(undefined),
    list_entities_window: vi.fn(),
    list_entities_by_facet_field: vi.fn(),
    list_facets_for_entities: vi.fn().mockResolvedValue([]),
    list_links_for_entity: vi.fn().mockResolvedValue([]),
  } as unknown as GraphService<FileFacets, FileCanonical> & Record<string, ReturnType<typeof vi.fn>>;
}

function makeModule(graph: GraphService<FileFacets, FileCanonical>): FileModule {
  const deps = {
    graph,
    ctx: { extension_id: "file", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<FileFacets, FileCanonical>;
  return new FileModule(deps);
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

describe("file.attach (DEC-7 isolation, DEC-11 kind)", () => {
  it("attaches when both entities are owned and file_id is a file.object", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(entity(ID_F, "file.object")) // file_id
      .mockResolvedValueOnce(entity(ID_T, "company.org")); // target_id
    const res = await makeModule(g).attach({ file_id: ID_F, target_id: ID_T });
    expect(res).toEqual({ status: "ok", file_id: ID_F, target_id: ID_T, kind: "attachment" });
    expect(g.add_link).toHaveBeenCalledWith({ from_id: ID_T, to_id: ID_F, kind: "attachment" });
  });

  it("rejects a cross-user / missing file_id (get_entity_full → null) without linking", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.add_link).not.toHaveBeenCalled();
  });

  it("rejects a file_id that is not a file.object", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(entity(ID_F, "notes.note"));
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.add_link).not.toHaveBeenCalled();
  });

  it("rejects a cross-user / missing target_id without linking", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(entity(ID_F, "file.object"))
      .mockResolvedValueOnce(null);
    await expect(makeModule(g).attach({ file_id: ID_F, target_id: ID_T })).rejects.toThrow(/not found/);
    expect(g.add_link).not.toHaveBeenCalled();
  });

  it("rejects an unsupported link kind (DEC-11)", async () => {
    const g = makeGraph();
    await expect(
      makeModule(g).attach({ file_id: ID_F, target_id: ID_T, kind: "custom" }),
    ).rejects.toThrow(/unsupported attach kind/);
    expect(g.add_link).not.toHaveBeenCalled();
  });
});

describe("file.get (ownership + schema + URL)", () => {
  it("returns details + route-correct url for an owned file (DEC-10)", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      entity(ID_F, "file.object", [detailsFacet(DETAILS)]),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.entity_id).toBe(ID_F);
    expect(res.url).toBe(`/files/${ID_F}`);
    expect(res.mime_type).toBe("image/png");
  });

  it("uses cloud_url when there is no local_path", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      entity(ID_F, "file.object", [
        detailsFacet({ mime_type: "application/pdf", source_module: "s", source_ref: {}, cloud_url: "https://cdn/x.pdf" }),
      ]),
    );
    const res = await makeModule(g).get({ id: ID_F });
    expect(res.url).toBe("https://cdn/x.pdf");
  });

  it("not-found for a non-owned (null) or wrong-schema id", async () => {
    const g = makeGraph();
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
    (g.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValueOnce(entity(ID_F, "notes.note"));
    await expect(makeModule(g).get({ id: ID_F })).rejects.toThrow(/not found/);
  });
});

describe("file.list (filters + content skip)", () => {
  it("filters by mime_prefix and skips rows without content (DEC-8)", async () => {
    const g = makeGraph();
    (g.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ entity: { id: "i1" } }, { entity: { id: "i2" } }, { entity: { id: "i3" } }],
      total: 3,
    });
    (g.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entity_id: "i1", schema_id: "file.details", data: { mime_type: "image/png", source_module: "u", source_ref: {}, local_path: "a" } },
      { entity_id: "i2", schema_id: "file.details", data: { mime_type: "application/pdf", source_module: "u", source_ref: {}, local_path: "b" } },
      { entity_id: "i3", schema_id: "file.details", data: { mime_type: "image/jpeg", source_module: "u", source_ref: {} } }, // no content
    ]);
    const res = await makeModule(g).list({ mime_prefix: "image/" });
    expect(res.total).toBe(3); // total is the unfiltered count (matches native)
    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]); // i2 wrong mime, i3 no content
  });

  it("filters by parent_id via a links query (DEC-8)", async () => {
    const g = makeGraph();
    (g.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ entity: { id: "i1" } }, { entity: { id: "i2" } }],
      total: 2,
    });
    (g.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entity_id: "i1", schema_id: "file.details", data: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "a" } },
      { entity_id: "i2", schema_id: "file.details", data: { mime_type: "x/y", source_module: "u", source_ref: {}, local_path: "b" } },
    ]);
    (g.list_links_for_entity as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) =>
      id === "i1" ? [{ from_id: "parentX", to_id: "i1", kind: "attachment" }] : [],
    );
    const res = await makeModule(g).list({ parent_id: "parentX" });
    expect(res.items.map((i) => i.entity_id)).toEqual(["i1"]);
  });
});
