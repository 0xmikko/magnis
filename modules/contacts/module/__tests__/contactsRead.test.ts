// Contacts read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. list keeps the page query (listEntities order idx /
// searchEntitiesByName) but hydrates the page with TWO batch reads —
// the hub DICTIONARY + its identity edges (email/phone/role/company) AND
// list_facets_for_entities (channels + relevance_tier) — instead of the old
// per-row reads. get uses getEntityFull + one getEntities batch. Mirrors
// companies/__tests__/companiesRead.test.ts. tst_be_contactsread_001 (shape) +
// tst_be_contactsdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (e.g. the old per-row
// getEntity N+1 trap) throws `unexpected graph op: …` and fails the test — the
// single guarantee that REPLACES the old hand-rolled `reject()` spy.

/**
 * @test-id: tst_module_contacts_read_001
 * @scenario: scn_backend_tests_006
 * @covers: ContactsModule.list, ContactsModule.get
 * @legacy-id: tst_contacts_e2e_list_and_get
 * @deterministic: yes
 */

import { beforeEach, describe, expect, it } from "vitest";
import { entityId, entityRead, entityExtras, entity, link, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
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
// (getEntity — the N+1 trap) stay unarranged, so the throwing Proxy fails the
// test if the read path hits them.
function readGraph(): G {
  return mockGraph({
    listEntities: () => Promise.resolve(page([])),
    searchEntitiesByName: () => Promise.resolve([]),
    listLinksForEntities: () => Promise.resolve([]),
    getEntityFull: () => Promise.resolve(null),
    getEntities: () => Promise.resolve([]),
  });
}

describe("contacts read — shape parity (tst_be_contactsread_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extensionId: "contacts" } }).module;
  });

  it("F1 list builds items from the hub DICTIONARY + its identity EDGES", async () => {
    spy(graph, "listEntities").mockResolvedValue(page([
        entityRead(entity(entityId("c1"), "Alice Smith", {
          schemaId: SCHEMA,
          properties: { role: "CEO", phones: [{ phone: "+1 555", is_primary: true }] },
        }), entityExtras()),
        entityRead(entity(entityId("c2"), "Bob", { schemaId: SCHEMA }), entityExtras()),
      ], 2));
    // c1 reaches an address node over `identity`; c2 reaches nothing.
    spy(graph, "listLinksForEntities").mockResolvedValue([
      link(entityId("c1"), entityId("addr-1"), "identity", { id: "l1" }),
    ]);
    spy(graph, "getEntities").mockResolvedValue([
      entity(entityId("addr-1"), "canon@x.com", {
        schemaId: "email.address",
        properties: { address: "canon@x.com" },
      }),
    ]);

    const listed = await mod.list({ limit: 50, offset: 0 });
    expect(listed.total).toBe(2);
    const a = listed.items[0];
    const b = listed.items[1];
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
    spy(graph, "listEntities").mockResolvedValue(page([
        entityRead(entity(entityId("c1"), "Real DM Person", { schemaId: SCHEMA }), entityExtras()),
        entityRead(entity(entityId("c2"), "Group Co-member", { schemaId: SCHEMA }), entityExtras()),
      ], 2));

    const listed = await mod.list({});

    expect(listed.items.map((i) => i.id)).toEqual([entityId("c1"), entityId("c2")]);
    expect(listed.total).toBe(2);
    // No windowed read: there is no dictionary key left to filter on.
    expect(graph.spies.listEntitiesWindow).toBeUndefined();
  });

  it("F2b relevance_tier is reported as unknown, not guessed", async () => {
    spy(graph, "listEntities").mockResolvedValue(page([entityRead(entity(entityId("c1"), "Real DM Person", { schemaId: SCHEMA }), entityExtras())], 1));

    const listed = await mod.list({});

    expect(listed.items[0]?.relevanceTier).toBeNull();
  });

  it("F4 get throws on a missing / non-contact entity", async () => {
    spy(graph, "getEntityFull").mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("contacts read — DB-access guarantees (tst_be_contactsdb_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extensionId: "contacts" } }).module;
  });

  it("list (no search) = 1 listEntities + 1 batch edges, 0 0 per-row reads", async () => {
    spy(graph, "listEntities").mockResolvedValue(page([entityRead(entity(entityId("c1"), "A", { schemaId: SCHEMA }), entityExtras())], 1));
    await mod.list({});
    expect(graph.spies.listEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledTimes(1);
    // get_canonical / list_canonical_for_entities are forbidden ops now — the
    // throwing mockGraph would have rejected the call above.
  });

  it("list (search) = 1 search + 1 batch edges, 0 listEntities", async () => {
    spy(graph, "searchEntitiesByName").mockResolvedValue([
      entityRead(entity(entityId("c1"), "A", { schemaId: SCHEMA }), entityExtras()),
    ]);
    await mod.list({ search: "a" });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledTimes(1);
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.listEntities).toHaveBeenCalledTimes(0);
  });

  it("get = 1 getEntityFull + 1 getEntities, 0 canonical", async () => {
    spy(graph, "getEntityFull").mockResolvedValue({
      ...entityRead(entity(entityId("c1"), "A", { schemaId: SCHEMA }), entityExtras()),
      links: [link(entityId("c1"), entityId("co1"), "works_at", { id: "l1" })],
    });
    spy(graph, "getEntities").mockResolvedValue([
      entityRead(entity(entityId("co1"), "Acme", { schemaId: "companies.company" }), entityExtras()),
    ]);
    await mod.get({ id: entityId("c1") });
    expect(graph.spies.getEntityFull).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
  });
});

