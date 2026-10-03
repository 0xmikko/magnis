// Contacts sync ingest (@syncHandler "contacts") — S3, the replica model
// (plan §5): a page of Google contacts folds into ONE applyBatch of
// contacts.google_contact REPLICA nodes (external id = remoteId, dictionary =
// fields as last synced, zero records, zero hub entities), the addresses are
// minted by their owner over email.ensure_addresses, and auto-attach then
// wires identity edges — attach to the one hub sharing an address, mint a
// hub when none exists, or mint + record same_as candidates when several
// claim the address. The sync NEVER writes the hub.

/**
 * @test-id: tst_module_contacts_ingest_001
 * @scenario: scn_backend_tests_006
 * @covers: ContactsModule.ingest
 * @legacy-id: tst_src_int_contacts_002_synced_contact_reaches_its_address
 * @legacy-id: tst_kernel_glist_001_resync_does_not_duplicate_the_identity_edge
 * @legacy-id: tst_module_contacts_001_hub_edit_survives_a_full_resync
 * @legacy-id: tst_module_contacts_002_replica_phone_reaches_the_card_with_zero_hub_writes
 * @legacy-id: tst_module_contacts_003_shared_address_attaches_not_mints
 * @legacy-id: cli_contacts_001_ingest_creates_person_entity
 * @legacy-id: cli_contacts_002_ingest_is_idempotent
 * @legacy-id: cli_contacts_003_partial_person_is_kept
 * @legacy-id: cli_contacts_004_extra_email_grows_facets
 * @deterministic: yes
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchEntityInput, CanonicalEntity, CanonicalLink, GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { entity, link, mockGraph, mountModule, page, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";
import type { ContactCanonical } from "../../types.ts";

type G = MockGraph;

// `graph.spies` is a `Record<string, Mock>`, so under noUncheckedIndexedAccess
// every lookup is `Mock | undefined`. A spy this test arranges/asserts always
// exists by construction; surface a clear failure if it somehow does not.
function spy(g: G, name: string) {
  const s = g.spies[name];
  if (s === undefined) throw new Error(`test setup: spy "${name}" not registered`);
  return s;
}

// The ingest-path world: applyBatch echoes each key → a deterministic id;
// links/entity reads feed auto-attach (default: empty world → every replica
// mints a hub); addLink records the identity edges; createEntity records
// hub mints. rpcCalls records the ensure_addresses hand-off.
interface World {
  graph: G;
  rpcCalls: { method: string; params: unknown }[];
  links: { from: string; to: string; kind: string }[];
  minted: { schemaId: string; name: string }[];
  /** identity edges pre-existing in the world: entity id → its links. */
  linksFor?: Record<string, CanonicalLink[]>;
  entities?: Record<string, CanonicalEntity>;
  externalIds?: Record<string, string>;
  graphOverrides?: Record<string, unknown>;
}

function ingestWorld(over: Partial<World> = {}): World {
  const world: World = {
    graph: undefined as unknown as G,
    rpcCalls: [],
    links: [],
    minted: [],
    ...over,
  };
  let mintSeq = 0;
  world.graph = mockGraph({
    applyBatch: (frag: GraphBatchInput) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e: BatchEntityInput) => [
          e.key,
          e.schemaId === "email.address" ? `addr-${e.key.slice("addr:".length)}` : `id-${e.key}`,
        ])),
        created: frag.entities.length,
        updated: 0,
        linksAdded: frag.links.length,
        droppedKeys: [],
      }),
    listLinksForEntity: (id: string) => Promise.resolve(world.linksFor?.[id] ?? []),
    getEntities: (ids: string[]) =>
      Promise.resolve(
        ids
          .map((id) => world.entities?.[id])
          .filter((e): e is NonNullable<typeof e> => e !== undefined),
      ),
    getEntity: (id: string) => Promise.resolve(world.entities?.[id] ?? null),
    createEntity: (input: { schemaId: string; name: string }) => {
      world.minted.push({ schemaId: input.schemaId, name: input.name });
      return Promise.resolve(entity(`hub-${mintSeq++}`, input.name, { schemaId: input.schemaId }));
    },
    addLink: (p: { from: string; to: string; kind: string }) => {
      world.links.push(p);
      return Promise.resolve();
    },
    listEntities: () => Promise.resolve(page([])),
    ...world.graphOverrides,
  } as never);
  return world;
}

