// contacts.person.social opt-in (DEC-9). set_social_tracking writes the facet;
// get_social_tracking reads it back. RED invariant (S2): toggle tracked => handle
// in the opt-in state; untoggle => out. Per-platform merge: toggling X never
// clears LinkedIn. Handles are stored bare (no leading @).

import { describe, expect, it, vi } from "vitest";
import type {
  FacetRecord,
  GraphService,
  PluginDeps,
  RawEntity,
} from "@magnis/plugin-sdk";
import { ContactsModule } from "../service.ts";
import type { ContactCanonical, ContactFacets } from "../../types/index.ts";

const SCHEMA = "contacts.person";

// An in-memory graph that records attached facets so a write is visible to the
// next read. CRITICAL runtime property mirrored here (tst_be_contacts_social_003
// root cause): the backend returns facets NEWEST-FIRST (`ORDER BY observed_at
// DESC` — pg_facet.rs:88), so readers must NOT assume append order.
let facetClock = 0;
function isoAt(step: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, step)).toISOString();
}
function makeGraph(entity: RawEntity | null) {
  const facets: FacetRecord[] = [];
  const newestFirst = (list: FacetRecord[]): FacetRecord[] =>
    [...list].sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
  return {
    graph: {
      get_entity: vi.fn(async (_id: string) => entity),
      list_facets_for_entity: vi.fn(async (entityId: string) =>
        newestFirst(facets.filter((f) => f.entity_id === entityId)),
      ),
      attach_facet: vi.fn(async (input: { entity_id: string; schema_id: string; data: unknown }) => {
        facets.push({
          entity_id: input.entity_id,
          id: `f-${facets.length}`,
          schema_id: input.schema_id,
          source: "manual",
          observed_at: isoAt(facetClock++),
          data: input.data,
        });
        return { id: `f-${facets.length - 1}` };
      }),
    } as unknown as GraphService<ContactFacets, ContactCanonical>,
    facets,
  };
}

function makeModule(graph: GraphService<ContactFacets, ContactCanonical>): ContactsModule {
  const deps = {
    graph,
    ctx: { extension_id: "contacts", user_id: "u1" },
    // Deterministic uuid_v5 fake: stable per (namespace, name) → batch retries
    // resolve to the same ids, mirroring the runtime op.
    util: { uuid_v5: vi.fn(async (ns: string, name: string) => `v5-${ns}-${name}`) },
    rpc: { call: vi.fn(), execute: vi.fn() },
  } as unknown as PluginDeps<ContactFacets, ContactCanonical>;
  return new ContactsModule(deps);
}

const person = (id: string, name = "Acme"): RawEntity =>
  ({ id, schema_id: SCHEMA, name }) as unknown as RawEntity;

// Graph with MANY persons + the batch read APIs the by-handle lookup uses,
// plus create/rename so the S1 tools (track/ensure/rename) are testable.
// Same NEWEST-FIRST ordering contract as makeGraph (matches the runtime).
function makeMultiGraph(persons: RawEntity[]) {
  const facets: FacetRecord[] = [];
  const renames: Array<[string, string]> = [];
  let created = 0;
  const newestFirst = (list: FacetRecord[]): FacetRecord[] =>
    [...list].sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
  return {
    graph: {
      get_entity: vi.fn(async (id: string) => persons.find((p) => p.id === id) ?? null),
      create_entity: vi.fn(
        async (input: { schema_id: string; name: string; client_id?: string }) => {
          const e = {
            id: input.client_id ?? `created-${created++}`,
            schema_id: input.schema_id,
            name: input.name,
          } as unknown as RawEntity;
          persons.push(e);
          return e;
        },
      ),
      update_entity_name: vi.fn(async (id: string, name: string) => {
        renames.push([id, name]);
        const e = persons.find((p) => p.id === id);
        if (e) (e as { name: string }).name = name;
      }),
      get_canonical: vi.fn(async () => ({})),
      list_entities: vi.fn(async ({ offset = 0, limit = 500 }: { offset?: number; limit?: number }) => ({
        items: persons.slice(offset, offset + limit),
        total: persons.length,
      })),
      list_facets_for_entity: vi.fn(async (entityId: string) =>
        newestFirst(facets.filter((f) => f.entity_id === entityId)),
      ),
      list_facets_for_entities: vi.fn(async (ids: string[]) =>
        newestFirst(facets.filter((f) => f.entity_id && ids.includes(f.entity_id))),
      ),
      attach_facet: vi.fn(async (input: { entity_id: string; schema_id: string; data: unknown }) => {
        facets.push({
          entity_id: input.entity_id,
          id: `f-${facets.length}`,
          schema_id: input.schema_id,
          source: "manual",
          observed_at: isoAt(facetClock++),
          data: input.data,
        });
        return { id: `f-${facets.length - 1}` };
      }),
    } as unknown as GraphService<ContactFacets, ContactCanonical>,
    facets,
    renames,
  };
}

