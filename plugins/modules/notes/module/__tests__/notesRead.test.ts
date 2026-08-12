// Notes read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. The no-search list already used list_entities_window;
// this stage fixes the two remaining N+1s: search (was per-row
// list_facets_for_entity + get_canonical) now uses list_facets_for_entities +
// list_canonical_for_entities (batch, byte-parity with the old canonical-aware
// item), and get's link resolution (was per-link get_entity_full) now uses one
// get_entities batch. Mirrors companies/module/__tests__/companiesRead.test.ts.
// tst_be_notesread_001 (shape) + tst_be_notesdb_001 (op-counts).
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
// the read path hitting ANY op it did not arrange (get_entity /
// list_facets_for_entity — the N+1 traps) throws `unexpected graph op: …` and
// fails the test. That single guarantee REPLACES the old per-op `reject()` spies.

import { beforeEach, describe, expect, it } from "vitest";
import {
  entity,
  mockGraph,
  mountModule,
  windowRow,
  type MockGraph,
} from "@magnis/testkit/module";
import { NotesModule } from "../service.ts";
import { previewFromBody } from "../helpers.ts";
import { NOTE, NOTE_CONTENT } from "../../schema.ts";
import type { NoteCanonical } from "../../types.ts";

type G = MockGraph;

// The read-path ops, arranged with benign defaults; individual tests re-arm them
// via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (list_facets_for_entity, get_entity) stay unarranged, so the throwing Proxy
// fails the test if the read path hits them.
function readGraph(): G {
  return mockGraph({
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    get_entity_full: () => Promise.resolve(null),
    get_entities: () => Promise.resolve([]),
  });
}

// noUncheckedIndexedAccess: `spies` is Record<string, Mock>, so each lookup is
// `Mock | undefined`. Every op referenced below IS arranged by readGraph, so a
// missing spy is a harness bug — surface it, never mask it.
function spy(graph: G, op: string): G["spies"][string] {
  const s = graph.spies[op];
  if (s === undefined) throw new Error(`notes read test: spy '${op}' not arranged`);
  return s;
}

describe("notes read — shape parity (tst_be_notesread_001)", () => {
  let graph: G;
  let mod: NotesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(NotesModule, { graph, ctx: { extension_id: "notes" } }).module;
  });

  it("F1 search reads the dictionary riding the entity (S1: no batch facets, no canonical)", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("n1", "", {
        schema_id: NOTE,
        created_at: "2026-01-01T00:00:00Z",
        properties: {
          title: "Dict Title",
          body: "hello world",
          pinned: true,
          updated_at: "2026-03-03T00:00:00Z",
        },
      }),
    ]);

    const page = await mod.list({ search: "dict", limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    const item = page.items[0];
    if (item === undefined) throw new Error("F1: missing first item");
    expect(item.title).toBe("Dict Title");
    expect(item.pinned).toBe(true);
    expect(item.updated_at).toBe("2026-03-03T00:00:00Z");
    expect(item.preview).toContain("hello");
  });

  it("F2 get resolves link neighbours via ONE get_entities batch (no per-link fetch)", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "My Note", { schema_id: NOTE, properties: { body: "b" } }),
      links: [
        { id: "l1", from_id: "n1", to_id: "c1", kind: "mentions" },
        { id: "l2", from_id: "n1", to_id: "c2", kind: "mentions" },
      ],
    });
    spy(graph, "get_entities").mockResolvedValue([
      entity("c1", "Alice", { schema_id: "contacts.person" }),
      entity("c2", "Bob", { schema_id: "contacts.person" }),
    ]);

    const view = await mod.get({ id: "n1" });
    expect(view.title).toBe("My Note");
    expect(view.linked_entities.map((l) => l.name)).toEqual(["Alice", "Bob"]);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1); // ONE batch, no per-link N+1
  });

  it("F3 get throws on a non-notes / missing entity", async () => {
    spy(graph, "get_entity_full").mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });

  it("F4 list (no search) maps window rows", async () => {
    spy(graph, "list_entities_window").mockResolvedValue({
      items: [
        windowRow(
          entity("n1", "Title", { schema_id: NOTE, properties: { body: "body", pinned: true } }),
        ),
      ],
      total: 1,
    });
    const page = await mod.list({});
    expect(page.items[0]).toMatchObject({ title: "Title", pinned: true });
    const call = spy(graph, "list_entities_window").mock.calls[0]?.[0];
    expect(call?.order).toEqual([{ field: { property_path: "updated_at" }, desc: true }]);
  });

  /**
   * @test-id: tst_module_notes_preview_001
   * @scenario: scn_backend_tests_006
   * @covers: previewFromBody, NotesModule.list
   * @legacy-id: tst_notes_e2e_list_orders_recent_first_with_preview
   * @legacy-id: tst_notes_e2e_preview_truncates_unicode_on_boundary
   * @deterministic: yes
   */
  it("tst_module_notes_preview_001 skips headings and truncates Unicode by codepoint", () => {
    expect(previewFromBody("# Heading\n\nfirst useful line")).toBe("first useful line");
    const unicode = "🙂".repeat(81);
    expect(previewFromBody(unicode)).toBe(`${"🙂".repeat(80)}…`);
  });
});

describe("notes read — DB-access guarantees (tst_be_notesdb_001)", () => {
  let graph: G;
  let mod: NotesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(NotesModule, { graph, ctx: { extension_id: "notes" } }).module;
  });

  it("search = 1 search, 0 batch facets, 0 0 per-row reads, 0 window", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("n1", "n", { schema_id: NOTE }),
    ]);
    await mod.list({ search: "x" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    // S1: the dictionary rides the entity — the two page-wide batch reads are gone.
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_entities (links present), 0 0 per-link", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "N", { schema_id: NOTE }),
      links: [{ id: "l1", from_id: "n1", to_id: "c1", kind: "mentions" }],
    });
    spy(graph, "get_entities").mockResolvedValue([
      entity("c1", "Alice", { schema_id: "contacts.person" }),
    ]);
    await mod.get({ id: "n1" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });

  it("get with no links makes 0 get_entities", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "N", { schema_id: NOTE }),
      links: [],
    });
    await mod.get({ id: "n1" });
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(0);
  });
});
