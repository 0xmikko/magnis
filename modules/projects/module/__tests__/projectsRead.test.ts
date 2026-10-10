/**
 * @test-id: tst_module_projects_read_001
 * @scenario: scn_projects_crud_001
 * @covers: ProjectsModule.list, ProjectsModule.listForEntity
 * @deterministic: yes
 * @fixtures: strict graph read doubles
 * @legacy-id: tst_int_projrpc_002_projects_list_sees_newly_created_project
 */
// Projects read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. List fields read CANONICAL (project.* are
// single_aligned, confidence→recency — a latest-record window would not
// reproduce it), hydrated per page in ONE list_canonical_for_entities batch:
//   list (no search): listEntities(order:"date", pinned-first) + batch canonical
//   list (search):    searchEntitiesByName + batch canonical (no sort, native)
//   list_for_entity:  listLinked + batch canonical (no per-link N+1)
// get is already efficient (getEntityFull + getEntities + get_canonical) and is NOT
// retested here. tst_be_projectsread_001 (shape) + tst_be_projectsdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// any op these read paths did NOT arrange (listEntitiesWindow / get_canonical /
// list_facets_for_entity / listLinksForEntity — the traps) throws
// `unexpected graph op: …` and fails the test.

import { beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "@magnis/sdk";
import { entityId, entityExtras, entityRead, entity, linkedEntity, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
import { ProjectsModule } from "../service.ts";
import { MEMBER_LINK, PROJECT } from "../../schema.ts";
import type { ProjectCanonical } from "../../types.ts";

type G = MockGraph;

// `graph.spies` is a `Record<string, Mock>`, so under noUncheckedIndexedAccess
// every lookup is `Mock | undefined`. A spy this test arranges/asserts always
// exists by construction; surface a clear failure if it somehow does not.
function spy(g: G, name: string) {
  const s = g.spies[name];
  if (s === undefined) throw new Error(`test setup: spy "${name}" not registered`);
  return s;
}

// The read-path ops, arranged with benign defaults; individual tests re-arm them.
// `getEntity` is allowed (requireOwned uses it once on the listForEntity path).
// Ops NOT listed here stay unarranged, so the throwing Proxy fails the test if
// the read path hits them.
function readGraph(): G {
  return mockGraph({
    listEntities: () => Promise.resolve(page([])),
    searchEntitiesByName: () => Promise.resolve([]),
    listLinked: () => Promise.resolve(page([])),
    getEntity: () => Promise.resolve(null),
  });
}

const ent = (id: string, name: string, props: JsonObject = {}) =>
  entityRead(entity(id, name, { schemaId: PROJECT, properties: props }), entityExtras());

describe("projects read — shape parity (tst_be_projectsread_001)", () => {
  let graph: G;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ProjectsModule, { graph, ctx: { extensionId: "projects" } }).module;
  });

  it("F1 list (no search): listEntities(order:date, pinned-first); name/status from the dictionary (S1)", async () => {
    spy(graph, "listEntities").mockResolvedValue(
      page([ent("b", "Beta", { status: "active" }), ent("a", "", { name: "Alpha", status: "done" })]),
    );

    const listed = await mod.list({ limit: 50, offset: 0 });
    expect(listed.total).toBe(2);
    const i0 = listed.items[0];
    const i1 = listed.items[1];
    if (i0 === undefined || i1 === undefined) throw new Error("F1: expected two items");
    expect(listed.items.map((i) => i.id)).toEqual([entityId("b"), entityId("a")]); // DB order preserved
    expect(i0).toMatchObject({ name: "Beta", status: "active" });
    expect(i1.name).toBe("Alpha"); // entity.name empty → canonical name

    const call0 = spy(graph, "listEntities").mock.calls[0];
    if (call0 === undefined) throw new Error("F1: listEntities not called");
    const arg = call0[0];
    expect(arg).toMatchObject({ schemaId: PROJECT, order: "date" }); // pinned-first preserving
  });

  it("F1b untitled fallback when entity.name and canonical name both absent", async () => {
    spy(graph, "listEntities").mockResolvedValue(page([ent("x", "")]));
    const listed = await mod.list({});
    const item = listed.items[0];
    if (item === undefined) throw new Error("F1b: expected one item");
    expect(item.name).toBe("Untitled Project");
    expect(item.status).toBeNull();
  });

  it("F2 list (search): the dictionary rides the matches; total = matched.length", async () => {
    spy(graph, "searchEntitiesByName").mockResolvedValue([
      ent("a", "Alpha", { status: "active" }),
      ent("b", "Alphabet"),
    ]);

    const listed = await mod.list({ search: "alph", limit: 1, offset: 0 });
    expect(listed.total).toBe(2);
    expect(listed.items.map((i) => i.id)).toEqual([entityId("a")]);
    const item = listed.items[0];
    if (item === undefined) throw new Error("F2: expected one matched item");
    expect(item.status).toBe("active");
  });

  it("F3 list_for_entity: listLinked, dictionary on each row (no per-link fetch)", async () => {
    spy(graph, "getEntity").mockResolvedValue(entity("person-1", "Alice", { schemaId: "contacts.person" }));
    spy(graph, "listLinked").mockResolvedValue(
      page([
        { ...linkedEntity(ent("p1", "Proj One", { status: "active" }).entity, { id: "l1", from: entityId("person-1"), to: entityId("p1"), kind: MEMBER_LINK }), extras: entityExtras() },
        { ...linkedEntity(ent("p2", "Proj Two", { status: "done" }).entity, { id: "l2", from: entityId("person-1"), to: entityId("p2"), kind: MEMBER_LINK }), extras: entityExtras() },
      ]),
    );

    const out = await mod.listForEntity({ entity_id: "person-1" });
    expect(out.map((p) => p.id)).toEqual([entityId("p1"), entityId("p2")]);
    const out0 = out[0];
    if (out0 === undefined) throw new Error("F3: expected at least one linked project");
    expect(out0).toMatchObject({ name: "Proj One", status: "active" });

    const call0 = spy(graph, "listLinked").mock.calls[0];
    if (call0 === undefined) throw new Error("F3: listLinked not called");
    const spec = call0[0];
    expect(spec).toMatchObject({ parentId: "person-1", linkKind: MEMBER_LINK, direction: "out", childSchema: PROJECT });
  });

  it("F4 list_for_entity throws on a non-owned / missing parent (requireOwned)", async () => {
    spy(graph, "getEntity").mockResolvedValue(null);
    await expect(mod.listForEntity({ entity_id: "ghost" })).rejects.toThrow();
  });

  it("F5 empty list → {items:[], total:0}", async () => {
    spy(graph, "listEntities").mockResolvedValue(page([]));
    const listed = await mod.list({});
    expect(listed).toMatchObject({ items: [], total: 0 });
  });
});

describe("projects read — DB-access guarantees (tst_be_projectsdb_001)", () => {
  let graph: G;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ProjectsModule, { graph, ctx: { extensionId: "projects" } }).module;
  });

  it("list (no search) = 1 listEntities, 0 0 window, 0 search", async () => {
    await mod.list({});
    expect(graph.spies.listEntities).toHaveBeenCalledTimes(1);
    // S1: the dictionary rides the entity — the canonical batch is gone.
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledTimes(0);
  });

  it("list (search) = 1 search, 0 0 listEntities", async () => {
    await mod.list({ search: "x" });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledTimes(1);
    // S1: the dictionary rides the entity — the canonical batch is gone.
    expect(graph.spies.listEntities).toHaveBeenCalledTimes(0);
  });

  it("list_for_entity = 1 requireOwned + 1 listLinked, 0 0 per-link", async () => {
    spy(graph, "getEntity").mockResolvedValue(entity("e", "A", { schemaId: "contacts.person" }));
    await mod.listForEntity({ entity_id: "e" });
    expect(graph.spies.getEntity).toHaveBeenCalledTimes(1);
    expect(graph.spies.listLinked).toHaveBeenCalledTimes(1);
    // S1: the dictionary rides the entity — the canonical batch is gone.
  });
});