function mountWorld(world: World): ContactsModule {
  return mountModule(ContactsModule, {
    graph: world.graph,
    ctx: { extensionId: "contacts" },
    rpc: {
      execute: (method: string, params: unknown) => {
        world.rpcCalls.push({ method, params });
        if (method === "email.ensure_addresses") {
          const items = (params as { items: { address: string }[] }).items;
          return Promise.resolve({ ids: items.map((i) => `addr-${i.address}`) });
        }
        throw new Error(`unexpected rpc: ${method}`);
      },
    } as never,
  }).module;
}

const env = (over: Partial<SyncEnvelope>): SyncEnvelope => ({
  sourceId: "google",
  surface: "contacts",
  accountId: "acct-1",
  userId: "u1",
  kind: "snapshot",
  remoteId: "gpeople:abc123",
  payload: {},
  timestamp: "2026-03-14T09:00:00Z",
  ...over,
});

// A Google connector `Contact` payload (sources/google/src/surfaces.rs).
const contactPayload = (over: JsonObject = {}): JsonObject => ({
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

const personOf = (frag: GraphBatchInput, key: string): BatchEntityInput => {
  const e = frag.entities.find((e) => e.key === key);
  if (e === undefined) throw new Error(`personOf: no entity with key ${key}`);
  return e;
};

function lastBatch(graph: G): GraphBatchInput {
  const calls = spy(graph, "applyBatch").mock.calls;
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("lastBatch: applyBatch never called");
  return last[0] as GraphBatchInput;
}

describe("contacts ingest — the replica model (tst_be_contactsingest_001)", () => {
  /**
   * @test-id: tst_module_contacts_ingest_003
   * @scenario: scn_google_pull_001
   * @covers: ContactsModule.ingest
   * @deterministic: yes
   * @fixtures: one Google contact; the direct Graph link op accepts no batch-only fields
   */
  it("tst_module_contacts_ingest_003 sends only direct-link fields to the host", async () => {
    const world = ingestWorld({ graphOverrides: {
      addLink: (added: Record<string, unknown>) => {
        if ("declaredBy" in added || "status" in added) throw new Error("link: unknown fields declaredBy or status");
        return Promise.resolve();
      },
    } });
    await expect(mountWorld(world).ingest({ envelopes: [env({ payload: contactPayload() })] }))
      .resolves.toBeDefined();
    expect(spy(world.graph, "listLinksForEntity").mock.calls.every((call) => call[1] === "identity")).toBe(true);
  });

  /**
   * @test-id: tst_module_contacts_ingest_002
   * @scenario: scn_google_pull_001
   * @covers: ContactsModule.ingest
   * @deterministic: yes
   * @fixtures: one Google contact with an email address; sync RPC is forbidden
   */
  it("tst_module_contacts_ingest_002 writes address nodes without cross-module RPC in sync", async () => {
    const world = ingestWorld();
    const mod = mountModule(ContactsModule, {
      graph: world.graph,
      ctx: { extensionId: "contacts" },
      rpc: { execute: () => Promise.reject(new Error("op_plugin_rpc_call forbidden in sync")) } as never,
    }).module;
    await expect(mod.ingest({ envelopes: [env({ payload: contactPayload() })] })).resolves.toBeDefined();
    expect(lastBatch(world.graph).entities).toContainEqual(expect.objectContaining({
      schemaId: "email.address",
      externalId: "email:address:mikhail@example.com",
    }));
  });

  it("one envelope → ONE replica node: its external id, dictionary as last synced, zero facets, zero hub writes in the batch", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.graph.spies.applyBatch).toHaveBeenCalledTimes(1);
    const frag = lastBatch(world.graph);
    expect(frag.entities.map((e) => e.schemaId)).toEqual(["email.address", "contacts.google_contact"]);

    const replica = personOf(frag, "gpeople:abc123");
    expect(replica.externalId).toBe("gpeople:abc123");
    expect(replica.name).toBe("Mikhail Lazarev");
    const props = replica.properties as JsonObject;
    expect(props.given_name).toBe("Mikhail");
    expect(props.family_name).toBe("Lazarev");
    expect(props.photo_url).toBe("https://photos.example.com/a.jpg");
    expect(Array.isArray(props.emails)).toBe(true);
    expect(Array.isArray(props.phones)).toBe(true);

    expect(world.rpcCalls).toEqual([]);
  });

  it("no hub anywhere → mint (name vouch) + identity edges to replica and address", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([{ schemaId: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.links).toEqual([
      { from: "hub-0", to: "id-gpeople:abc123", kind: "identity" },
      { from: "hub-0", to: "addr-mikhail@example.com", kind: "identity" },
    ]);
  });

  it("exactly one hub holds identity to a shared address → attach, no mint", async () => {
    const world = ingestWorld({
      linksFor: {
        "addr-mikhail@example.com": [
          link("hub-X", "addr-mikhail@example.com", "identity"),
        ],
      },
      entities: { "hub-X": entity("hub-X", "Mika", { schemaId: "contacts.person" }) },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.links).toEqual([
      { from: "hub-X", to: "id-gpeople:abc123", kind: "identity" },
      {
        from: "hub-X",
        to: "addr-mikhail@example.com",
        kind: "identity",
      },
    ]);
  });

  it("several hubs claim the address → mint a separate hub + same_as merge-candidates", async () => {
    const world = ingestWorld({
      linksFor: {
        "addr-mikhail@example.com": [
          link("hub-A", "addr-mikhail@example.com", "identity"),
          link("hub-B", "addr-mikhail@example.com", "identity"),
        ],
      },
      entities: {
        "hub-A": entity("hub-A", "A", { schemaId: "contacts.person" }),
        "hub-B": entity("hub-B", "B", { schemaId: "contacts.person" }),
      },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toHaveLength(1);
    const candidates = world.links.filter((l) => l.kind === "same_as");
    expect(candidates.map((l) => l.to).sort()).toEqual(["hub-A", "hub-B"]);
  });

  // The legacy-fleet probe retired with the archive it read: a pre-anchor hub
  // was recognised by the hashed key sitting in its frozen rows, and those
  // rows are gone. Such a hub is now invisible to ingest, so a fresh one is
  // minted — the documented consequence of dropping the archive
  // (docs/plans/facet-removal.md).
  it("a pre-anchor hub is no longer recognised — ingest mints a fresh one", async () => {
    const world = ingestWorld({
      externalIds: { "gpeople:abc123": "old-hub" },
      entities: { "old-hub": entity("old-hub", "Old", { schemaId: "contacts.person" }) },
    });
    const mod = mountWorld(world);
    await mod.ingest({
      envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload({ emails: [] }) })],
    });

    expect(world.minted).toEqual([{ schemaId: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.links).toEqual([
      { from: "hub-0", to: "id-gpeople:abc123", kind: "identity" },
    ]);
  });

  it("re-sync: the replica already has its hub → zero new edges, zero mints", async () => {
    const world = ingestWorld({
      linksFor: {
        "id-gpeople:abc123": [
          link("hub-X", "id-gpeople:abc123", "identity"),
        ],
      },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.links).toEqual([]);
  });

  it("two envelopes for the same resourceName fold to one replica (no dup)", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({
      envelopes: [
        env({ remoteId: "gpeople:abc123", payload: contactPayload() }),
        env({ remoteId: "gpeople:abc123", payload: contactPayload({ display_name: "Mikhail L." }) }),
      ],
    });
    const frag = lastBatch(world.graph);
    expect(frag.entities.filter((item) => item.schemaId === "contacts.google_contact")).toHaveLength(1);
  });

  it("empty envelopes → no applyBatch", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    const r = await mod.ingest({ envelopes: [] });
    expect(world.graph.spies.applyBatch).toHaveBeenCalledTimes(0);
    expect(r).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });

  /**
   * @test-id: tst_module_contacts_plan_001
   * @scenario: scn_google_sync_001
   * @covers: ContactsModule.ingest (plan)
   * @deterministic: yes
   * @fixtures: a list envelope counting 3 people; a later page leaving one out
   */
  it("states the list's count in full, the persons a page leaves out as skipped, and nothing outside a worker's pass", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    const list = env({ remoteId: "list", payload: { entity_type: "list", total_people: 3 } });
    const first = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [list, env({ payload: contactPayload() })] });
    expect(first).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: { "contacts.google_contact": { total: 3, skipped: 0 } }, excluded: [] });
    expect(lastBatch(world.graph).entities.map((item) => item.key)).not.toContain("list");
    const later = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [env({ remoteId: "list", payload: { entity_type: "list", skipped: 1 } }), env({ remoteId: "gpeople:c2", payload: contactPayload({ id: "c2" }) })] });
    expect(later.plan).toEqual({ "contacts.google_contact": { total: 0, skipped: 1 } });
    const outside = await mod.ingest({ envelopes: [list] });
    expect(outside).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });
});

