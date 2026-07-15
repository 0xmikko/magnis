// Companies read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. List fields read CANONICAL (single_aligned, resolved
// by confidence→recency — a latest-facet window would not reproduce it),
// hydrated per page in ONE list_canonical_for_entities batch (no per-row N+1):
//   list (no search): list_entities_window (page+order:idx, no facet) + batch canonical
//   list (search):    search_entities_by_name + alphabetical sort + batch canonical
//   get:              get_entity_full (user-scoped entity) + list_facets_for_entity
//                     (ALL facets for the DTO) + get_canonical (base/header)
// Mirrors email/__tests__/emailRead.test.ts. tst_be_companiesread_001 (shape) +
// tst_be_companiesdb_001 (op-counts → INV-1/2/3/10).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalRecord,
  EntityDetail,
  FacetRecord,
  GraphService,
  PluginDeps,
  RawEntity,
  WindowPage,
} from "@magnis/plugin-sdk";
import { CompaniesModule } from "../service.ts";
import type { CompanyCanonical, CompanyFacets } from "../../types/index.ts";

const SCHEMA = "companies.company";
const DETAILS = "companies.company.details";

function makeGraph(): GraphService<CompanyFacets, CompanyCanonical> {
  const reject =
    (name: string) =>
    (..._args: unknown[]): never => {
      throw new Error(`unexpected graph op on read path: ${name}`);
    };
  return {
    list_entities_window: vi.fn<[unknown], Promise<WindowPage>>(),
    search_entities_by_name: vi.fn<[unknown], Promise<RawEntity[]>>(),
    list_canonical_for_entities: vi.fn<[string[]], Promise<CanonicalRecord[]>>().mockResolvedValue([]),
    get_entity_full: vi.fn<[string, unknown?], Promise<EntityDetail | null>>(),
    list_facets_for_entity: vi.fn<[string], Promise<FacetRecord[]>>().mockResolvedValue([]),
    get_canonical: vi.fn<[string, string[]?], Promise<Partial<CompanyCanonical>>>().mockResolvedValue({}),
    // ops the read path must never hit
    list_entities: vi.fn(reject("list_entities")),
    list_facets_for_entities: vi.fn(reject("list_facets_for_entities")),
    get_entities: vi.fn(reject("get_entities")),
    get_entity: vi.fn(reject("get_entity")),
  } as unknown as GraphService<CompanyFacets, CompanyCanonical>;
}