describe("contacts social tracking (tst_be_contacts_social_001)", () => {
  it("toggle tracked → handle in opt-in state; untoggle → out", async () => {
    const { graph } = makeGraph(person("p1"));
    const mod = makeModule(graph);

    // Track on X with a handle (stored bare, leading @ stripped).
    const on = await mod.set_social_tracking({
      id: "p1",
      platform: "x",
      tracked: true,
      handle: "@Acme",
    });
    expect(on.tracked_x).toBe(true);
    expect(on.x_handle).toBe("Acme");
    expect(await mod.get_social_tracking({ id: "p1" })).toMatchObject({
      tracked_x: true,
      x_handle: "Acme",
    });

    // Untoggle → tracked_x false; the handle stays on record but it's no longer
    // tracked (the scheduler will exclude it).
    const off = await mod.set_social_tracking({ id: "p1", platform: "x", tracked: false });
    expect(off.tracked_x).toBe(false);
    expect((await mod.get_social_tracking({ id: "p1" })).tracked_x).toBe(false);
  });

  it("per-platform merge: toggling X does not clear LinkedIn", async () => {
    const { graph } = makeGraph(person("p2"));
    const mod = makeModule(graph);

    await mod.set_social_tracking({ id: "p2", platform: "linkedin", tracked: true, handle: "in/acme" });
    const after = await mod.set_social_tracking({ id: "p2", platform: "x", tracked: true, handle: "acme" });
    expect(after).toMatchObject({
      tracked_linkedin: true,
      linkedin_handle: "in/acme",
      tracked_x: true,
      x_handle: "acme",
    });
  });

  it("unknown / wrong-schema contact rejects", async () => {
    const { graph } = makeGraph(null);
    const mod = makeModule(graph);
    await expect(
      mod.set_social_tracking({ id: "nope", platform: "x", tracked: true }),
    ).rejects.toThrow(/not found/);
  });

  it("never-tracked contact reads as empty", async () => {
    const { graph } = makeGraph(person("p3"));
    const mod = makeModule(graph);
    expect(await mod.get_social_tracking({ id: "p3" })).toEqual({});
  });
});

// tst_be_contacts_social_002 (social-post-rendering S1, DEC-A): resolve the
// owning contact + tracked state from a platform handle. Case-insensitive —
// stored handles are user-typed while profile handles carry the API's
// canonical casing. Latest facet wins; null when no contact matches.
describe("contacts get_social_tracking_by_handle (tst_be_contacts_social_002)", () => {
  it("finds the contact by handle, case-insensitively, with tracked state", async () => {
    const { graph } = makeMultiGraph([person("p1"), person("p2")]);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p2", platform: "x", tracked: true, handle: "AcmeInc" });

    const hit = await mod.get_social_tracking_by_handle({ platform: "x", handle: "acmeinc" });
    expect(hit).toMatchObject({ contact_id: "p2", tracked: true, handle: "AcmeInc" });
  });

  it("platform mismatch → null; untracked-but-stored handle → tracked:false", async () => {
    const { graph } = makeMultiGraph([person("p1")]);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: true, handle: "acme" });

    expect(
      await mod.get_social_tracking_by_handle({ platform: "linkedin", handle: "acme" }),
    ).toBeNull();

    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: false });
    expect(
      await mod.get_social_tracking_by_handle({ platform: "x", handle: "acme" }),
    ).toMatchObject({ contact_id: "p1", tracked: false });
  });

  it("no matching contact → null", async () => {
    const { graph } = makeMultiGraph([person("p1")]);
    const mod = makeModule(graph);
    expect(
      await mod.get_social_tracking_by_handle({ platform: "x", handle: "ghost" }),
    ).toBeNull();
  });
});

