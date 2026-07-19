// Notes read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. The no-search list already used list_entities_window
// (P2); this stage fixes the two remaining N+1s: search (was per-row
// list_facets_for_entity + get_canonical) now uses list_facets_for_entities +
// list_canonical_for_entities (batch, byte-parity with the old canonical-aware
// item), and get's link resolution (was per-link get_entity_full) now uses one
// get_entities batch. Mirrors email/__tests__/emailRead.test.ts.
// tst_be_notesread_001 (shape) + tst_be_notesdb_001 (op-counts → INV-7/10).

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
import { NotesModule } from "./service.ts";
import type { NoteCanonical, NoteFacets } from "../types/index.ts";

const ENTITY = "notes.note";
const CONTENT = "notes.note.content";

function makeGraph(): GraphService<NoteFacets, NoteCanonical> {
  const reject =
    (name: string) =>
    (..._args: unknown[]): never => {
      throw new Error(`unexpected graph op on read path: ${name}`);
    };
  return {
    list_entities_window: vi.fn<(a: unknown) => Promise<WindowPage>>(),
    get_entity_full: vi.fn<(a: string, b?: unknown) => Promise<EntityDetail | null>>(),
    get_entities: vi.fn<(a: string[]) => Promise<RawEntity[]>>().mockResolvedValue([]),
    search_entities_by_name: vi.fn<(a: unknown) => Promise<RawEntity[]>>(),
    list_facets_for_entities: vi.fn<(a: string[]) => Promise<FacetRecord[]>>(),
    list_canonical_for_entities: vi.fn<(a: string[]) => Promise<CanonicalRecord[]>>(),
    get_canonical: vi.fn<(a: string, b?: string[]) => Promise<Partial<NoteCanonical>>>().mockResolvedValue({}),
    // old N+1 ops — must never be hit on the read path
    list_facets_for_entity: vi.fn(reject("list_facets_for_entity")),
    get_entity: vi.fn(reject("get_entity")),
  } as unknown as GraphService<NoteFacets, NoteCanonical>;
}

function makeModule(graph: GraphService<NoteFacets, NoteCanonical>): NotesModule {
  const deps = {
    graph,
    ctx: { extension_id: "notes", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<NoteFacets, NoteCanonical>;
  return new NotesModule(deps);
}

describe("notes read — shape parity (tst_be_notesread_001)", () => {
  let graph: GraphService<NoteFacets, NoteCanonical>;
  let mod: NotesModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("F1 search keeps canonical-derived pinned/updated_at/title (batch facets + batch canonical)", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "n1", schema_id: ENTITY, name: "", created_at: "2026-01-01T00:00:00Z" },
    ] satisfies RawEntity[]);
    // facet carries body only — NO pinned / updated_at / title
    (graph.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entity_id: "n1", id: "f1", schema_id: CONTENT, source: "manual", observed_at: "x", data: { body: "hello world" } },
    ] satisfies FacetRecord[]);
    // canonical supplies pinned / updated_at / title
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entity_id: "n1", key: "note.pinned", value: true },
      { entity_id: "n1", key: "note.updated_at", value: "2026-03-03T00:00:00Z" },
      { entity_id: "n1", key: "note.title", value: "Canon Title" },
    ] satisfies CanonicalRecord[]);

    const page = await mod.list({ search: "canon", limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    const item = page.items[0];
    expect(item.title).toBe("Canon Title"); // entity.name empty, facet title absent → canonical
    expect(item.pinned).toBe(true); // from canonical note.pinned
    expect(item.updated_at).toBe("2026-03-03T00:00:00Z"); // from canonical note.updated_at
    expect(item.preview).toContain("hello"); // preview from facet body
  });

  it("F2 get resolves link neighbours via ONE get_entities batch (no per-link fetch)", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: { id: "n1", schema_id: ENTITY, name: "My Note", created_at: "2026-01-01T00:00:00Z" },
      facets: [{ id: "f1", schema_id: CONTENT, source: "manual", observed_at: "x", data: { body: "b" } }],
      links: [
        { id: "l1", from_id: "n1", to_id: "c1", kind: "mentions" },
        { id: "l2", from_id: "n1", to_id: "c2", kind: "mentions" },
      ],
    } satisfies EntityDetail);
    (graph.get_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "c1", schema_id: "contacts.person", name: "Alice", created_at: "x" },
      { id: "c2", schema_id: "contacts.person", name: "Bob", created_at: "x" },
    ] satisfies RawEntity[]);

    const view = await mod.get({ id: "n1" });
    expect(view.title).toBe("My Note");
    expect(view.linked_entities.map((l) => l.name)).toEqual(["Alice", "Bob"]);
    expect(graph.get_entities).toHaveBeenCalledTimes(1); // ONE batch, no per-link N+1
  });

  it("F3 get throws on a non-notes / missing entity", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });

  it("F4 list (no search) maps window rows", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ entity: { id: "n1", schema_id: ENTITY, name: "Title", created_at: "x" }, data: { body: "body", pinned: true } }],
      total: 1,
    });
    const page = await mod.list({});
    expect(page.items[0]).toMatchObject({ title: "Title", pinned: true });
  });
});

describe("notes read — DB-access guarantees (tst_be_notesdb_001 / INV-7)", () => {
  let graph: GraphService<NoteFacets, NoteCanonical>;
  let mod: NotesModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("search = 1 search + 1 batch facets + 1 batch canonical, 0 per-row reads, 0 window", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "n1", schema_id: ENTITY, name: "n", created_at: "x" },
    ] satisfies RawEntity[]);
    (graph.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await mod.list({ search: "x" });
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.get_canonical).toHaveBeenCalledTimes(0);
    expect(graph.list_entities_window).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_canonical + 1 get_entities (links present), 0 per-link", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: { id: "n1", schema_id: ENTITY, name: "N", created_at: "x" },
      facets: [],
      links: [{ id: "l1", from_id: "n1", to_id: "c1", kind: "mentions" }],
    } satisfies EntityDetail);
    (graph.get_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "c1", schema_id: "contacts.person", name: "Alice", created_at: "x" },
    ] satisfies RawEntity[]);
    await mod.get({ id: "n1" });
    expect(graph.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.get_canonical).toHaveBeenCalledTimes(1);
    expect(graph.get_entities).toHaveBeenCalledTimes(1);
  });

  it("get with no links makes 0 get_entities", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: { id: "n1", schema_id: ENTITY, name: "N", created_at: "x" },
      facets: [],
      links: [],
    } satisfies EntityDetail);
    await mod.get({ id: "n1" });
    expect(graph.get_entities).toHaveBeenCalledTimes(0);
  });
});
