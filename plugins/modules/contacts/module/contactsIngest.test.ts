// Contacts sync ingest (@syncHandler "contacts"): apply_batch parity for Google
// People-API contacts. Unit-tests the module with a mock GraphService whose ops
// are vi.fn() spies; every op EXCEPT apply_batch rejects, proving ingest folds a
// whole page of `contacts` envelopes into ONE graph.apply_batch (entities +
// facets), idempotent on the Google resourceName-derived external_id.
// Mirrors plugins/email/module/__tests__/emailIngest.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BatchEntityInput,
  GraphBatchInput,
  GraphBatchResult,
  GraphService,
  PluginDeps,
} from "@magnis/plugin-sdk";
import { ContactsModule } from "./service.ts";
import type { ContactCanonical, ContactFacets } from "../types/index.ts";

interface SyncEnvelope {
  source_id: string;
  surface: string;
  account_id: string;
  user_id: string;
  kind: string;
  remote_id?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

function makeGraph(): GraphService<ContactFacets, ContactCanonical> {
  const reject =
    (name: string) =>
    (..._a: unknown[]): never => {
      throw new Error(`unexpected graph op on ingest path: ${name}`);
    };
  return {
    // apply_batch echoes each key → a deterministic id.
    apply_batch: vi.fn<[GraphBatchInput], Promise<GraphBatchResult>>(async (frag) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      links_added: frag.links?.length ?? 0,
      dropped_keys: [],
    })),
    create_entity: vi.fn(reject("create_entity")),
    attach_facet: vi.fn(reject("attach_facet")),
    add_link: vi.fn(reject("add_link")),
    get_entity: vi.fn(reject("get_entity")),
    // social_contact find-or-create (INV-8) reads existing handles; the
    // default world is empty. Tests override to simulate known contacts.
    list_entities: vi.fn(async () => ({ items: [], total: 0 })),
    list_facets_for_entities: vi.fn(async () => []),
  } as unknown as GraphService<ContactFacets, ContactCanonical>;
}

function makeModule(graph: GraphService<ContactFacets, ContactCanonical>): ContactsModule {
  return new ContactsModule({
    graph,
    ctx: { extension_id: "contacts", user_id: "u1" },
    util: {},
    rpc: { execute: vi.fn() },
  } as unknown as PluginDeps<ContactFacets, ContactCanonical>);
}

const env = (over: Partial<SyncEnvelope> & { payload?: Record<string, unknown> }): SyncEnvelope => ({
  source_id: "google",
  surface: "contacts",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
  remote_id: "gpeople:abc123",
  payload: {},
  timestamp: "2026-03-14T09:00:00Z",
  ...over,
});

// A Google connector `Contact` payload (plugins/sources/google/src/surfaces.rs).
const contactPayload = (over: Record<string, unknown> = {}) => ({
  id: "abc123",
  display_name: "Mikhail Lazarev",
  given_name: "Mikhail",
  family_name: "Lazarev",
  emails: [{ address: "mikhail@example.com", label: "work", is_primary: true }],
  phones: [{ number: "+4930 1234567", label: "mobile", is_primary: true }],
  organizations: [{ name: "Acme", title: "Engineer", is_current: true }],
  photo_url: "https://photos.example.com/a.jpg",
  external_url: "https://contacts.google.com/person/c12345",
  ...over,
});

const personOf = (frag: GraphBatchInput, key: string): BatchEntityInput =>
  frag.entities.find((e) => e.key === key)!;

const facetOf = (e: BatchEntityInput, schema_id: string) =>
  e.facets.filter((f) => f.schema_id === schema_id);

