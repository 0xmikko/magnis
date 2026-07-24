// Projects read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. List fields read CANONICAL (project.* are
// single_aligned, confidence→recency — a latest-facet window would not
// reproduce it), hydrated per page in ONE list_canonical_for_entities batch:
//   list (no search): list_entities(order:"date", pinned-first) + batch canonical
//   list (search):    search_entities_by_name + batch canonical (no sort, native)
//   list_for_entity:  list_linked + batch canonical (no per-link N+1)
// get is already efficient (get_entity_full + get_entities + get_canonical) and is NOT
// retested here. tst_be_projectsread_001 (shape) + tst_be_projectsdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// any op these read paths did NOT arrange (list_entities_window / get_canonical /
// list_facets_for_entity / list_links_for_entity — the traps) throws
// `unexpected graph op: …` and fails the test.

import { beforeEach, describe, expect, it } from "vitest";
import { canonical, entity, linkedRow, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { ProjectsModule } from "../service.ts";
import { MEMBER_LINK, PROJECT } from "../../schema.ts";
import type { ProjectCanonical, ProjectFacets } from "../../types.ts";

type G = MockGraph<ProjectFacets, ProjectCanonical>;

// `graph.spies` is a `Record<string, Mock>`, so under noUncheckedIndexedAccess
// every lookup is `Mock | undefined`. A spy this test arranges/asserts always
// exists by construction; surface a clear failure if it somehow does not.
function spy(g: G, name: string) {
  const s = g.spies[name];
  if (s === undefined) throw new Error(`test setup: spy "${name}" not registered`);
  return s;
}

// The read-path ops, arranged with benign defaults; individual tests re-arm them.
// `get_entity` is allowed (requireOwned uses it once on the listForEntity path).
// Ops NOT listed here stay unarranged, so the throwing Proxy fails the test if
// the read path hits them.
function readGraph(): G {
  return mockGraph<ProjectFacets, ProjectCanonical>({
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    list_canonical_for_entities: () => Promise.resolve([]),
    list_linked: () => Promise.resolve({ items: [], total: 0 }),
    get_entity: () => Promise.resolve(null),
  });
}

const ent = (id: string, name: string) => entity(id, name, { schema_id: PROJECT });

describe("projects read — shape parity (tst_be_projectsread_001)", () => {
  let graph: G;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ProjectsModule, { graph, ctx: { extension_id: "projects" } }).module;
  });

  it("F1 list (no search): list_entities(order:date, pinned-first) + batch canonical; name/status from canonical", async () => {
    spy(graph, "list_entities").mockResolvedValue({
      items: [ent("b", "Beta"), ent("a", "")],
      total: 2,
    });
    spy(graph, "list_canonical_for_entities").mockResolvedValue([
      canonical("b", "project.status", "active"),
      canonical("a", "project.name", "Alpha"),
      canonical("a", "project.status", "done"),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    const i0 = page.items[0];
    const i1 = page.items[1];
    if (i0 === undefined || i1 === undefined) throw new Error("F1: expected two items");
    expect(page.items.map((i) => i.id)).toEqual(["b", "a"]); // DB order preserved
    expect(i0).toMatchObject({ name: "Beta", status: "active" });
    expect(i1.name).toBe("Alpha"); // entity.name empty → canonical name

    const call0 = spy(graph, "list_entities").mock.calls[0];
    if (call0 === undefined) throw new Error("F1: list_entities not called");
    const arg = call0[0];
    expect(arg).toMatchObject({ schema_id: PROJECT, order: "date" }); // pinned-first preserving
  });

  it("F1b untitled fallback when entity.name and canonical name both absent", async () => {
    spy(graph, "list_entities").mockResolvedValue({ items: [ent("x", "")], total: 1 });
    const page = await mod.list({});
    const item = page.items[0];
    if (item === undefined) throw new Error("F1b: expected one item");
    expect(item.name).toBe("Untitled Project");
    expect(item.status).toBeNull();
  });

  it("F2 list (search): batch canonical hydrate; total = matched.length", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([ent("a", "Alpha"), ent("b", "Alphabet")]);
    spy(graph, "list_canonical_for_entities").mockResolvedValue([canonical("a", "project.status", "active")]);

    const page = await mod.list({ search: "alph", limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["a"]);
    const item = page.items[0];
    if (item === undefined) throw new Error("F2: expected one matched item");
    expect(item.status).toBe("active");
  });

  it("F3 list_for_entity: list_linked + batch canonical (no per-link fetch)", async () => {
    spy(graph, "get_entity").mockResolvedValue(entity("person-1", "Alice", { schema_id: "contacts.person" }));
    spy(graph, "list_linked").mockResolvedValue({
      items: [
        linkedRow(ent("p1", "Proj One"), null, { id: "l1", from_id: "person-1", to_id: "p1", kind: MEMBER_LINK }),
        linkedRow(ent("p2", "Proj Two"), null, { id: "l2", from_id: "person-1", to_id: "p2", kind: MEMBER_LINK }),
      ],
      total: 2,
    });
    spy(graph, "list_canonical_for_entities").mockResolvedValue([
      canonical("p1", "project.status", "active"),
      canonical("p2", "project.status", "done"),
    ]);

    const out = await mod.listForEntity({ entity_id: "person-1" });
    expect(out.map((p) => p.id)).toEqual(["p1", "p2"]);
    const out0 = out[0];
    if (out0 === undefined) throw new Error("F3: expected at least one linked project");
    expect(out0).toMatchObject({ name: "Proj One", status: "active" });

    const call0 = spy(graph, "list_linked").mock.calls[0];
    if (call0 === undefined) throw new Error("F3: list_linked not called");
    const spec = call0[0];
    expect(spec).toMatchObject({ parent_id: "person-1", link_kind: MEMBER_LINK, direction: "out", child_schema: PROJECT });
  });

  it("F4 list_for_entity throws on a non-owned / missing parent (requireOwned)", async () => {
    spy(graph, "get_entity").mockResolvedValue(null);
    await expect(mod.listForEntity({ entity_id: "ghost" })).rejects.toThrow();
  });

  it("F5 empty list → {items:[], total:0}", async () => {
    spy(graph, "list_entities").mockResolvedValue({ items: [], total: 0 });
    const page = await mod.list({});
    expect(page).toMatchObject({ items: [], total: 0 });
  });
});

describe("projects read — DB-access guarantees (tst_be_projectsdb_001)", () => {
  let graph: G;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ProjectsModule, { graph, ctx: { extension_id: "projects" } }).module;
  });

  it("list (no search) = 1 list_entities + 1 batch canonical, 0 window, 0 search", async () => {
    await mod.list({});
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(0);
  });

  it("list (search) = 1 search + 1 batch canonical, 0 list_entities", async () => {
    await mod.list({ search: "x" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(0);
  });

  it("list_for_entity = 1 requireOwned + 1 list_linked + 1 batch canonical, 0 per-link", async () => {
    spy(graph, "get_entity").mockResolvedValue(entity("e", "A", { schema_id: "contacts.person" }));
    await mod.listForEntity({ entity_id: "e" });
    expect(graph.spies.get_entity).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_linked).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
  });
});
