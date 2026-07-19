// Contacts read surface — shape parity + DB-access guarantees after the
// graph-read-api adoption. list keeps the page query (list_entities order idx /
// search_entities_by_name) but hydrates the page with TWO batch reads —
// list_canonical_for_entities (email/phone/role/company, collection-merged) AND
// list_facets_for_entities (channels + relevance_tier) — instead of the old
// per-row get_canonical + list_facets_for_entity 2N+1. get uses get_entity_full
// (P1) + one get_canonical + one get_entities batch. Mirrors
// email/__tests__/emailRead.test.ts. tst_be_contactsread_001 (shape) +
// tst_be_contactsdb_001 (op-counts → INV-4/5/10).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalRecord,
  EntityDetail,
  EntityPage,
  FacetRecord,
  GraphService,
  PluginDeps,
  RawEntity,
  WindowPage,
} from "@magnis/plugin-sdk";
import { ContactsModule } from "./service.ts";
import type { ContactCanonical, ContactFacets } from "../types/index.ts";

const SCHEMA = "contacts.person";

function makeGraph(): GraphService<ContactFacets, ContactCanonical> {
  const reject =
    (name: string) =>
    (..._args: unknown[]): never => {
      throw new Error(`unexpected graph op on read path: ${name}`);
    };
  return {
    list_entities: vi.fn<[unknown], Promise<EntityPage>>(),
    // Default (hide-group) list path filters tier at the query level via the
    // windowed read primitive — exact total + full pages.
    list_entities_window: vi.fn<[unknown], Promise<WindowPage>>(),
    search_entities_by_name: vi.fn<[unknown], Promise<RawEntity[]>>(),
    list_canonical_for_entities: vi.fn<[string[]], Promise<CanonicalRecord[]>>().mockResolvedValue([]),
    list_facets_for_entities: vi.fn<[string[]], Promise<FacetRecord[]>>().mockResolvedValue([]),
    get_entity_full: vi.fn<[string, unknown?], Promise<EntityDetail | null>>(),
    get_canonical: vi.fn<[string, string[]?], Promise<Partial<ContactCanonical>>>().mockResolvedValue({}),
    get_entities: vi.fn<[string[]], Promise<RawEntity[]>>().mockResolvedValue([]),
    // get reads ALL facets via list_facets_for_entity (one entity) — allowed in
    // get; the list paths must use the batch list_facets_for_entities instead.
    list_facets_for_entity: vi.fn<[string], Promise<FacetRecord[]>>().mockResolvedValue([]),
    // old N+1 op — must never be hit on the read path
    get_entity: vi.fn(reject("get_entity")),
  } as unknown as GraphService<ContactFacets, ContactCanonical>;
}