function lastBatch(graph: GraphService<ContactFacets, ContactCanonical>): GraphBatchInput {
  const calls = (graph.apply_batch as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as GraphBatchInput;
}

describe("contacts ingest — apply_batch shape (tst_be_contactsingest_001)", () => {
  let graph: GraphService<ContactFacets, ContactCanonical>;
  let mod: ContactsModule;
  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  it("one Google contact envelope → one apply_batch with a contacts.person entity + profile/email/phone/external_link facets", async () => {
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(graph.apply_batch).toHaveBeenCalledTimes(1);
    const frag = lastBatch(graph);

    const people = frag.entities.filter((e) => e.schema_id === "contacts.person");
    expect(people.map((p) => p.key)).toEqual(["gpeople:abc123"]);

    const person = personOf(frag, "gpeople:abc123");
    expect(person.name).toBe("Mikhail Lazarev");

    // profile facet: first_name/last_name from given/family.
    const profile = facetOf(person, "contacts.person.profile");
    expect(profile).toHaveLength(1);
    expect(profile[0].external_id).toBe("gpeople:abc123");
    expect((profile[0].data as Record<string, unknown>).first_name).toBe("Mikhail");
    expect((profile[0].data as Record<string, unknown>).last_name).toBe("Lazarev");

    // external_link facet: source_type + external_id (idempotency key origin) + url + name.
    const ext = facetOf(person, "contacts.person.external_link");
    expect(ext).toHaveLength(1);
    expect((ext[0].data as Record<string, unknown>).source_type).toBe("google");
    expect((ext[0].data as Record<string, unknown>).external_id).toBe("abc123");
    expect((ext[0].data as Record<string, unknown>).external_url).toBe(
      "https://contacts.google.com/person/c12345",
    );
  });

  it("email + phone present → contacts.person.email and contacts.person.phone facets", async () => {
    await mod.ingest({
      envelopes: [
        env({
          remote_id: "gpeople:abc123",
          payload: contactPayload({
            emails: [
              { address: "a@example.com", label: "work", is_primary: true },
              { address: "b@example.com", label: "home", is_primary: false },
            ],
            phones: [{ number: "+10000000", label: "mobile", is_primary: true }],
          }),
        }),
      ],
    });
    const person = personOf(lastBatch(graph), "gpeople:abc123");

    const emails = facetOf(person, "contacts.person.email");
    expect(emails.map((f) => (f.data as Record<string, unknown>).email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    const work = emails.find((f) => (f.data as Record<string, unknown>).email === "a@example.com")!;
    expect((work.data as Record<string, unknown>).is_primary).toBe(true);
    expect((work.data as Record<string, unknown>).type).toBe("work");

    const phones = facetOf(person, "contacts.person.phone");
    expect(phones).toHaveLength(1);
    expect((phones[0].data as Record<string, unknown>).phone).toBe("+10000000");
    expect((phones[0].data as Record<string, unknown>).type).toBe("mobile");
    expect((phones[0].data as Record<string, unknown>).is_primary).toBe(true);
  });

  it("two envelopes for the same resourceName fold/upsert to one entity (no dup)", async () => {
    await mod.ingest({
      envelopes: [
        env({ remote_id: "gpeople:abc123", payload: contactPayload() }),
        env({ remote_id: "gpeople:abc123", payload: contactPayload({ display_name: "Mikhail L." }) }),
      ],
    });

    // Same external_id → ONE contacts.person entity in the batch (apply_batch
    // upserts on the facet external_id, so the key must collapse).
    const frag = lastBatch(graph);
    const people = frag.entities.filter((e) => e.schema_id === "contacts.person");
    expect(people).toHaveLength(1);
    expect(people[0].key).toBe("gpeople:abc123");
  });

  it("empty envelopes → no apply_batch", async () => {
    const r = await mod.ingest({ envelopes: [] });
    expect(graph.apply_batch).toHaveBeenCalledTimes(0);
    expect(r.ok).toBe(true);
  });
});

// ── social_contact mapper (plan §7, S5) ─────────────────────────────────────
// x/linkedin following imports arrive as social_contact envelopes on the SAME
// contacts surface; the mapper mints untracked social contacts through the
// ONE apply_batch path (no rpc, no direct writes) and drops envelopes that
// violate the required-fields contract.
describe("contacts ingest — social_contact envelopes", () => {
  let graph: GraphService<ContactFacets, ContactCanonical>;
  let mod: ContactsModule;

  beforeEach(() => {
    graph = makeGraph();
    mod = makeModule(graph);
  });

  const socialEnv = (handle: string, over: Record<string, unknown> = {}) =>
    env({
      source_id: "x",
      remote_id: `x:social:${handle.toLowerCase()}`,
      payload: {
        kind: "social_contact",
        handle,
        display_name: `Name ${handle}`,
        profile_url: `https://x.com/${handle}`,
        ...over,
      },
    });

  it("tst_contacts_social_001 mints an untracked social contact via apply_batch", async () => {
    const r = await mod.ingest({ envelopes: [socialEnv("Friend1")] as never });
    expect(r.ok).toBe(true);
    expect(r.dropped_remote_ids).toEqual([]);

    const batch = vi.mocked(graph.apply_batch).mock.calls.at(-1)?.[0];
    expect(batch).toBeDefined();
    const entity = (batch!.entities as BatchEntityInput[]).find(
      (e) => e.key === "x:social:friend1",
    );
    expect(entity).toBeDefined();
    expect(entity!.schema_id).toBe("contacts.person");
    expect(entity!.name).toBe("Name Friend1");
    const social = entity!.facets.find((f) => f.schema_id === "contacts.person.social");
    expect(social).toBeDefined();
    expect(social!.data).toMatchObject({ x_handle: "Friend1", tracked_x: false });
    const link = entity!.facets.find((f) => f.schema_id === "contacts.person.external_link");
    expect(link).toBeDefined();
    expect(link!.data).toMatchObject({
      source_type: "x",
      external_url: "https://x.com/Friend1",
    });
  });

  it("tst_contacts_social_002 drops envelopes missing a required field", async () => {
    const bad = socialEnv("Friend2", { profile_url: undefined });
    delete (bad.payload as Record<string, unknown>).profile_url;
    const r = await mod.ingest({ envelopes: [bad] as never });
    expect(r.dropped_remote_ids).toEqual(["x:social:friend2"]);
  });

  // INV-8 regression (review finding): re-importing a handle that ALREADY
  // belongs to a contact must leave that contact untouched — especially its
  // tracking opt-in. The old direct-write bug appended a fresh
  // {tracked_x: false} facet that silently untracked the person.
  it("tst_contacts_social_004 re-import never untracks an existing contact", async () => {
    vi.mocked(graph.list_entities).mockResolvedValue({
      items: [{ id: "e-alice", schema_id: "contacts.person", name: "Alice" }],
      total: 1,
    } as never);
    vi.mocked(graph.list_facets_for_entities).mockResolvedValue([
      {
        id: "f1",
        entity_id: "e-alice",
        schema_id: "contacts.person.social",
        data: { x_handle: "Friend1", tracked_x: true },
        created_at: "2026-07-11T00:00:00Z",
      },
    ] as never);

    const r = await mod.ingest({ envelopes: [socialEnv("Friend1")] as never });
    expect(r.ok).toBe(true);
    // NOTHING written: no batch call at all for a page of known handles.
    expect(vi.mocked(graph.apply_batch)).not.toHaveBeenCalled();
  });

  it("tst_contacts_social_003 mixes with google envelopes in the same page", async () => {
    const r = await mod.ingest({
      envelopes: [
        env({ payload: contactPayload() }),
        socialEnv("Friend3"),
      ] as never,
    });
    expect(r.ok).toBe(true);
    const batch = vi.mocked(graph.apply_batch).mock.calls.at(-1)?.[0];
    const keys = (batch!.entities as BatchEntityInput[]).map((e) => e.key);
    expect(keys).toContain("gpeople:abc123");
    expect(keys).toContain("x:social:friend3");
  });
});