// ── social-contact-identity S1 (tst_track_one / tst_rename_cas / ensure) ────

describe("contacts.track_social_profile (tst_track_one)", () => {
  it("(a) unknown handle from URL → contact created + tracked (created:true)", async () => {
    const { graph } = makeMultiGraph([]);
    const mod = makeModule(graph);
    const r = await mod.track_social_profile({
      platform: "linkedin",
      url_or_handle: "https://www.linkedin.com/in/i20h/",
    });
    expect(r).toMatchObject({ handle: "i20h", created: true });
    expect(
      await mod.get_social_tracking_by_handle({ platform: "linkedin", handle: "i20h" }),
    ).toMatchObject({ contact_id: r.contact_id, tracked: true });
  });

  it("(b) repeat call → same contact, created:false (INV-4)", async () => {
    const persons: RawEntity[] = [];
    const { graph } = makeMultiGraph(persons);
    const mod = makeModule(graph);
    const first = await mod.track_social_profile({ platform: "x", url_or_handle: "@jack" });
    const again = await mod.track_social_profile({ platform: "x", url_or_handle: "jack" });
    expect(again).toMatchObject({ contact_id: first.contact_id, created: false });
  });

  it("(c) existing untracked contact with the handle → flips tracked, no create", async () => {
    const { graph } = makeMultiGraph([person("p1")]);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: false, handle: "jack" });
    const r = await mod.track_social_profile({ platform: "x", url_or_handle: "jack" });
    expect(r).toMatchObject({ contact_id: "p1", created: false });
    expect((await mod.get_social_tracking({ id: "p1" })).tracked_x).toBe(true);
  });

  it("invalid input → typed invalid_url error", async () => {
    const { graph } = makeMultiGraph([]);
    const mod = makeModule(graph);
    await expect(
      mod.track_social_profile({ platform: "x", url_or_handle: "https://x.com/home" }),
    ).rejects.toThrow(/invalid_url/);
  });
});

describe("contacts.batch_track_social (tst_batch, INV-5)", () => {
  const rows = [
    { url_or_handle: "@jack" }, // existing tracked contact
    { url_or_handle: "https://x.com/naval", name: "Naval" }, // new
    { url_or_handle: "https://x.com/home" }, // reserved → invalid_url
    { url_or_handle: "@zed" }, // excluded
  ];

  async function setup() {
    const persons: RawEntity[] = [person("p1", "Jack")];
    const { graph } = makeMultiGraph(persons);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: true, handle: "jack" });
    return { mod, persons };
  }

  it("mixed rows → per-row statuses; invalid row never aborts others", async () => {
    const { mod, persons } = await setup();
    const r = await mod.batch_track_social({
      platform: "x",
      profiles: rows,
      client_id: "b1",
      excluded_indices: [3],
    });
    expect(r.results.map((x) => x.status)).toEqual([
      "tracked",
      "created",
      "invalid_url",
      "excluded",
    ]);
    expect(r.created).toBe(1);
    expect(r.results[0]!.contact_id).toBe("p1");
    // Only Naval was created.
    expect(persons).toHaveLength(2);
  });

  it("retry with the same client_id → zero new contacts, identical ids", async () => {
    const { mod, persons } = await setup();
    const first = await mod.batch_track_social({
      platform: "x",
      profiles: rows,
      client_id: "b1",
      excluded_indices: [3],
    });
    const second = await mod.batch_track_social({
      platform: "x",
      profiles: rows,
      client_id: "b1",
      excluded_indices: [3],
    });
    expect(persons).toHaveLength(2);
    expect(second.results[1]!.contact_id).toBe(first.results[1]!.contact_id);
    expect(second.created).toBe(0);
  });
});

