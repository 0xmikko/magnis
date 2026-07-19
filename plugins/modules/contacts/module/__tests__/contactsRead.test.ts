// Contacts read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. list keeps the page query (list_entities order idx /
// search_entities_by_name) but hydrates the page with TWO batch reads —
// list_canonical_for_entities (email/phone/role/company, collection-merged) AND
// list_facets_for_entities (channels + relevance_tier) — instead of the old
// per-row get_canonical + list_facets_for_entity 2N+1. get uses get_entity_full
// (P1) + one get_canonical + one get_entities batch. Mirrors
// companies/__tests__/companiesRead.test.ts. tst_be_contactsread_001 (shape) +
// tst_be_contactsdb_001 (op-counts → INV-4/5/10).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (e.g. the old per-row
// get_entity N+1 trap) throws `unexpected graph op: …` and fails the test — the
// single guarantee that REPLACES the old hand-rolled `reject()` spy.

import { beforeEach, describe, expect, it } from "vitest";
import { canonical, entity, facet, mockGraph, mountModule, windowRow, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";
import { CONTACT } from "../../schema.ts";
import type { ContactCanonical, ContactFacets } from "../../types.ts";

const SCHEMA = CONTACT;
type G = MockGraph<ContactFacets, ContactCanonical>;

// The read-path ops, arranged with benign defaults; individual tests re-arm
// them via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (get_entity — the N+1 trap) stay unarranged, so the throwing Proxy fails the
// test if the read path hits them.
function readGraph(): G {
  return mockGraph<ContactFacets, ContactCanonical>({
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    list_canonical_for_entities: () => Promise.resolve([]),
    list_facets_for_entities: () => Promise.resolve([]),
    get_entity_full: () => Promise.resolve(null),
    get_canonical: () => Promise.resolve({}),
    get_entities: () => Promise.resolve([]),
    list_facets_for_entity: () => Promise.resolve([]),
  });
}

describe("contacts read — shape parity (tst_be_contactsread_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extension_id: "contacts" } }).module;
  });

  it("F1 list builds items from batch canonical (email/phone/role/company) + batch facets (channels/tier)", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [
        windowRow(entity("c1", "Alice Smith", { schema_id: SCHEMA })),
        windowRow(entity("c2", "Bob", { schema_id: SCHEMA })),
      ],
      total: 2,
    });
    graph.spies.list_canonical_for_entities.mockResolvedValue([
      canonical("c1", "person.full_name", "Alice Smith"),
      canonical("c1", "person.email", "canon@x.com"),
      canonical("c1", "person.role", "CEO"),
      // c2 has NO singular person.email mapped → item email stays null
    ]);
    graph.spies.list_facets_for_entities.mockResolvedValue([
      // two email facets on c1 with DIFFERENT values — must NOT drive the item
      facet("fa", "contacts.person.email", { email: "facet-a@x.com" }, { entity_id: "c1" }),
      facet("fb", "contacts.person.email", { email: "facet-b@x.com" }, { entity_id: "c1" }),
      facet("fc", "contacts.person.profile", { relevance_tier: "core" }, { entity_id: "c2" }),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    const [a, b] = page.items;
    expect(a.name).toBe("Alice Smith");
    expect(a.email).toBe("canon@x.com"); // from CANONICAL, not the email facets
    expect(a.role).toBe("CEO");
    expect(a.channels).toContain("Email"); // channel detected from the email facets
    expect(b.name).toBe("Bob");
    expect(b.email).toBeNull(); // person.email unmapped → null (parity, not facet)
    expect(b.phone).toBeNull();
    expect(b.company).toBeNull();
  });

  // ── Tier visibility (bug fix: hide Telegram group-only co-members) ──
  // Live DB ground truth: contacts carry `relevance_tier` in the
  // `telegram.contact` facet, valued "inner" (real DM/saved) or "group"
  // (known only as group co-members). DEFAULT hides "group"; the window read
  // filters at the QUERY level (`relevance_tier IS DISTINCT FROM 'group'`) so
  // the page is full and `total` reflects the VISIBLE (non-group) count.

  it("F2 default list hides group-tier contacts at the query level (filter_op=distinct, value=group)", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [windowRow(entity("c1", "Real DM Person", { schema_id: SCHEMA }))],
      total: 933, // DB already excluded group rows → visible count
    });

    const page = await mod.list({});

    // The query-level filter expresses "tier != group" via IS DISTINCT FROM,
    // targeting the telegram.contact facet where the live data stores the tier.
    const spec = graph.spies.list_entities_window.mock.calls[0]![0] as {
      schema: string;
      filter_field?: { facet_schema?: string; facet_path?: string };
      filter_eq?: string;
      filter_op?: string;
    };
    expect(spec.schema).toBe(SCHEMA);
    expect(spec.filter_field?.facet_schema).toBe("telegram.contact");
    expect(spec.filter_field?.facet_path).toBe("relevance_tier");
    expect(spec.filter_eq).toBe("group");
    expect(spec.filter_op).toBe("distinct");
    expect(page.items.map((i) => i.id)).toEqual(["c1"]);
    // group-tier never reaches the host on the default path
    expect(graph.spies.list_entities).not.toHaveBeenCalled();
  });

  it("F2b total reflects the VISIBLE (non-group) count returned by the windowed query", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [
        windowRow(entity("c1", "A", { schema_id: SCHEMA })),
        windowRow(entity("c2", "B", { schema_id: SCHEMA })),
      ],
      total: 933, // NOT the 2986 unfiltered DB count
    });

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(933);
  });

  it("F2c include_all=true shows ALL contacts (group included) via the unfiltered list path", async () => {
    graph.spies.list_entities.mockResolvedValue({
      items: [
        entity("c1", "Real DM Person", { schema_id: SCHEMA }),
        entity("c2", "Group Co-member", { schema_id: SCHEMA }),
      ],
      total: 2986,
    });
    graph.spies.list_facets_for_entities.mockResolvedValue([
      facet("f1", "telegram.contact", { relevance_tier: "group" }, { entity_id: "c2" }),
    ]);

    const page = await mod.list({ include_all: true });
    expect(page.items.map((i) => i.id)).toEqual(["c1", "c2"]); // group row kept
    expect(page.total).toBe(2986);
    // show-all path does NOT use the tier-filtered window
    expect(graph.spies.list_entities_window).not.toHaveBeenCalled();
  });

  it("F3 get returns a ContactDetailView; neighbours via one get_entities batch, non-owned dropped", async () => {
    graph.spies.get_entity_full.mockResolvedValue({
      entity: entity("c1", "Alice", { schema_id: SCHEMA, created_at: "2026-01-01T00:00:00Z" }),
      facets: [],
      links: [
        { id: "l1", from_id: "c1", to_id: "co1", kind: "works_at" },
        { id: "l2", from_id: "c1", to_id: "secret", kind: "works_at" }, // non-owned → dropped
      ],
    });
    // channels come from the ALL-facets read (list_facets_for_entity)
    graph.spies.list_facets_for_entity.mockResolvedValue([
      facet("ft", "contacts.identity.telegram", { username: "alice" }, { entity_id: "c1" }),
    ]);
    graph.spies.get_canonical.mockResolvedValue({
      "person.full_name": "Alice",
      "person.company": "Acme",
    });
    graph.spies.get_entities.mockResolvedValue([
      entity("co1", "Acme", { schema_id: "companies.company" }),
    ]);

    const view = await mod.get({ id: "c1" });
    expect(view.name).toBe("Alice");
    expect(view.company).toBe("Acme");
    expect(view.channels).toContain("Telegram");
    expect(view.canonical).toMatchObject({ "person.company": "Acme" });
    expect(view.linked_entities.map((l) => l.id)).toEqual(["co1"]); // non-owned 'secret' dropped
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });

  it("F4 get throws on a missing / non-contact entity", async () => {
    graph.spies.get_entity_full.mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("contacts read — DB-access guarantees (tst_be_contactsdb_001 / INV-4/5)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extension_id: "contacts" } }).module;
  });

  it("list (no search, default) = 1 list_entities_window + 1 batch canonical + 1 batch facets, 0 per-row reads", async () => {
    graph.spies.list_entities_window.mockResolvedValue({ items: [], total: 0 });
    await mod.list({});
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(0);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_canonical).toHaveBeenCalledTimes(0);
  });

  it("list (no search, include_all) = 1 list_entities + 1 batch canonical + 1 batch facets", async () => {
    graph.spies.list_entities.mockResolvedValue({ items: [], total: 0 });
    await mod.list({ include_all: true });
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(1);
  });

  it("list (search) = 1 search + 1 batch canonical + 1 batch facets, 0 list_entities", async () => {
    graph.spies.search_entities_by_name.mockResolvedValue([]);
    await mod.list({ search: "a" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_canonical + 1 get_entities (links present)", async () => {
    graph.spies.get_entity_full.mockResolvedValue({
      entity: entity("c1", "A", { schema_id: SCHEMA }),
      facets: [],
      links: [{ id: "l1", from_id: "c1", to_id: "co1", kind: "works_at" }],
    });
    graph.spies.get_entities.mockResolvedValue([
      entity("co1", "Acme", { schema_id: "companies.company" }),
    ]);
    await mod.get({ id: "c1" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entity).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_canonical).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });
});
