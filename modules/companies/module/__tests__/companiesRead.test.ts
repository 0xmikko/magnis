// Companies read surface — shape parity + DB-access guarantees. S5: the hub
// has ONE writer, so its DICTIONARY is the record and it rides the rows the
// read already fetched — no canonical read, no dictionary hydrate, nothing to
// arbitrate:
//   list (no search): listEntitiesWindow (page+order:idx) — one crossing
//   list (search):    searchEntitiesByName + alphabetical sort
//   get:              getEntityFull (entity + links) — one crossing
// Mirrors email/__tests__/emailRead.test.ts. tst_be_companiesread_001 (shape) +
// tst_be_companiesdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (getEntity / getEntities /
// listEntities / list_facets_for_entities — the N+1 traps) throws
// `unexpected graph op: …` and fails the test. That single guarantee REPLACES
// the old per-op `reject()` spies AND the `toHaveBeenCalledTimes(0)` assertions
// on those forbidden ops (kept only where the op IS arranged, e.g. window/search).

/**
 * @test-id: tst_module_companies_read_001
 * @scenario: scn_backend_tests_006
 * @covers: CompaniesModule.list, CompaniesModule.get
 * @legacy-id: tst_companies_e2e_plugin_returns_real_seeded_data
 * @deterministic: yes
 */