/**
 * @test-id: tst_module_google_002
 * @scenario: scn_google_pull_003
 * @covers: ContactsModule.ingest, ContactsModule.onSyncComplete
 * @deterministic: yes
 * @fixtures: one Google replica attached to a curated hub; an unseen replica after token expiry
 */
describe("Google contact removal", () => {
  it("deletes the replica its external id names on a People deletion and leaves its curated hub untouched", async () => {
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const getEntity = vi.fn().mockResolvedValue(entity("replica", "Replica", { schemaId: "contacts.google_contact", properties: { source_id: "google", account_id: "acct-1" } }));
    const world = ingestWorld({ graphOverrides: {
      findByExternalId: vi.fn().mockResolvedValue("replica"), getEntity, deleteEntity,
    } });
    const mod = mountWorld(world);
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete", remoteId: "gpeople:abc123" })] });
    expect(deleteEntity).toHaveBeenCalledExactlyOnceWith("replica");
    expect(world.minted).toEqual([]);
  });

  it("reconciles only unseen Google replicas after a complete pass", async () => {
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const listEntitiesByPropertyField = vi.fn().mockResolvedValue(page([
      entity("old", "Old", { schemaId: "contacts.google_contact", properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:1" } }),
      entity("seen", "Seen", { schemaId: "contacts.google_contact", properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:2" } }),
      entity("other", "Other", { schemaId: "contacts.google_contact", properties: { source_id: "google", account_id: "acct-2", sync_pass: "initial:r:1" } }),
    ], 3));
    const world = ingestWorld({ graphOverrides: { listEntitiesByPropertyField, deleteEntity } });
    const mod = mountWorld(world);
    expect(deleteEntity).not.toHaveBeenCalled();
    expect(await mod.onSyncComplete({ userId: "u1", sourceId: "google", accountId: "acct-1", identityKey: null, generation: "initial:r:2" })).toEqual({
      departed: [], plan: { "contacts.google_contact": { total: 0, skipped: 0 } },
    });
    expect(deleteEntity).toHaveBeenCalledExactlyOnceWith("old");
  });
});

/**
 * @test-id: tst_module_google_005
 * @scenario: scn_google_pull_004
 * @covers: ContactsModule.ingest (incremental plan)
 * @deterministic: yes
 * @fixtures: one new People replica, its replay and deletion during token-based Poll
 */
describe("People Poll progress", () => {
  it("counts only the first admitted replica and its first deletion", async () => {
    const findByExternalIds = vi.fn().mockResolvedValueOnce([null]).mockResolvedValueOnce(["replica"]);
    const findByExternalId = vi.fn().mockResolvedValueOnce("replica").mockResolvedValueOnce(null);
    const getEntity = vi.fn().mockResolvedValue(entity("replica", "Replica", { schemaId: "contacts.google_contact", properties: { source_id: "google", account_id: "acct-1" } }));
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const world = ingestWorld({ graphOverrides: { findByExternalIds, findByExternalId, getEntity, deleteEntity } });
    const mod = mountWorld(world);
    const person = env({ payload: contactPayload() });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [person] })).plan?.["contacts.google_contact"]).toEqual({ total: 1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [person] })).plan?.["contacts.google_contact"]).toEqual({ total: 0, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.["contacts.google_contact"]).toEqual({ total: -1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.["contacts.google_contact"]).toEqual({ total: 0, skipped: 0 });
    expect(deleteEntity).toHaveBeenCalledExactlyOnceWith("replica");
  });
});
