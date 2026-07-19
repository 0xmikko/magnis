// Projects read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. List fields read CANONICAL (project.* are
// single_aligned, confidence→recency — a latest-facet window would not
// reproduce it), hydrated per page in ONE list_canonical_for_entities batch:
//   list (no search): list_entities(order:"date", pinned-first) + batch canonical
//   list (search):    search_entities_by_name + batch canonical (no sort, native)
//   list_for_entity:  list_linked (P3) + batch canonical (no per-link N+1)
// get is already efficient (P1 + get_entities + get_canonical) and is NOT
// retested here. tst_be_projectsread_001 (shape) + tst_be_projectsdb_001 (INV-6/10).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalRecord,
  EntityPage,
  GraphService,
  LinkedPage,
  PluginDeps,
  RawEntity,
} from "@magnis/plugin-sdk";
import { ProjectsModule } from "./service.ts";
import type { ProjectCanonical, ProjectFacets } from "../types/index.ts";

const SCHEMA = "projects.project";
const MEMBER_LINK = "belongs_to";

function makeGraph(): GraphService<ProjectFacets, ProjectCanonical> {
  const reject =
    (name: string) =>
    (..._args: unknown[]): never => {
      throw new Error(`unexpected graph op on read path: ${name}`);
    };
  return {
    // no-search page query — keeps pinned-first (the window does not).
    list_entities: vi.fn<(a: unknown) => Promise<EntityPage>>(),
    search_entities_by_name: vi.fn<(a: unknown) => Promise<RawEntity[]>>(),
    list_canonical_for_entities: vi.fn<(a: string[]) => Promise<CanonicalRecord[]>>().mockResolvedValue([]),
    list_linked: vi.fn<(a: unknown) => Promise<LinkedPage>>(),
    // requireOwned uses get_entity once on the listForEntity path — allowed.
    get_entity: vi.fn<(a: string) => Promise<RawEntity | null>>(),
    // ops these paths must never hit
    list_entities_window: vi.fn(reject("list_entities_window")),
    list_facets_for_entities: vi.fn(reject("list_facets_for_entities")),
    get_canonical: vi.fn(reject("get_canonical")),
    list_facets_for_entity: vi.fn(reject("list_facets_for_entity")),
    list_links_for_entity: vi.fn(reject("list_links_for_entity")),
  } as unknown as GraphService<ProjectFacets, ProjectCanonical>;
}

function makeModule(graph: GraphService<ProjectFacets, ProjectCanonical>): ProjectsModule {
  const deps = {
    graph,
    ctx: { extension_id: "projects", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<ProjectFacets, ProjectCanonical>;
  return new ProjectsModule(deps);
}

const ENT = (id: string, name: string): RawEntity => ({ id, schema_id: SCHEMA, name, created_at: "2026-01-01T00:00:00Z" });
const canon = (entity_id: string, key: string, value: unknown): CanonicalRecord => ({ entity_id, key, value });

describe("projects read — shape parity (tst_be_projectsread_001)", () => {
  let graph: GraphService<ProjectFacets, ProjectCanonical>;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("F1 list (no search): list_entities(order:date, pinned-first) + batch canonical; name/status from canonical", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [ENT("b", "Beta"), ENT("a", "")],
      total: 2,
    } satisfies EntityPage);
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("b", "project.status", "active"),
      canon("a", "project.name", "Alpha"),
      canon("a", "project.status", "done"),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["b", "a"]); // DB order preserved
    expect(page.items[0]).toMatchObject({ name: "Beta", status: "active" });
    expect(page.items[1].name).toBe("Alpha"); // entity.name empty → canonical name

    const arg = (graph.list_entities as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({ schema_id: SCHEMA, order: "date" }); // pinned-first preserving
  });

  it("F1b untitled fallback when entity.name and canonical name both absent", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [ENT("x", "")], total: 1 });
    const page = await mod.list({});
    expect(page.items[0].name).toBe("Untitled Project");
    expect(page.items[0].status).toBeNull();
  });

  it("F2 list (search): batch canonical hydrate; total = matched.length", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([
      ENT("a", "Alpha"),
      ENT("b", "Alphabet"),
    ]);
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("a", "project.status", "active"),
    ]);

    const page = await mod.list({ search: "alph", limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["a"]);
    expect(page.items[0].status).toBe("active");
  });

  it("F3 list_for_entity: list_linked + batch canonical (no per-link fetch)", async () => {
    (graph.get_entity as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "person-1", schema_id: "contacts.person", name: "Alice" });
    (graph.list_linked as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { entity: ENT("p1", "Proj One"), data: null, link: { id: "l1", from_id: "person-1", to_id: "p1", kind: MEMBER_LINK } },
        { entity: ENT("p2", "Proj Two"), data: null, link: { id: "l2", from_id: "person-1", to_id: "p2", kind: MEMBER_LINK } },
      ],
      total: 2,
    });
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("p1", "project.status", "active"),
      canon("p2", "project.status", "done"),
    ]);

    const out = await mod.listForEntity({ entity_id: "person-1" });
    expect(out.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(out[0]).toMatchObject({ name: "Proj One", status: "active" });

    const spec = (graph.list_linked as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(spec).toMatchObject({ parent_id: "person-1", link_kind: MEMBER_LINK, direction: "out", child_schema: SCHEMA });
  });

  it("F4 list_for_entity throws on a non-owned / missing parent (requireOwned)", async () => {
    (graph.get_entity as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(mod.listForEntity({ entity_id: "ghost" })).rejects.toThrow();
  });

  it("F5 empty list → {items:[], total:0}", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    const page = await mod.list({});
    expect(page).toMatchObject({ items: [], total: 0 });
  });
});

describe("projects read — DB-access guarantees (tst_be_projectsdb_001 / INV-6)", () => {
  let graph: GraphService<ProjectFacets, ProjectCanonical>;
  let mod: ProjectsModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("list (no search) = 1 list_entities + 1 batch canonical, 0 window, 0 search", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    await mod.list({});
    expect(graph.list_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(0);
  });

  it("list (search) = 1 search + 1 batch canonical, 0 list_entities", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await mod.list({ search: "x" });
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_entities).toHaveBeenCalledTimes(0);
  });

  it("list_for_entity = 1 requireOwned + 1 list_linked + 1 batch canonical, 0 per-link", async () => {
    (graph.get_entity as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "e", schema_id: "contacts.person", name: "A" });
    (graph.list_linked as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    await mod.listForEntity({ entity_id: "e" });
    expect(graph.get_entity).toHaveBeenCalledTimes(1);
    expect(graph.list_linked).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
  });
});