// ── P2b: the hub answers for its replicas' links ───────────────────────
// A trigger hangs off the contact's address, not off the contact:
// `contact —identity→ email.address ←watches— trigger`. identity replaced the
// facet model, so the replicas carry the edges and their links are read as the
// hub's own — all of them, with exactly one exclusion: the hub itself, because
// the replicas link back to it.
describe("contacts read — two hops (tst_mod_contacts_001)", () => {
  let graph: G;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(ContactsModule, { graph, ctx: { extensionId: "contacts" } }).module;
  });

  /**
   * @test-id tst_mod_contacts_001
   * @scenario scn_contacts_001
   * @covers modules/contacts/module/service.ts::ContactsModule.get
   * @deterministic testkit graph double; no clock, no network
   *
   * INV-P2b.1 a trigger watching the contact's `email.address` appears in
   *           `linkedEntities`, marked `~watches`.
   * INV-P2b.2 incoming edges are distinguishable from outgoing ones.
   * INV-P2b.3 the contact itself never appears, though its replicas link back.
   * INV-P2b.4 everything else incident to a replica is returned, including a
   *           company sharing the address, as `~identity`.
   * INV-P2b.5 a trigger watching BOTH the contact and its address appears once.
   * INV-P2b.6 one `listLinksForEntities` and one `getEntities`, whatever
   *           the neighbour count.
   */
  it("returns what hangs off its replicas, once each, without itself", async () => {
    spy(graph, "getEntityFull").mockResolvedValue({
      ...entityRead(entity(entityId("c1"), "Alice", { schemaId: SCHEMA }), entityExtras()),
      links: [
        link(entityId("c1"), entityId("addr-1"), "identity", { id: "l1" }),
        link(entityId("t2"), entityId("c1"), "watches", { id: "l2" }),
      ],
    });
    // Everything incident to the address — including the edge back to the hub.
    spy(graph, "listLinksForEntities").mockResolvedValue([
      link(entityId("c1"), entityId("addr-1"), "identity", { id: "l1" }),
      link(entityId("t1"), entityId("addr-1"), "watches", { id: "l3" }),
      link(entityId("t2"), entityId("addr-1"), "watches", { id: "l4" }),
      link(entityId("co1"), entityId("addr-1"), "identity", { id: "l5" }),
    ]);
    spy(graph, "getEntities").mockResolvedValue([
      entityRead(entity(entityId("addr-1"), "alice@x.com", {
        schemaId: "email.address",
        properties: { address: "alice@x.com" },
      }), entityExtras()),
      entityRead(entity(entityId("t1"), "watch the address", { schemaId: "triggers.trigger" }), entityExtras()),
      entityRead(entity(entityId("t2"), "watch both", { schemaId: "triggers.trigger" }), entityExtras()),
      entityRead(entity(entityId("co1"), "Acme", { schemaId: "companies.company" }), entityExtras()),
    ]);

    const view = await mod.get({ id: entityId("c1") });
    const byId = new Map(view.linkedEntities.map((l) => [l.id, l] as const));

    expect(byId.get(entityId("t1"))).toMatchObject({ linkKind: "watches", direction: "in" });
    expect(byId.get(entityId("addr-1"))?.linkKind).toBe("identity");
    expect(byId.get(entityId("co1"))).toMatchObject({ linkKind: "identity", direction: "in" });
    expect(view.linkedEntities.filter((l) => l.id === entityId("t2"))).toHaveLength(1);
    expect(byId.has(entityId("c1"))).toBe(false);
    expect(graph.spies.listLinksForEntities).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntities).toHaveBeenCalledTimes(1);
    // The BATCH ARGUMENT, not just the call count. The double answers with a
    // fixed list whatever it is handed, so without this a batch over the wrong
    // ids — the replicas instead of the endpoints, say — still produces the
    // rows above and every assertion here passes while the feature is gone.
    expect(graph.spies.getEntities).toHaveBeenCalledWith(
      expect.arrayContaining([entityId("addr-1"), entityId("t1"), entityId("t2"), entityId("co1")]), { extras: true },
    );
    const batched = spy(graph, "getEntities").mock.calls[0]?.[0] as string[];
    expect(batched).not.toContain(entityId("c1"));
  });

  it("does not inherit its replicas' message traffic", async () => {
    // A shared address sits on one edge per message ever sent to it. Those are
    // read through the owning module's paging surface, not returned here.
    spy(graph, "getEntityFull").mockResolvedValue({
      ...entityRead(entity(entityId("c1"), "Alice", { schemaId: SCHEMA }), entityExtras()),
      links: [link(entityId("c1"), entityId("addr-1"), "identity", { id: "l1" })],
    });
    spy(graph, "listLinksForEntities").mockResolvedValue([
      link(entityId("msg-1"), entityId("addr-1"), "sent_to", { id: "l2" }),
      link(entityId("tg-1"), entityId("addr-1"), "sent_to", { id: "l3" }),
      link(entityId("co1"), entityId("addr-1"), "identity", { id: "l4" }),
    ]);
    spy(graph, "getEntities").mockResolvedValue([
      entityRead(entity(entityId("addr-1"), "alice@x.com", { schemaId: "email.address" }), entityExtras()),
      entityRead(entity(entityId("msg-1"), "Re: invoice", { schemaId: "email.message" }), entityExtras()),
      entityRead(entity(entityId("tg-1"), "hi", { schemaId: "telegram.message" }), entityExtras()),
      entityRead(entity(entityId("co1"), "Acme", { schemaId: "companies.company" }), entityExtras()),
    ]);

    const view = await mod.get({ id: entityId("c1") });
    const ids = view.linkedEntities.map((l) => l.id);

    expect(ids).not.toContain(entityId("msg-1"));
    expect(ids).not.toContain(entityId("tg-1"));
    // Everything else incident to the replica still comes back.
    expect(ids).toContain(entityId("co1"));
    expect(ids).toContain(entityId("addr-1"));
  });
});
