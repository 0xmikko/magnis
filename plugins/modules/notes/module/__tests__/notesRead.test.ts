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
  canonical,
  entity,
  facet,
  mockGraph,
  mountModule,
  windowRow,
  type MockGraph,
} from "@magnis/testkit/module";
import { NotesModule } from "../service.ts";
import { NOTE, NOTE_CONTENT } from "../../schema.ts";
import type { NoteCanonical, NoteFacets } from "../../types.ts";

type G = MockGraph<NoteFacets, NoteCanonical>;

// The read-path ops, arranged with benign defaults; individual tests re-arm them
// via `graph.spies.<op>.mockResolvedValue(...)`. Ops NOT listed here
// (list_facets_for_entity, get_entity) stay unarranged, so the throwing Proxy
// fails the test if the read path hits them.
function readGraph(): G {
  return mockGraph<NoteFacets, NoteCanonical>({
    list_entities_window: () => Promise.resolve({ items: [], total: 0 }),
    search_entities_by_name: () => Promise.resolve([]),
    list_facets_for_entities: () => Promise.resolve([]),
    list_canonical_for_entities: () => Promise.resolve([]),
    get_entity_full: () => Promise.resolve(null),
    get_entities: () => Promise.resolve([]),
    get_canonical: () => Promise.resolve({}),
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

  it("F1 search keeps canonical-derived pinned/updated_at/title (batch facets + batch canonical)", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("n1", "", { schema_id: NOTE, created_at: "2026-01-01T00:00:00Z" }),
    ]);
    // facet carries body only — NO pinned / updated_at / title
    spy(graph, "list_facets_for_entities").mockResolvedValue([
      facet("f1", NOTE_CONTENT, { body: "hello world" }, { entity_id: "n1" }),
    ]);
    // canonical supplies pinned / updated_at / title
    spy(graph, "list_canonical_for_entities").mockResolvedValue([
      canonical("n1", "note.pinned", true),
      canonical("n1", "note.updated_at", "2026-03-03T00:00:00Z"),
      canonical("n1", "note.title", "Canon Title"),
    ]);

    const page = await mod.list({ search: "canon", limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    const item = page.items[0];
    if (item === undefined) throw new Error("F1: missing first item");
    expect(item.title).toBe("Canon Title"); // entity.name empty, facet title absent → canonical
    expect(item.pinned).toBe(true); // from canonical note.pinned
    expect(item.updated_at).toBe("2026-03-03T00:00:00Z"); // from canonical note.updated_at
    expect(item.preview).toContain("hello"); // preview from facet body
  });

  it("F2 get resolves link neighbours via ONE get_entities batch (no per-link fetch)", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "My Note", { schema_id: NOTE }),
      facets: [facet("f1", NOTE_CONTENT, { body: "b" })],
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
      items: [windowRow(entity("n1", "Title", { schema_id: NOTE }), { body: "body", pinned: true })],
      total: 1,
    });
    const page = await mod.list({});
    expect(page.items[0]).toMatchObject({ title: "Title", pinned: true });
  });
});

describe("notes read — DB-access guarantees (tst_be_notesdb_001 / INV-7)", () => {
  let graph: G;
  let mod: NotesModule;
  beforeEach(() => {
    graph = readGraph();
    mod = mountModule(NotesModule, { graph, ctx: { extension_id: "notes" } }).module;
  });

  it("search = 1 search + 1 batch facets + 1 batch canonical, 0 per-row reads, 0 window", async () => {
    spy(graph, "search_entities_by_name").mockResolvedValue([
      entity("n1", "n", { schema_id: NOTE }),
    ]);
    await mod.list({ search: "x" });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_canonical).toHaveBeenCalledTimes(0);
    expect(graph.spies.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_canonical + 1 get_entities (links present), 0 per-link", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "N", { schema_id: NOTE }),
      facets: [],
      links: [{ id: "l1", from_id: "n1", to_id: "c1", kind: "mentions" }],
    });
    spy(graph, "get_entities").mockResolvedValue([
      entity("c1", "Alice", { schema_id: "contacts.person" }),
    ]);
    await mod.get({ id: "n1" });
    expect(graph.spies.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_canonical).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(1);
  });

  it("get with no links makes 0 get_entities", async () => {
    spy(graph, "get_entity_full").mockResolvedValue({
      entity: entity("n1", "N", { schema_id: NOTE }),
      facets: [],
      links: [],
    });
    await mod.get({ id: "n1" });
    expect(graph.spies.get_entities).toHaveBeenCalledTimes(0);
  });
});