import { beforeEach, describe, expect, it } from "vitest";
import { entity, link, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
import { CompaniesModule } from "../service.ts";
import { COMPANY } from "../../schema.ts";
import type { CompanyCanonical } from "../../types.ts";

type G = MockGraph;

// The read-path ops, arranged with benign defaults; individual tests re-arm
// them via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (getEntity, getEntities, listEntities, list_facets_for_entities) stay
// unarranged, so the throwing Proxy fails the test if the read path hits them.
function readGraph(): G {
  return mockGraph({
    listEntitiesWindow: () => Promise.resolve(page([])),
    searchEntitiesByName: () => Promise.resolve([]),
    getEntityFull: () => Promise.resolve(null),
    getEntities: () => Promise.resolve([]),
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
    mod = mountModule(CompaniesModule, { graph, ctx: { extensionId: "companies" } }).module;
  });

  it("F1 list (no search): fields from the dictionary, real created_at, name fallback, idx order", async () => {
    spy(graph, "listEntitiesWindow").mockResolvedValue(page([
      entity("a", "", {
        createdAt: "2026-01-01T00:00:00Z",
        properties: { name: "Acme" }, // entity.name empty → the dict names it
      }),
      entity("z", "Zeta", {
        createdAt: "2026-02-02T00:00:00Z",
        properties: {
          website: "https://zeta.io",
          industry: "Fintech",
          size: "50",
          location: "NYC",
        },
      }),
    ]));

    const listed = await mod.list({ limit: 50, offset: 0 });
    expect(listed.total).toBe(2);
    expect(listed.items.map((i) => i.id)).toEqual(["a", "z"]); // window idx order preserved
    const first = listed.items[0];
    if (first === undefined) throw new Error("F1: missing first item");
    expect(first.name).toBe("Acme");
    expect(first.created_at).toBe("2026-01-01T00:00:00Z"); // real, not Date(0)
    const z = listed.items[1];
    expect(z).toMatchObject({ name: "Zeta", website: "https://zeta.io", industry: "Fintech", size: "50", location: "NYC" });

    const windowCall = spy(graph, "listEntitiesWindow").mock.calls[0];
    if (windowCall === undefined) throw new Error("F1: no listEntitiesWindow call recorded");
    const spec = windowCall[0];
    expect(spec.order?.[0]?.field?.entityField).toBe("idx");
    expect(spec.facet_schema).toBeUndefined(); // no facet inline — the dict rides the row
  });

  it("F1b unknown when neither entity.name nor the dictionary names it", async () => {
    spy(graph, "listEntitiesWindow").mockResolvedValue(page([entity("x", "")]));
    const listed = await mod.list({});
    const first = listed.items[0];
    if (first === undefined) throw new Error("F1b: missing first item");
    expect(first.name).toBe("Unknown");
  });

  it("F2 search is sorted alphabetically (parity with staging), fields from the dictionary", async () => {
    spy(graph, "searchEntitiesByName").mockResolvedValue([
      entity("z", "Zeta"),
      entity("a", "Acme", { properties: { website: "https://acme.com" } }),
      entity("m", "Mango"),
    ]); // backend returns NON-alphabetical (prefix/date) order

    const listed = await mod.list({ search: "x", limit: 10, offset: 0 });
    expect(listed.total).toBe(3);
    expect(listed.items.map((i) => i.name)).toEqual(["Acme", "Mango", "Zeta"]); // sorted
    const first = listed.items[0];
    if (first === undefined) throw new Error("F2: missing first item");
    expect(first.website).toBe("https://acme.com");
  });

  it("F3 get: base/header from the dictionary, empty members/linked, ONE crossing", async () => {
    spy(graph, "getEntityFull").mockResolvedValue({
      entity: entity("c", "Acme", {
        schemaId: COMPANY,
        properties: { website: "https://acme.com", industry: "SaaS" },
      }),
      links: [],
    });

    const view = await mod.get({ id: "c" });
    expect(view.name).toBe("Acme");
    expect(view.website).toBe("https://acme.com");
    expect(view.members).toEqual([]);
    expect(view.linkedEntities).toEqual([]);
    expect(view.headerRows.find((r) => r.label === "Website")).toMatchObject({ value: "https://acme.com" });
    expect(view.headerRows.find((r) => r.label === "Industry")).toMatchObject({ value: "SaaS" });
    expect(spy(graph, "getEntityFull")).toHaveBeenCalledTimes(1);
  });

  /**
   * @test-id: tst_module_companies_002
   * @scenario: scn_company_contacts_001
   * @covers: modules/companies/module/service.ts::CompaniesModule.get
   * @deterministic: yes
   * @fixtures: inline company <-works_at- contact graph
   *
   * Test environment: CompaniesModule direct call
   * Clients: direct calls
   * Mocks: GraphService
   * Data: one incoming works_at edge and its contact endpoint
   */
  it("tst_module_companies_002 returns incoming works_at contacts for the Contacts tab", async () => {
    spy(graph, "getEntityFull").mockResolvedValue({
      entity: entity("company-1", "Acme Labs", { schemaId: COMPANY }),
      links: [link("contact-1", "company-1", "works_at", { id: "link-1" })],
    });
    spy(graph, "getEntities").mockResolvedValue([
      entity("contact-1", "Mitchell Amador", { schemaId: "contacts.person" }),
    ]);

    const view = await mod.get({ id: "company-1" });

    expect(view.linkedEntities).toEqual([
      {
        id: "contact-1",
        schemaId: "contacts.person",
        name: "Mitchell Amador",
        linkKind: "~works_at",
        createdAt: "2026-01-01T00:00:00Z",
        origin: "canonical",
        confidence: null,
        validUntil: null,
      },
    ]);
    expect(view.members).toEqual(["Mitchell Amador"]);
    expect(view.headerRows).toContainEqual({
      type: "chips",
      label: "Team members (1)",
      items: ["Mitchell Amador"],
    });
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
  });

  it("F4 empty page → {items:[], total:0}", async () => {
    spy(graph, "listEntitiesWindow").mockResolvedValue(page([]));
    const listed = await mod.list({});
    expect(listed).toMatchObject({ items: [], total: 0 });
  });

  it("F5 get throws on missing / non-company entity", async () => {
    spy(graph, "getEntityFull").mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("companies read — DB-access guarantees (tst_be_companiesdb_001)", () => {
  let graph: G;
  let mod: CompaniesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(CompaniesModule, { graph, ctx: { extensionId: "companies" } }).module;
  });

  it("list (no search) = 1 window, 0 search, 0 0 facet", async () => {
    await mod.list({ limit: 50 });
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledTimes(1);
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledTimes(0);
    // list_canonical_for_entities and list_facets_for_entities are forbidden
    // ops (unarranged) — the throwing mockGraph guarantees the dictionary is
    // the only source; there is no spy to assert 0 against.
  });

  it("list (search) = 1 search, 0 window, 0 canonical", async () => {
    await mod.list({ search: "x" });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledTimes(1);
    expect(graph.spies.listEntitiesWindow).toHaveBeenCalledTimes(0);
  });

  it("get = 1 getEntityFull, 0 facet read, 0 0 getEntities", async () => {
    spy(graph, "getEntityFull").mockResolvedValue({
      entity: entity("c", "Acme", { schemaId: COMPANY }),
      links: [],
    });
    await mod.get({ id: "c" });
    expect(graph.spies.getEntityFull).toHaveBeenCalledTimes(1);
    // list_facets_for_entity, get_canonical and getEntities (the N+1 trap)
    // are forbidden ops — the throwing mockGraph would have rejected the call
    // above if the path hit any of them.
  });
});

/**
 * @test-id: tst_cat_entity_one_type_008
 * @scenario: scn_company_contacts_001
 * @covers: modules/companies/module/service.ts::CompaniesModule.get
 * @deterministic: yes
 * @fixtures: inline company <-works_at- contact graph
 *
 * The companies detail answer names its linked summaries `linkedEntities`
 * and its header rows `headerRows`, by the owner's choice; the snake keys
 * they replace are gone.
 */
describe("tst_cat_entity_one_type_008 — the companies detail answer is camelCase", () => {
  it("tst_cat_entity_one_type_008 get answers linkedEntities and headerRows and no snake key for them", async () => {
    const graph = readGraph();
    const mod = mountModule(CompaniesModule, { graph, ctx: { extensionId: "companies" } }).module;
    spy(graph, "getEntityFull").mockResolvedValue({
      entity: entity("company-1", "Acme Labs", { schemaId: COMPANY, properties: { website: "https://acme.com" } }),
      links: [link("contact-1", "company-1", "works_at", { id: "link-1" })],
    });
    spy(graph, "getEntities").mockResolvedValue([
      entity("contact-1", "Mitchell Amador", { schemaId: "contacts.person" }),
    ]);

    const view: Record<string, unknown> = { ...(await mod.get({ id: "company-1" })) };

    expect(view).not.toHaveProperty("linked_entities");
    expect(view).not.toHaveProperty("header_rows");
    expect(view["linkedEntities"]).toEqual([
      {
        id: "contact-1",
        schemaId: "contacts.person",
        name: "Mitchell Amador",
        linkKind: "~works_at",
        createdAt: "2026-01-01T00:00:00Z",
        origin: "canonical",
        confidence: null,
        validUntil: null,
      },
    ]);
    expect(view["headerRows"]).toEqual([
      { type: "text", label: "Website", value: "https://acme.com" },
      { type: "text", label: "Industry", value: null },
      { type: "text", label: "Size", value: null },
      { type: "chips", label: "Team members (1)", items: ["Mitchell Amador"] },
    ]);
  });
});