function makeModule(graph: GraphService<CompanyFacets, CompanyCanonical>): CompaniesModule {
  const deps = {
    graph,
    ctx: { extension_id: "companies", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<CompanyFacets, CompanyCanonical>;
  return new CompaniesModule(deps);
}

const ENT = (id: string, name: string, created_at = "2026-01-01T00:00:00Z"): RawEntity => ({
  id,
  schema_id: SCHEMA,
  name,
  created_at,
});
const WROW = (e: RawEntity) => ({ entity: e, data: null });
const canon = (entity_id: string, key: string, value: unknown): CanonicalRecord => ({ entity_id, key, value });

describe("companies read — shape parity (tst_be_companiesread_001)", () => {
  let graph: GraphService<CompanyFacets, CompanyCanonical>;
  let mod: CompaniesModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("F1 list (no search): fields from canonical, real created_at, name fallback, idx order", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [WROW(ENT("a", "", "2026-01-01T00:00:00Z")), WROW(ENT("z", "Zeta", "2026-02-02T00:00:00Z"))],
      total: 2,
    });
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("a", "companies.name", "Acme"), // entity.name empty → canonical name
      canon("z", "companies.website", "https://zeta.io"),
      canon("z", "companies.industry", "Fintech"),
      canon("z", "companies.size", "50"),
      canon("z", "companies.location", "NYC"),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["a", "z"]); // window idx order preserved
    expect(page.items[0].name).toBe("Acme");
    expect(page.items[0].created_at).toBe("2026-01-01T00:00:00Z"); // real, not Date(0)
    const z = page.items[1];
    expect(z).toMatchObject({ name: "Zeta", website: "https://zeta.io", industry: "Fintech", size: "50", location: "NYC" });

    const spec = (graph.list_entities_window as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(spec.order?.[0]?.field?.entity_field).toBe("idx");
    expect(spec.facet_schema).toBeUndefined(); // no facet inline — canonical drives fields
  });

  it("F1b unknown when entity.name and canonical name both absent", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [WROW(ENT("x", ""))], total: 1 });
    const page = await mod.list({});
    expect(page.items[0].name).toBe("Unknown");
  });

  it("F2 search is sorted alphabetically (parity with staging), fields from canonical", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([
      ENT("z", "Zeta"),
      ENT("a", "Acme"),
      ENT("m", "Mango"),
    ]); // backend returns NON-alphabetical (prefix/date) order
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("a", "companies.website", "https://acme.com"),
    ]);

    const page = await mod.list({ search: "x", limit: 10, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.name)).toEqual(["Acme", "Mango", "Zeta"]); // sorted
    expect(page.items[0].website).toBe("https://acme.com");
  });

  it("F3 get: base/header from canonical, ALL facets preserved, empty members/linked", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: ENT("c", "Acme"),
      facets: [],
      links: [],
    } satisfies EntityDetail);
    (graph.list_facets_for_entity as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "fd", schema_id: DETAILS, source: "manual", observed_at: "x", data: { website: "x" } },
      { id: "fe1", schema_id: "companies.company.email", source: "manual", observed_at: "x", data: { email: "a@acme.com" } },
      { id: "fe2", schema_id: "companies.company.email", source: "manual", observed_at: "x", data: { email: "b@acme.com" } },
    ] satisfies FacetRecord[]);
    (graph.get_canonical as ReturnType<typeof vi.fn>).mockResolvedValue({
      "companies.name": "Acme",
      "companies.website": "https://acme.com",
      "companies.industry": "SaaS",
    });

    const view = await mod.get({ id: "c" });
    expect(view.name).toBe("Acme");
    expect(view.website).toBe("https://acme.com"); // from canonical, not facet
    expect(view.members).toEqual([]);
    expect(view.linked_entities).toEqual([]);
    expect(view.facets).toHaveLength(3); // ALL facets, both email facets kept
    expect((view.facets as FacetRecord[]).filter((f) => f.schema_id === "companies.company.email")).toHaveLength(2);
    expect(view.header_rows.find((r) => r.label === "Website")).toMatchObject({ value: "https://acme.com" });
    expect(view.header_rows.find((r) => r.label === "Industry")).toMatchObject({ value: "SaaS" });
  });

  it("F4 empty page → {items:[], total:0}", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    const page = await mod.list({});
    expect(page).toMatchObject({ items: [], total: 0 });
  });

  it("F5 get throws on missing / non-company entity", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("companies read — DB-access guarantees (tst_be_companiesdb_001 / INV-1/2/3)", () => {
  let graph: GraphService<CompanyFacets, CompanyCanonical>;
  let mod: CompaniesModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("list (no search) = 1 window + 1 batch canonical, 0 search, 0 facet (INV-1)", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    await mod.list({ limit: 50 });
    expect(graph.list_entities_window).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(0);
  });

  it("list (search) = 1 search + 1 batch canonical, 0 window (INV-2)", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await mod.list({ search: "x" });
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 list_facets_for_entity + 1 get_canonical, 0 get_entities (INV-3)", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: ENT("c", "Acme"),
      facets: [],
      links: [],
    } satisfies EntityDetail);
    await mod.get({ id: "c" });
    expect(graph.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entity).toHaveBeenCalledTimes(1);
    expect(graph.get_canonical).toHaveBeenCalledTimes(1);
    expect(graph.get_entities).toHaveBeenCalledTimes(0);
  });
});
