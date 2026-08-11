// Contacts read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. list keeps the page query (list_entities order idx /
// search_entities_by_name) but hydrates the page with TWO batch reads —
// the hub DICTIONARY + its identity edges (email/phone/role/company) AND
// list_facets_for_entities (channels + relevance_tier) — instead of the old
// per-row reads. get uses get_entity_full + one get_entities batch. Mirrors
// companies/__tests__/companiesRead.test.ts. tst_be_contactsread_001 (shape) +
// tst_be_contactsdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (e.g. the old per-row
// get_entity N+1 trap) throws `unexpected graph op: …` and fails the test — the
// single guarantee that REPLACES the old hand-rolled `reject()` spy.

import { beforeEach, describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";
import { CONTACT } from "../../schema.ts";
import type { ContactCanonical } from "../../types.ts";

const SCHEMA = CONTACT;
type G = MockGraph;

// `graph.spies` is a `Record<string, Mock>`, so under noUncheckedIndexedAccess
// every lookup is `Mock | undefined`. A spy this test arranges/asserts always
// exists by construction; surface a clear failure if it somehow does not.
function spy(g: G, name: string) {
  const s = g.spies[name];
  if (s === undefined) throw new Error(`test setup: spy "${name}" not registered`);
  return s;
}

// The read-path ops, arranged with benign defaults; individual tests re-arm
// them via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (get_entity — the N+1 trap) stay unarranged, so the throwing Proxy fails the
// test if the read path hits them.
function readGraph(): G {
  return mockGraph({
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    list_links_for_entities: () => Promise.resolve([]),
    get_entity_full: () => Promise.resolve(null),
    get_entities: () => Promise.resolve([]),
  });
}

describe("contacts read — shape parity (tst_be_contactsread_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extension_id: "contacts" } }).module;
  });

  it("F1 list builds items from the hub DICTIONARY + its identity EDGES", async () => {
    spy(graph, "list_entities").mockResolvedValue({
      items: [
        entity("c1", "Alice Smith", {
          schema_id: SCHEMA,
          properties: { role: "CEO", phones: [{ phone: "+1 555", is_primary: true }] },
        }),
        entity("c2", "Bob", { schema_id: SCHEMA }),
      ],
      total: 2,
    });
    // c1 reaches an address node over `identity`; c2 reaches nothing.
    spy(graph, "list_links_for_entities").mockResolvedValue([
      { id: "l1", from_id: "c1", to_id: "addr-1", kind: "identity" },
    ]);
    spy(graph, "get_entities").mockResolvedValue([
      entity("addr-1", "canon@x.com", {
        schema_id: "email.address",
        properties: { address: "canon@x.com" },
      }),
    ]);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(2);
    const a = page.items[0];
    const b = page.items[1];
    if (a === undefined || b === undefined) throw new Error("F1: expected two items");
    expect(a.name).toBe("Alice Smith");
    expect(a.email).toBe("canon@x.com"); // the address node the EDGE reaches
    expect(a.role).toBe("CEO"); // the hub's dictionary
    expect(a.phone).toBe("+1 555");
    expect(a.channels).toContain("Email"); // a channel IS a linked node
    expect(b.name).toBe("Bob");
    expect(b.email).toBeNull(); // no identity edge → no address
    expect(b.phone).toBeNull();
    expect(b.company).toBeNull();
    expect(b.channels).toEqual([]);
  });

  // ── Tier visibility ────────────────────────────────────────────────
  // The Telegram "group"-tier filter retired with the archive that held the
  // tier: nothing has written `relevance_tier` since the fold, so the default
  // list and `include_all` are the SAME page. These tests pin that — a
  // reintroduced filter has to come back with a live writer behind it.

  it("F2 the default list no longer filters by tier — every contact is visible", async () => {
    spy(graph, "list_entities").mockResolvedValue({
      items: [
        entity("c1", "Real DM Person", { schema_id: SCHEMA }),
        entity("c2", "Group Co-member", { schema_id: SCHEMA }),
      ],
      total: 2,
    });

    const page = await mod.list({});

    expect(page.items.map((i) => i.id)).toEqual(["c1", "c2"]);
    expect(page.total).toBe(2);
    // No windowed read: there is no dictionary key left to filter on.
    expect(graph.spies.list_entities_window).toBeUndefined();
  });

  it("F2b relevance_tier is reported as unknown, not guessed", async () => {
    spy(graph, "list_entities").mockResolvedValue({
      items: [entity("c1", "Real DM Person", { schema_id: SCHEMA })],
      total: 1,
    });

    const page = await mod.list({});

    expect(page.items[0]?.relevance_tier).toBeNull();
  });

  it("F4 get throws on a missing / non-contact entity", async () => {
    spy(graph, "get_entity_full").mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("contacts read — DB-access guarantees (tst_be_contactsdb_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extension_id: "contacts" } }).module;
  });

  it("list (no search) = 1 list_entities + 1 batch edges, 0 0 per-row reads", async () => {
    spy(graph, "list_entities").mockResolvedValue({
      items: [entity("c1", "A", { schema_id: SCHEMA })],
      total: 1,
    });
    await mod.list({});
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_links_for_entities).toHaveBeenCalledTimes(1);
    // get_canonical / list_canonical_for_entities are forbidden ops now — the
    // throwing mockGraph would have rejected the call above.
  });

  it("list (search) = 1 search + 1 batch edges, 0 list_entities", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("c1", "A", { schema_id: SCHEMA }),
    ]);
    await mod.list({ search: "a" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_links_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_entities, 0 canonical", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("c1", "A", { schema_id: SCHEMA }),
      links: [{ id: "l1", from_id: "c1", to_id: "co1", kind: "works_at" }],
    });
    spy(graph, "get_entities").mockResolvedValue([
      entity("co1", "Acme", { schema_id: "companies.company" }),
    ]);
    await mod.get({ id: "c1" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });
});