describe("contacts.rename_if_placeholder (tst_rename_cas, INV-7)", () => {
  it("renames only when current name equals expected_name", async () => {
    const { graph, renames } = makeMultiGraph([person("p1", "i20h")]);
    const mod = makeModule(graph);
    const r = await mod.rename_if_placeholder({
      id: "p1",
      expected_name: "i20h",
      new_name: "Ismael Hishon-Rezaizadeh",
    });
    expect(r.renamed).toBe(true);
    expect(renames).toEqual([["p1", "Ismael Hishon-Rezaizadeh"]]);
  });

  it("does NOT rename a user-named contact (CAS miss → no-op)", async () => {
    const { graph, renames } = makeMultiGraph([person("p1", "Mike")]);
    const mod = makeModule(graph);
    const r = await mod.rename_if_placeholder({
      id: "p1",
      expected_name: "i20h",
      new_name: "Ismael",
    });
    expect(r.renamed).toBe(false);
    expect(renames).toEqual([]);
  });
});

// tst_be_contacts_social_003 (LIVE BUG 2026-07-02): the runtime returns facets
// NEWEST-FIRST, but readSocialTracking picked the LAST list element — i.e. the
// OLDEST facet. Every toggle then merged onto a stale base and resurrected
// tracked=true, so Untrack never stopped the scheduler from fetching (burning
// real API credits). The reader must pick the facet with max observed_at.
describe("social tracking survives runtime facet ordering (tst_be_contacts_social_003)", () => {
  it("track x → track li → untrack x → untrack li ⇒ fully untracked, handles kept", async () => {
    const { graph } = makeGraph(person("p1"));
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: true, handle: "jack" });
    await mod.set_social_tracking({ id: "p1", platform: "linkedin", tracked: true, handle: "anndoe" });
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: false });
    await mod.set_social_tracking({ id: "p1", platform: "linkedin", tracked: false });

    expect(await mod.get_social_tracking({ id: "p1" })).toMatchObject({
      tracked_x: false,
      x_handle: "jack",
      tracked_linkedin: false,
      linkedin_handle: "anndoe",
    });
  });

  // linkedin-add-flow LA-1: list every tracked handle for a platform in one
  // call — feeds the linkedin "Syncing…" pending rows (tracked-but-not-yet-
  // synced placeholders in profiles.list).
  it("list_social_tracking returns tracked handles for the platform only", async () => {
    const { graph } = makeMultiGraph([person("p1"), person("p2"), person("p3")]);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "linkedin", tracked: true, handle: "sgershuni" });
    await mod.set_social_tracking({ id: "p2", platform: "linkedin", tracked: false, handle: "olduntracked" });
    await mod.set_social_tracking({ id: "p3", platform: "x", tracked: true, handle: "jack" });

    const rows = await mod.list_social_tracking({ platform: "linkedin" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contact_id: "p1", handle: "sgershuni" });
    expect(typeof rows[0]!.name).toBe("string");

    // Untracking removes the row (newest facet wins).
    await mod.set_social_tracking({ id: "p1", platform: "linkedin", tracked: false });
    expect(await mod.list_social_tracking({ platform: "linkedin" })).toHaveLength(0);
  });

  it("by-handle lookup reads the NEWEST facet, not the oldest", async () => {
    const { graph } = makeMultiGraph([person("p1")]);
    const mod = makeModule(graph);
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: true, handle: "jack" });
    await mod.set_social_tracking({ id: "p1", platform: "x", tracked: false });
    expect(
      await mod.get_social_tracking_by_handle({ platform: "x", handle: "jack" }),
    ).toMatchObject({ contact_id: "p1", tracked: false });
  });
});
