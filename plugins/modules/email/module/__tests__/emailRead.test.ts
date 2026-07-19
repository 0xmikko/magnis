// Stage 2 — email read surface: shape parity + DB-access guarantees.
// Exercises the V8 module class through @magnis/testkit/module (mockGraph +
// mountModule). Asserts BOTH the returned DTO shape (tst_be_emailread_001) and
// the exact graph op-counts per surface (tst_be_emaildb_003 → INV-DB-1/2/4): a
// fixed, N-independent number of crossings, no per-row hydrate, no
// canonical/facet read on the hot path.
//
// mockGraph is a throwing Proxy: any op NOT arranged below (list_facets_for_entity,
// list_canonical_for_entity, list_entities — the N+1 traps) throws when hit, so
// an accidental crossing fails loudly. That REPLACES the old per-op reject spies
// AND the `toHaveBeenCalledTimes(0)` assertions on those forbidden ops.

import { beforeEach, describe, expect, it } from "vitest";
import type { EntityDetail, FacetRecord, RawEntity } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { EmailModule } from "../service.ts";
import type { EmailCanonical, EmailFacets } from "../../types.ts";

type G = MockGraph<EmailFacets, EmailCanonical>;

// Only the ops the read path may legitimately touch are arranged with benign
// defaults; everything else throws via the mockGraph Proxy.
function readGraph(): G {
  return mockGraph<EmailFacets, EmailCanonical>({
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    get_entity_full: () => Promise.resolve(null),
    get_entities: () => Promise.resolve([]),
    search_entities_by_name: () => Promise.resolve([]),
    list_facets_for_entities: () => Promise.resolve([]),
  });
}

const ROW = (id: string, date: string, over: Record<string, unknown> = {}) => ({
  entity: { id, schema_id: "email.message", name: "Subject " + id, created_at: date },
  data: {
    from_address: "alice@example.com",
    from_name: "Alice Johnson",
    snippet: "preview text " + id,
    body_text: "full body " + id,
    body_html: "<p>full body " + id + "</p>",
    sent_at: date,
    to_addresses: "bob@example.com",
    ...over,
  },
});

const DETAIL = (id: string, date: string): EntityDetail => ({
  entity: { id, schema_id: "email.message", name: "Subject " + id, created_at: date },
  facets: [
    {
      id: "f-" + id,
      schema_id: "email.message.details",
      source: "gmail",
      observed_at: date,
      data: {
        from_address: "alice@example.com",
        from_name: "Alice Johnson",
        snippet: "preview text " + id,
        body_text: "full body " + id,
        body_html: "<p>full body " + id + "</p>",
        sent_at: date,
        to_addresses: "bob@example.com",
      },
    },
  ],
  links: [],
});