function makeModule(graph: GraphService<ContactFacets, ContactCanonical>): ContactsModule {
  const deps = {
    graph,
    ctx: { extension_id: "contacts", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  } as unknown as PluginDeps<ContactFacets, ContactCanonical>;
  return new ContactsModule(deps);
}

const canon = (entity_id: string, key: string, value: unknown): CanonicalRecord => ({ entity_id, key, value });
const facet = (entity_id: string, schema_id: string, data: unknown): FacetRecord => ({
  entity_id,
  id: `f-${entity_id}-${schema_id}`,
  schema_id,
  source: "manual",
  observed_at: "x",
  data,
});

describe("contacts read — shape parity (tst_be_contactsread_001)", () => {
  let graph: GraphService<ContactFacets, ContactCanonical>;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("F1 list builds items from batch canonical (email/phone/role/company) + batch facets (channels/tier)", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { entity: { id: "c1", schema_id: SCHEMA, name: "Alice Smith" }, data: null },
        { entity: { id: "c2", schema_id: SCHEMA, name: "Bob" }, data: null },
      ],
      total: 2,
    } satisfies WindowPage);
    (graph.list_canonical_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      canon("c1", "person.full_name", "Alice Smith"),
      canon("c1", "person.email", "canon@x.com"),
      canon("c1", "person.role", "CEO"),
      // c2 has NO singular person.email mapped → item email stays null
    ]);
    (graph.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      // two email facets on c1 with DIFFERENT values — must NOT drive the item
      facet("c1", "contacts.person.email", { email: "facet-a@x.com" }),
      facet("c1", "contacts.person.email", { email: "facet-b@x.com" }),
      facet("c2", "contacts.person.profile", { relevance_tier: "core" }),
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
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ entity: { id: "c1", schema_id: SCHEMA, name: "Real DM Person" }, data: null }],
      total: 933, // DB already excluded group rows → visible count
    } satisfies WindowPage);

    const page = await mod.list({});

    // The query-level filter expresses "tier != group" via IS DISTINCT FROM,
    // targeting the telegram.contact facet where the live data stores the tier.
    const spec = (graph.list_entities_window as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
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
    expect(graph.list_entities).not.toHaveBeenCalled();
  });

  it("F2b total reflects the VISIBLE (non-group) count returned by the windowed query", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { entity: { id: "c1", schema_id: SCHEMA, name: "A" }, data: null },
        { entity: { id: "c2", schema_id: SCHEMA, name: "B" }, data: null },
      ],
      total: 933, // NOT the 2986 unfiltered DB count
    } satisfies WindowPage);

    const page = await mod.list({ limit: 50, offset: 0 });
    expect(page.total).toBe(933);
  });

  it("F2c include_all=true shows ALL contacts (group included) via the unfiltered list path", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: "c1", schema_id: SCHEMA, name: "Real DM Person" },
        { id: "c2", schema_id: SCHEMA, name: "Group Co-member" },
      ],
      total: 2986,
    } satisfies EntityPage);
    (graph.list_facets_for_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      facet("c2", "telegram.contact", { relevance_tier: "group" }),
    ]);

    const page = await mod.list({ include_all: true });
    expect(page.items.map((i) => i.id)).toEqual(["c1", "c2"]); // group row kept
    expect(page.total).toBe(2986);
    // show-all path does NOT use the tier-filtered window
    expect(graph.list_entities_window).not.toHaveBeenCalled();
  });

  it("F3 get returns a ContactDetailView; neighbours via one get_entities batch, non-owned dropped", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: { id: "c1", schema_id: SCHEMA, name: "Alice", created_at: "2026-01-01T00:00:00Z" },
      facets: [],
      links: [
        { id: "l1", from_id: "c1", to_id: "co1", kind: "works_at" },
        { id: "l2", from_id: "c1", to_id: "secret", kind: "works_at" }, // non-owned → dropped
      ],
    } satisfies EntityDetail);
    // channels come from the ALL-facets read (list_facets_for_entity)
    (graph.list_facets_for_entity as ReturnType<typeof vi.fn>).mockResolvedValue([
      facet("c1", "contacts.identity.telegram", { username: "alice" }),
    ]);
    (graph.get_canonical as ReturnType<typeof vi.fn>).mockResolvedValue({
      "person.full_name": "Alice",
      "person.company": "Acme",
    });
    (graph.get_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "co1", schema_id: "companies.company", name: "Acme", created_at: "x" },
    ] satisfies RawEntity[]);

    const view = await mod.get({ id: "c1" });
    expect(view.name).toBe("Alice");
    expect(view.company).toBe("Acme");
    expect(view.channels).toContain("Telegram");
    expect(view.canonical).toMatchObject({ "person.company": "Acme" });
    expect(view.linked_entities.map((l) => l.id)).toEqual(["co1"]); // non-owned 'secret' dropped
    expect(graph.get_entities).toHaveBeenCalledTimes(1);
  });

  it("F4 get throws on a missing / non-contact entity", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(mod.get({ id: "nope" })).rejects.toThrow();
  });
});

describe("contacts read — DB-access guarantees (tst_be_contactsdb_001 / INV-4/5)", () => {
  let graph: GraphService<ContactFacets, ContactCanonical>;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("list (no search, default) = 1 list_entities_window + 1 batch canonical + 1 batch facets, 0 per-row reads", async () => {
    (graph.list_entities_window as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 } satisfies WindowPage);
    await mod.list({});
    expect(graph.list_entities_window).toHaveBeenCalledTimes(1);
    expect(graph.list_entities).toHaveBeenCalledTimes(0);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.get_canonical).toHaveBeenCalledTimes(0);
  });

  it("list (no search, include_all) = 1 list_entities + 1 batch canonical + 1 batch facets", async () => {
    (graph.list_entities as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 } satisfies EntityPage);
    await mod.list({ include_all: true });
    expect(graph.list_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_entities_window).toHaveBeenCalledTimes(0);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entities).toHaveBeenCalledTimes(1);
  });

  it("list (search) = 1 search + 1 batch canonical + 1 batch facets, 0 list_entities", async () => {
    (graph.search_entities_by_name as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await mod.list({ search: "a" });
    expect(graph.search_entities_by_name).toHaveBeenCalledTimes(1);
    expect(graph.list_canonical_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entities).toHaveBeenCalledTimes(1);
    expect(graph.list_entities).toHaveBeenCalledTimes(0);
  });

  it("get = 1 get_entity_full + 1 get_canonical + 1 get_entities (links present)", async () => {
    (graph.get_entity_full as ReturnType<typeof vi.fn>).mockResolvedValue({
      entity: { id: "c1", schema_id: SCHEMA, name: "A", created_at: "x" },
      facets: [],
      links: [{ id: "l1", from_id: "c1", to_id: "co1", kind: "works_at" }],
    } satisfies EntityDetail);
    (graph.get_entities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "co1", schema_id: "companies.company", name: "Acme", created_at: "x" },
    ] satisfies RawEntity[]);
    await mod.get({ id: "c1" });
    expect(graph.get_entity_full).toHaveBeenCalledTimes(1);
    expect(graph.list_facets_for_entity).toHaveBeenCalledTimes(1);
    expect(graph.get_canonical).toHaveBeenCalledTimes(1);
    expect(graph.get_entities).toHaveBeenCalledTimes(1);
  });
});
