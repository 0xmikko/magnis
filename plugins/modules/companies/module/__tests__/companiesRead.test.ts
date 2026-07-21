// Companies read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. List fields read CANONICAL (single_aligned, resolved
// by confidence→recency — a latest-facet window would not reproduce it),
// hydrated per page in ONE list_canonical_for_entities batch (no per-row N+1):
//   list (no search): list_entities_window (page+order:idx, no facet) + batch canonical
//   list (search):    search_entities_by_name + alphabetical sort + batch canonical
//   get:              get_entity_full (user-scoped entity) + list_facets_for_entity
//                     (ALL facets for the DTO) + get_canonical (base/header)
// Mirrors email/__tests__/emailRead.test.ts. tst_be_companiesread_001 (shape) +
// tst_be_companiesdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (get_entity / get_entities /
// list_entities / list_facets_for_entities — the N+1 traps) throws
// `unexpected graph op: …` and fails the test. That single guarantee REPLACES
// the old per-op `reject()` spies AND the `toHaveBeenCalledTimes(0)` assertions
// on those forbidden ops (kept only where the op IS arranged, e.g. window/search).

import { beforeEach, describe, expect, it } from "vitest";
import type { FacetRecord } from "@magnis/plugin-sdk";
import { canonical, entity, facet, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { CompaniesModule } from "../service.ts";
import { COMPANY, COMPANY_DETAILS, COMPANY_EMAIL } from "../../schema.ts";
import type { CompanyCanonical, CompanyFacets } from "../../types.ts";

type G = MockGraph<CompanyFacets, CompanyCanonical>;

// The read-path ops, arranged with benign defaults; individual tests re-arm
// them via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (get_entity, get_entities, list_entities, list_facets_for_entities) stay
// unarranged, so the throwing Proxy fails the test if the read path hits them.
function readGraph(): G {
  return mockGraph<CompanyFacets, CompanyCanonical>({
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    list_canonical_for_entities: () => Promise.resolve([]),
    get_entity_full: () => Promise.resolve(null),
    list_facets_for_entity: () => Promise.resolve([]),
    get_canonical: () => Promise.resolve({}),
  });
}

// noUncheckedIndexedAccess: `spies` is Record<string, Mock>, so each lookup is
// `Mock | undefined`. Every op referenced below IS arranged by readGraph, so a
// missing spy is a harness bug — surface it, never mask it.
function spy(graph: G, op: string): G["spies"][string] {
  const s = graph.spies[op];
  if (s === undefined) throw new Error(`companies read test: spy '${op}' not arranged`);
  return s;
}

describe("companies read — shape parity (tst_be_companiesread_001)", () => {
  let graph: G;
  let mod: CompaniesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(CompaniesModule, { graph, ctx: { extension_id: "companies" } }).module;
  });

  it("F1 list (no search): fields from canonical, real created_at, name fallback, idx order", async () => {
    spy(graph, "list_entities_window").mockResolvedValue({
      items: [
        windowRow(entity("a", "", { created_at: "2026-01-01T00:00:00Z" })),
        windowRow(entity("z", "Zeta", { created_at: "2026-02-02T00:00:00Z" })),
      ],
      total: 2,
    });
    spy(graph, "list_canonical_for_entities").mockResolvedValue([
      canonical("a", "companies.name", "Acme"), // entity.name empty → canonical name
      canonical("z", "companies.website", "https://zeta.io"),
      canonical("z", "companies.industry", "Fintech"),
      canonical("z", "companies.size", "50"),
      canonical("z", "companies.location", "NYC"),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["a", "z"]); // window idx order preserved
    const first = page.items[0];
    if (first === undefined) throw new Error("F1: missing first item");
    expect(first.name).toBe("Acme");
    expect(first.created_at).toBe("2026-01-01T00:00:00Z"); // real, not Date(0)
    const z = page.items[1];
    expect(z).toMatchObject({ name: "Zeta", website: "https://zeta.io", industry: "Fintech", size: "50", location: "NYC" });

    const windowCall = spy(graph, "list_entities_window").mock.calls[0];
    if (windowCall === undefined) throw new Error("F1: no list_entities_window call recorded");
    const spec = windowCall[0];
    expect(spec.order?.[0]?.field?.entity_field).toBe("idx");
    expect(spec.facet_schema).toBeUndefined(); // no facet inline — canonical drives fields
  });

  it("F1b unknown when entity.name and canonical name both absent", async () => {
    spy(graph, "list_entities_window").mockResolvedValue({ items: [windowRow(entity("x", ""))], total: 1 });
    const page = await mod.list({});
    const first = page.items[0];
    if (first === undefined) throw new Error("F1b: missing first item");
    expect(first.name).toBe("Unknown");
  });

  it("F2 search is sorted alphabetically (parity with staging), fields from canonical", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("z", "Zeta"),
      entity("a", "Acme"),
      entity("m", "Mango"),
    ]); // backend returns NON-alphabetical (prefix/date) order
    spy(graph, "list_canonical_for_entities").mockResolvedValue([
      canonical("a", "companies.website", "https://acme.com"),
    ]);

    const page = await mod.list({ search: "x", limit: 10, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.name)).toEqual(["Acme", "Mango", "Zeta"]); // sorted
    const first = page.items[0];
    if (first === undefined) throw new Error("F2: missing first item");
    expect(first.website).toBe("https://acme.com");
  });

  it("F3 get: base/header from canonical, ALL facets preserved, empty members/linked", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("c", "Acme", { schema_id: COMPANY }),
      facets: [],
      links: [],
    });
    spy(graph, "list_facets_for_entity").mockResolvedValue([
      facet("fd", COMPANY_DETAILS, { website: "x" }),
      facet("fe1", COMPANY_EMAIL, { email: "a@acme.com" }),
      facet("fe2", COMPANY_EMAIL, { email: "b@acme.com" }),
    ]);
    spy(graph, "get_canonical").mockResolvedValue({
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
    expect((view.facets as FacetRecord[]).filter((f) => f.schema_id === COMPANY_EMAIL)).toHaveLength(2);
    expect(view.header_rows.find((r) => r.label === "Website")).toMatchObject({ value: "https://acme.com" });
    expect(view.header_rows.find((r) => r.label === "Industry")).toMatchObject({ value: "SaaS" });
  });

  it("F4 empty page → {items:[], total:0}", async () => {
    spy(graph, "list_entities_window").mockResolvedValue({ items: [], total: 0 });
    const page = await mod.list({});
    expect(page).toMatchObject({ items: [], total: 0 });
  });

  it("F5 get throws on missing / non-company entity", async () => {
    spy(graph, "get_entity_full").mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("companies read — DB-access guarantees (tst_be_companiesdb_001 / INV-1/2/3)", () => {
  let graph: G;
  let mod: CompaniesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(CompaniesModule, { graph, ctx: { extension_id: "companies" } }).module;
  });

  it("list (no search) = 1 window + 1 batch canonical, 0 search, 0 facet (INV-1)", async () => {
    await mod.list({ limit: 50 });
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(0);
    // list_facets_for_entities is a forbidden op (unarranged) — the throwing
    // mockGraph guarantees it is never hit; no spy to assert 0 against.
  });

  it("list (search) = 1 search + 1 batch canonical, 0 window (INV-2)", async () => {
    await mod.list({ search: "x" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 list_facets_for_entity + 1 get_canonical, 0 get_entities (INV-3)", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("c", "Acme", { schema_id: COMPANY }),
      facets: [],
      links: [],
    });
    await mod.get({ id: "c" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entity).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_canonical).toHaveBeenCalledTimes(1);
    // get_entities (the N+1 trap) is a forbidden op — enforced by the throwing
    // mockGraph, which would reject mod.get above if the path hit it.
  });
});