describe("email read — shape parity (tst_be_emailread_001)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });

  it("list maps window rows to MessageListItem (sender fallback, snippet preview, body_html stripped)", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [ROW("b", "2026-06-02T10:00:00Z"), ROW("a", "2026-06-01T10:00:00Z")],
      total: 2,
    });

    const page = await mod.emailList({ limit: 50, offset: 0 });

    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.id)).toEqual(["b", "a"]); // DB date-desc order preserved
    const first = page.items[0];
    expect(first.sender).toBe("Alice Johnson"); // from_name preferred over from_address
    expect(first.subject).toBe("Subject b");
    expect(first.preview).toBe("preview text b"); // snippet
    expect(first.channel).toBe("email");
    expect(first.timestamp).toBe("2026-06-02T10:00:00Z"); // sent_at
    expect(first.metadata).toBeDefined();
    expect(first.metadata).not.toHaveProperty("body_html"); // list strips heavy HTML
    expect(first.metadata).toHaveProperty("from_address", "alice@example.com");
  });

  it("list falls back to from_address when from_name is absent", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [ROW("a", "2026-06-01T10:00:00Z", { from_name: "" })],
      total: 1,
    });
    const page = await mod.emailList({});
    expect(page.items[0].sender).toBe("alice@example.com");
  });

  it("get returns a MessageDetailView (body_text, full metadata incl body_html, facet summaries)", async () => {
    graph.spies.get_entity_full.mockResolvedValue(DETAIL("x", "2026-06-03T09:00:00Z"));

    const view = await mod.emailGet({ id: "x" });

    expect(view.id).toBe("x");
    expect(view.body).toBe("full body x"); // body_text
    expect(view.sender).toBe("Alice Johnson");
    expect(view.channel).toBe("email");
    expect(view.canonical).toEqual({});
    expect(view.linked_entities).toEqual([]);
    expect(view.facets).toHaveLength(1);
    expect(view.facets[0].schema_id).toBe("email.message.details");
    expect(view.metadata).toHaveProperty("body_html"); // detail keeps HTML
  });

  it("get resolves link neighbours into linked_entities (names via one batch)", async () => {
    const base = DETAIL("x", "2026-06-03T09:00:00Z");
    graph.spies.get_entity_full.mockResolvedValue({
      ...base,
      links: [
        { id: "l1", from_id: "x", to_id: "file-1", kind: "attachment" },
        { id: "l2", from_id: "x", to_id: "file-2", kind: "attachment" },
      ],
    });
    graph.spies.get_entities.mockResolvedValue([
      { id: "file-1", schema_id: "file.object", name: "photo.jpg", created_at: "2026-06-03T09:00:00Z" },
      { id: "file-2", schema_id: "file.object", name: "report.pdf", created_at: "2026-06-03T09:00:00Z" },
    ] satisfies RawEntity[]);

    const view = await mod.emailGet({ id: "x" });
    expect(view.linked_entities).toHaveLength(2);
    expect(view.linked_entities.map((l) => l.name)).toEqual(["photo.jpg", "report.pdf"]);
    expect(view.linked_entities.every((l) => l.link_kind === "attachment")).toBe(true);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1); // ONE batch, no per-link N+1
  });

  it("get throws on a non-email / missing entity", async () => {
    graph.spies.get_entity_full.mockResolvedValue(null);
    await expect(mod.emailGet({ id: "nope" })).rejects.toThrow();
  });

  it("batch returns one detail view per id and skips not-found", async () => {
    graph.spies.get_entity_full
      .mockResolvedValueOnce(DETAIL("a", "2026-06-01T10:00:00Z"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(DETAIL("c", "2026-06-03T10:00:00Z"));

    const views = await mod.emailBatch({ ids: ["a", "b", "c"] });
    expect(views.map((v) => v.id)).toEqual(["a", "c"]); // 'b' skipped
  });

  it("search hydrates only the matched ids via batch facet read", async () => {
    graph.spies.search_entities_by_name.mockResolvedValue([
      { id: "a", schema_id: "email.message", name: "Subject a", created_at: "2026-06-01T10:00:00Z" },
    ] satisfies RawEntity[]);
    graph.spies.list_facets_for_entities.mockResolvedValue([
      {
        entity_id: "a",
        id: "f-a",
        schema_id: "email.message.details",
        source: "gmail",
        observed_at: "2026-06-01T10:00:00Z",
        data: { from_name: "Alice Johnson", snippet: "preview text a", sent_at: "2026-06-01T10:00:00Z" },
      },
    ] satisfies FacetRecord[]);

    const page = await mod.emailList({ search: "invoice" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].sender).toBe("Alice Johnson");
    expect(page.items[0].preview).toBe("preview text a");
  });
});

describe("email read — DB-access guarantees (tst_be_emaildb_003 / INV-DB-1,2,4)", () => {
  let graph: G;
  let mod: EmailModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  });

  it("list (no search) = exactly 1 list_entities_window, 0 facet/canonical reads (INV-DB-1)", async () => {
    graph.spies.list_entities_window.mockResolvedValue({
      items: [ROW("a", "2026-06-01T10:00:00Z"), ROW("b", "2026-06-02T10:00:00Z")],
      total: 2,
    });
    await mod.emailList({ limit: 50 });
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(0);
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(0);
    // list_facets_for_entity (per-row N+1 trap) is a forbidden, unarranged op —
    // the throwing mockGraph guarantees it is never hit; no spy to assert 0.
  });

  it("list (search) = 1 search + 1 batch facet hydrate, 0 window, 0 per-row hydrate (INV-DB-4)", async () => {
    graph.spies.search_entities_by_name.mockResolvedValue([]);
    graph.spies.list_facets_for_entities.mockResolvedValue([]);
    await mod.emailList({ search: "x" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full (+0 get_entities when no links), 0 facet/canonical reads (INV-DB-2)", async () => {
    graph.spies.get_entity_full.mockResolvedValue(DETAIL("x", "2026-06-03T09:00:00Z")); // links: []
    await mod.emailGet({ id: "x" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(0); // no links → no neighbour hydrate
  });

  it("batch = exactly K get_entity_full for K ids (no extra crossings)", async () => {
    graph.spies.get_entity_full.mockResolvedValue(DETAIL("a", "2026-06-01T10:00:00Z"));
    await mod.emailBatch({ ids: ["a", "b", "c"] });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(3);
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
  });
});
