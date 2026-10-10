// Address book sync ingest (@syncHandler "addressbook"): a page of Google
// contacts folds into ONE applyBatch of addressbook.card nodes (identified by
// remoteId, dictionary = fields as last synced) and the email.address nodes
// they list. A card then finds its person by those addresses — none holds
// one: a new person; one does: attach; several do: each gets an identity link
// to the card and nothing merges. The sync never writes the person.
//
// The graph below keeps state across syncs the way the host does: external
// ids resolve, `endLink` dates a link and keeps the row, `deleteEntity`
// archives, and link reads return ended links but not archived endpoints.

/**
 * @test-id: tst_module_contacts_ingest_001
 * @scenario: scn_backend_tests_006
 * @covers: AddressbookModule.ingest
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphService } from "@magnis/plugin-sdk";
import type { BatchEntityInput, PersistentEntity, PersistentEntityId, GraphBatchInput, JsonObject, Link, SyncEnvelope } from "@magnis/sdk";
import { entity, entityId, link, mockGraph, mountModule, sourceEnvelope, type MockGraph, type GraphOverrides } from "@magnis/testkit/module";
import { AddressbookModule } from "../service.ts";

type AddLinkInput = Parameters<GraphService["addLink"]>[0];

const T0 = "2026-03-14T09:00:00.000Z";
const T1 = "2026-03-15T09:00:00.000Z";
const T2 = "2026-03-16T09:00:00.000Z";
const T3 = "2026-03-17T09:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(T0) });
});
afterEach(() => {
  vi.useRealTimers();
});

interface WorldNode {
  id: PersistentEntityId;
  schemaId: string;
  name: string;
  externalId?: string;
  properties: JsonObject;
  /** A synchronizable node's saved choice. */
  syncEnabled?: boolean;
  archived: boolean;
}

interface WorldLink {
  id: string;
  from: string;
  to: string;
  kind: string;
  validFrom: string | null;
  validUntil: string | null;
  metadata: JsonObject | null;
}

interface World {
  graph: MockGraph;
  nodes: Map<string, WorldNode>;
  links: WorldLink[];
  /** Every addLink call, as the module made it. */
  added: AddLinkInput[];
  minted: { schemaId: string; name: string }[];
}

const LINK_FIELDS = ["from", "to", "kind", "metadata", "validFrom", "validUntil"];

/** The email owner's settings the world answers with; its manifest creates
 * new senders synchronized. */
const EMAIL_SETTINGS = { newSenderSyncEnabled: "true" };

function addressBookWorld(seed: {
  nodes?: Omit<WorldNode, "archived">[];
  links?: Omit<WorldLink, "id">[];
  emailSettings?: Record<string, string>;
} = {}): World {
  const nodes = new Map<string, WorldNode>((seed.nodes ?? []).map((node) => [node.id, { ...node, archived: false }]));
  const links: WorldLink[] = (seed.links ?? []).map((held, index) => ({ ...held, id: `seed-${String(index)}` }));
  const added: AddLinkInput[] = [];
  const minted: { schemaId: string; name: string }[] = [];
  let hubSeq = 0;
  const isLive = (id: string): boolean => nodes.get(id)?.archived === false;
  const live = (id: string): WorldNode => {
    const node = nodes.get(id);
    if (node === undefined || node.archived) throw new Error(`Not found: Entity ${id}`);
    return node;
  };
  const byExternalId = (externalId: string): WorldNode | undefined =>
    [...nodes.values()].find((node) => node.externalId === externalId && !node.archived);
  const raw = (node: WorldNode): PersistentEntity => entity(node.id, node.name, {
    schemaId: node.schemaId, properties: node.properties,
    source: { source: "google", account: "acct-1", externalId: node.externalId ?? node.id },
  });
  const overrides: GraphOverrides = {
    applyBatch: (batch: GraphBatchInput) => {
      const ids: Record<string, PersistentEntityId> = {};
      let created = 0;
      for (const item of batch.entities as readonly BatchEntityInput[]) {
        const found = [...nodes.values()].find((node) => node.externalId !== undefined && node.externalId === item.externalId);
        const id = found?.id ?? entityId(item.schemaId === "email.address" ? `addr-${item.name ?? ""}` : `id-${item.key}`);
        if (found === undefined) created += 1;
        nodes.set(id, {
          id, schemaId: item.schemaId, name: item.name ?? "", ...(item.externalId === null ? {} : { externalId: item.externalId }),
          properties: (item.properties ?? {}) as JsonObject, ...(item.syncEnabled === undefined ? {} : { syncEnabled: item.syncEnabled }),
          archived: found?.archived ?? false,
        });
        ids[item.key] = id;
      }
      for (const ref of batch.refs) {
        const found = ref.externalId === null ? undefined : byExternalId(ref.externalId);
        if (found === undefined) throw new Error(`applyBatch: ref ${ref.key} resolves to nothing`);
        ids[ref.key] = found.id;
      }
      return Promise.resolve({ ids, created, updated: batch.entities.length - created, linksAdded: 0, droppedKeys: [], resolved: [] });
    },
    moduleSettings: (forSchema?: string) => {
      if (forSchema !== "email.address") throw new Error(`moduleSettings: unexpected schema ${String(forSchema)}`);
      return Promise.resolve(seed.emailSettings ?? EMAIL_SETTINGS);
    },
    findByExternalId: (externalId: string) => Promise.resolve(byExternalId(externalId)?.id ?? null),
    findByExternalIds: (externalIds: string[]) => Promise.resolve(externalIds.map((externalId) => byExternalId(externalId)?.id ?? null)),
    getEntity: (id: string) => Promise.resolve(isLive(id) ? raw(live(id)) : null),
    getEntities: (ids: string[]) => Promise.resolve(ids.map((id) => raw(live(id)))),
    createEntity: (input) => {
      const id = entityId(`hub-${String(hubSeq++)}`);
      nodes.set(id, { id, schemaId: input.schemaId, name: input.name, properties: {}, archived: false });
      minted.push({ schemaId: input.schemaId, name: input.name });
      return Promise.resolve(raw(live(id)));
    },
    addLink: (params: AddLinkInput) => {
      const unknown = Object.keys(params).filter((key) => !LINK_FIELDS.includes(key));
      if (unknown.length > 0) throw new Error(`link: unknown fields ${unknown.join(", ")}`);
      if (params.validFrom !== undefined && params.validUntil !== undefined && params.validUntil < params.validFrom) {
        throw new Error("link: validUntil must follow validFrom");
      }
      live(params.from);
      live(params.to);
      added.push(params);
      const validFrom = params.validFrom ?? null;
      const same = links.some((held) =>
        held.from === params.from && held.to === params.to && held.kind === params.kind && held.validFrom === validFrom);
      if (!same) {
        links.push({
          id: `link-${String(links.length)}`, from: params.from, to: params.to, kind: params.kind,
          validFrom, validUntil: params.validUntil ?? null, metadata: (params.metadata ?? null) as JsonObject | null,
        });
      }
      return Promise.resolve();
    },
    endLink: (id: string, validUntil: string) => {
      const held = links.find((candidate) => candidate.id === id);
      if (held === undefined) throw new Error(`Not found: Link ${id}`);
      if (held.validUntil !== null) throw new Error(`link ${id} has already ended`);
      held.validUntil = validUntil;
      return Promise.resolve();
    },
    listLinksForEntity: (id: string, kind?: string) => {
      live(id);
      return Promise.resolve(links
        .filter((held) => (held.from === id || held.to === id) && (kind === undefined || held.kind === kind))
        .filter((held) => isLive(held.from) && isLive(held.to))
        .map((held): Link => link(held.from, held.to, held.kind, {
          id: held.id, validFrom: held.validFrom, validUntil: held.validUntil, metadata: held.metadata,
        })));
    },
    deleteEntity: (id: string) => {
      live(id).archived = true;
      return Promise.resolve();
    },
    listEntitiesByPropertyField: (params) => {
      const rows = [...nodes.values()]
        .filter((node) => !node.archived && node.schemaId === params.entitySchema && node.properties[params.key] === params.value)
        .map(raw);
      const offset = params.offset ?? 0;
      const limit = params.limit ?? rows.length;
      return Promise.resolve({ items: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    },
  };
  return { graph: mockGraph(overrides), nodes, links, added, minted };
}

function mountWorld(world: World): AddressbookModule {
  return mountModule(AddressbookModule, {
    graph: world.graph,
    ctx: { extensionId: "addressbook" },
    rpc: { execute: () => Promise.reject(new Error("op_plugin_rpc_call forbidden in sync")) },
  }).module;
}

const person = (id: string, name = id): Omit<WorldNode, "archived"> => ({ id: entityId(id), schemaId: "contacts.person", name, properties: {} });
const address = (value: string): Omit<WorldNode, "archived"> => ({
  id: entityId(`addr-${value}`), schemaId: "email.address", name: value, externalId: `email:address:${value}`, properties: { address: value },
});
/** A link nobody marked: made by hand, by email or by another module. */
const heldBy = (from: string, to: string): Omit<WorldLink, "id"> => ({
  from: entityId(from), to: entityId(to), kind: "identity", validFrom: null, validUntil: null, metadata: null,
});
/** The link the address book opens at sync time `at`. */
const opened = (from: string, to: string, at: string): AddLinkInput => ({
  from: entityId(from), to: entityId(to), kind: "identity", metadata: { producer: "addressbook" }, validFrom: at,
});
const periodsOf = (world: World, from: string, to: string): { validFrom: string | null; validUntil: string | null }[] =>
  world.links
    .filter((held) => held.from === entityId(from) && held.to === entityId(to))
    .map(({ validFrom, validUntil }) => ({ validFrom, validUntil }));

const env = (over: Partial<SyncEnvelope>): SyncEnvelope =>
  sourceEnvelope("addressbook", {}, { sourceId: "google", accountId: "acct-1", userId: "u1", remoteId: "gpeople:abc123", timestamp: "2026-03-14T09:00:00Z", ...over });

/** The hook the host calls after a complete pass of this account. */
const complete = (generation: string) => ({ userId: "u1", sourceId: "google", accountId: "acct-1", identityKey: null, generation });

// A Google connector `Contact` payload (sources/google/src/surfaces/addressbook/contacts.ts).
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
/** A card listing exactly these addresses. */
const card = (remoteId: string, addresses: string[]): SyncEnvelope =>
  env({ remoteId, payload: contactPayload({ id: remoteId, emails: addresses.map((value) => ({ address: value })) }) });

const cardOf = (frag: GraphBatchInput, key: string): BatchEntityInput => {
  const e = frag.entities.find((item) => item.key === key);
  if (e === undefined) throw new Error(`cardOf: no entity with key ${key}`);
  return e;
};

function lastBatch(graph: MockGraph): GraphBatchInput {
  const calls = graph.spies.applyBatch?.mock.calls ?? [];
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("lastBatch: applyBatch never called");
  return last[0] as GraphBatchInput;
}

describe("address book ingest — the card model (tst_be_contactsingest_001)", () => {
  /**
   * @test-id: tst_module_contacts_ingest_003
   * @scenario: scn_google_pull_001
   * @covers: AddressbookModule.ingest
   * @deterministic: yes
   * @fixtures: one Google contact; the direct Graph link op accepts no batch-only fields
   */
  it("tst_module_contacts_ingest_003 sends only direct-link fields to the host", async () => {
    const world = addressBookWorld();
    await expect(mountWorld(world).ingest({ envelopes: [env({ payload: contactPayload() })] }))
      .resolves.toBeDefined();
    expect(world.graph.spies.listLinksForEntity?.mock.calls.every((call) => call[1] === "identity")).toBe(true);
  });

  /**
   * @test-id: tst_module_contacts_ingest_002
   * @scenario: scn_google_pull_001
   * @covers: AddressbookModule.ingest
   * @deterministic: yes
   * @fixtures: one Google contact with an email address; sync RPC is forbidden
   */
  it("tst_module_contacts_ingest_002 writes address nodes without cross-module RPC in sync", async () => {
    const world = addressBookWorld();
    await expect(mountWorld(world).ingest({ envelopes: [env({ payload: contactPayload() })] })).resolves.toBeDefined();
    expect(lastBatch(world.graph).entities).toContainEqual(expect.objectContaining({
      schemaId: "email.address",
      externalId: "email:address:mikhail@example.com",
    }));
  });

  /**
   * @test-id: tst_module_addressbook_email_sync_001
   * @scenario: scn_google_pull_001
   * @covers: AddressbookModule.ingest
   * @deterministic: yes
   * @fixtures: a card listing a stopped address the graph holds and a new
   *   address; the email owner creates new senders stopped
   */
  it("tst_module_addressbook_email_sync_001 keeps a held address's choice and creates a new one by the email owner's rule", async () => {
    const world = addressBookWorld({
      nodes: [{ ...address("old@example.com"), syncEnabled: false }],
      emailSettings: { newSenderSyncEnabled: "false" },
    });
    await mountWorld(world).ingest({ envelopes: [card("gpeople:abc123", ["old@example.com", "new@example.com"])] });

    // @tested-by: tst_module_addressbook_email_sync_001
    // @invariant: an address book card never rewrites a held address's
    // synchronization choice, and a new address takes the email owner's rule.
    const batch = lastBatch(world.graph);
    expect(batch.entities).toContainEqual(expect.objectContaining({ externalId: "email:address:new@example.com", syncEnabled: false }));
    expect(batch.entities).not.toContainEqual(expect.objectContaining({ externalId: "email:address:old@example.com" }));
    expect(batch.refs).toEqual([{ key: "addr:old@example.com", externalId: "email:address:old@example.com" }]);
    expect(world.nodes.get(entityId("addr-old@example.com"))?.syncEnabled).toBe(false);
  });

  it("one envelope → ONE card node: by external id, dictionary as last synced, zero person writes in the batch", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.graph.spies.applyBatch).toHaveBeenCalledTimes(1);
    const frag = lastBatch(world.graph);
    expect(frag.entities.map((e) => e.schemaId)).toEqual(["email.address", "addressbook.card"]);

    const stored = cardOf(frag, "gpeople:abc123");
    expect(stored.externalId).toBe("gpeople:abc123");
    expect(stored.name).toBe("Mikhail Lazarev");
    const props = stored.properties as JsonObject;
    expect(props.given_name).toBe("Mikhail");
    expect(props.family_name).toBe("Lazarev");
    expect(props.photo_url).toBe("https://photos.example.com/a.jpg");
    expect(Array.isArray(props.emails)).toBe(true);
    expect(Array.isArray(props.phones)).toBe(true);
  });

  it("no person anywhere → one person (name vouch) + identity links to the card and the address", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([{ schemaId: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.added).toEqual([
      opened("hub-0", "id-gpeople:abc123", T0),
      opened("hub-0", "addr-mikhail@example.com", T0),
    ]);
  });

  it("exactly one person holds identity to a listed address → attach, no new person", async () => {
    const world = addressBookWorld({
      nodes: [person("hub-X", "Mika"), address("mikhail@example.com")],
      links: [heldBy("hub-X", "addr-mikhail@example.com")],
    });
    await mountWorld(world).ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.added).toEqual([opened("hub-X", "id-gpeople:abc123", T0)]);
    expect(periodsOf(world, "hub-X", "addr-mikhail@example.com")).toEqual([{ validFrom: null, validUntil: null }]);
  });

  /**
   * @test-id: tst_module_addressbook_003
   * @scenario: scn_google_pull_003
   * @covers: AddressbookModule.ingest (owner rule)
   * @deterministic: yes
   * @fixtures: a card listing two addresses, each held by a different person
   */
  it("tst_module_addressbook_003 a card whose addresses two persons hold creates no person and gets an identity link from each", async () => {
    const world = addressBookWorld({
      nodes: [person("hub-A"), person("hub-B"), address("ann@example.com"), address("bob@example.com"), address("cat@example.com")],
      links: [heldBy("hub-A", "addr-ann@example.com"), heldBy("hub-B", "addr-bob@example.com")],
    });
    await mountWorld(world).ingest({ envelopes: [card("gpeople:c1", ["ann@example.com", "bob@example.com", "cat@example.com"])] });

    expect(world.minted).toEqual([]);
    expect(world.added).toEqual([
      opened("hub-A", "id-gpeople:c1", T0),
      opened("hub-B", "id-gpeople:c1", T0),
    ]);
    // Nothing merges: the address nobody holds stays unattached.
    expect(world.links.filter((held) => held.to === entityId("addr-cat@example.com"))).toEqual([]);
  });

  // The legacy-fleet probe retired with the archive it read: a pre-anchor hub
  // was recognised by the hashed key sitting in its frozen rows, and those
  // rows are gone. Such a hub is now invisible to ingest, so a fresh one is
  // minted — the documented consequence of dropping the archive
  // (docs/plans/facet-removal.md).
  it("a pre-anchor hub is no longer recognised — ingest mints a fresh one", async () => {
    const world = addressBookWorld({ nodes: [person("old-hub", "Old")] });
    await mountWorld(world).ingest({
      envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload({ emails: [] }) })],
    });

    expect(world.minted).toEqual([{ schemaId: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.added).toEqual([opened("hub-0", "id-gpeople:abc123", T0)]);
  });

  it("re-sync: the card already has its person and the person its address → zero new links, zero new persons", async () => {
    const world = addressBookWorld({
      nodes: [
        person("hub-X"), address("mikhail@example.com"),
        { id: entityId("id-gpeople:abc123"), schemaId: "addressbook.card", name: "Mikhail Lazarev", externalId: "gpeople:abc123", properties: {} },
      ],
      links: [heldBy("hub-X", "id-gpeople:abc123"), heldBy("hub-X", "addr-mikhail@example.com")],
    });
    await mountWorld(world).ingest({ envelopes: [env({ remoteId: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.added).toEqual([]);
  });

  it("two envelopes for the same resourceName fold to one card (no dup)", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({
      envelopes: [
        env({ remoteId: "gpeople:abc123", payload: contactPayload() }),
        env({ remoteId: "gpeople:abc123", payload: contactPayload({ display_name: "Mikhail L." }) }),
      ],
    });
    const frag = lastBatch(world.graph);
    expect(frag.entities.filter((item) => item.schemaId === "addressbook.card")).toHaveLength(1);
  });

  it("empty envelopes → no applyBatch", async () => {
    const world = addressBookWorld();
    const r = await mountWorld(world).ingest({ envelopes: [] });
    expect(world.graph.spies.applyBatch).toHaveBeenCalledTimes(0);
    expect(r).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });

  /**
   * @test-id: tst_module_contacts_plan_001
   * @scenario: scn_google_sync_001
   * @covers: AddressbookModule.ingest (plan)
   * @deterministic: yes
   * @fixtures: a list envelope counting 3 people; a later page leaving one out
   */
  it("states the list's count in full, the persons a page leaves out as skipped, and nothing outside a worker's pass", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    const list = env({ remoteId: "list", payload: { entity_type: "list", total_people: 3 } });
    const first = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [list, env({ payload: contactPayload() })] });
    expect(first).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: { "addressbook.card": { total: 3, skipped: 0 } }, excluded: [] });
    expect(lastBatch(world.graph).entities.map((item) => item.key)).not.toContain("list");
    const later = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [env({ remoteId: "list", payload: { entity_type: "list", skipped: 1 } }), env({ remoteId: "gpeople:c2", payload: contactPayload({ id: "c2" }) })] });
    expect(later.plan).toEqual({ "addressbook.card": { total: 0, skipped: 1 } });
    const outside = await mod.ingest({ envelopes: [list] });
    expect(outside).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });
});

/**
 * @test-id: tst_module_google_002
 * @scenario: scn_google_pull_003
 * @covers: AddressbookModule.ingest, AddressbookModule.onSyncComplete
 * @deterministic: yes
 * @fixtures: one Google card attached to a person; unseen cards after token expiry
 */
describe("Google contact removal", () => {
  it("archives the card on a People deletion and leaves its person untouched", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ payload: contactPayload() })] });
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete", remoteId: "gpeople:abc123" })] });
    expect(world.graph.spies.deleteEntity).toHaveBeenCalledExactlyOnceWith(entityId("id-gpeople:abc123"));
    expect(world.nodes.get(entityId("id-gpeople:abc123"))?.archived).toBe(true);
    expect(world.nodes.get(entityId("hub-0"))?.archived).toBe(false);
    expect(world.minted).toHaveLength(1);
  });

  it("reconciles only unseen Google cards after a complete pass", async () => {
    const stored = (id: string, account_id: string, sync_pass: string): Omit<WorldNode, "archived"> => ({
      id: entityId(id), schemaId: "addressbook.card", name: id, externalId: `gpeople:${id}`, properties: { source_id: "google", account_id, sync_pass },
    });
    const world = addressBookWorld({
      nodes: [stored("old", "acct-1", "initial:r:1"), stored("seen", "acct-1", "initial:r:2"), stored("other", "acct-2", "initial:r:1")],
    });
    const mod = mountWorld(world);
    expect(await mod.onSyncComplete(complete("initial:r:2"))).toEqual({
      departed: [], plan: { "addressbook.card": { total: 0, skipped: 0 } },
    });
    expect(world.graph.spies.deleteEntity).toHaveBeenCalledExactlyOnceWith(entityId("old"));
  });
});

/**
 * @test-id: tst_module_google_005
 * @scenario: scn_google_pull_004
 * @covers: AddressbookModule.ingest (incremental plan)
 * @deterministic: yes
 * @fixtures: one new People card, its replay and deletion during token-based Poll
 */
describe("People Poll progress", () => {
  it("counts only the first admitted card and its first deletion", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    const contact = env({ payload: contactPayload() });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [contact] })).plan?.["addressbook.card"]).toEqual({ total: 1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [contact] })).plan?.["addressbook.card"]).toEqual({ total: 0, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.["addressbook.card"]).toEqual({ total: -1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.["addressbook.card"]).toEqual({ total: 0, skipped: 0 });
    expect(world.graph.spies.deleteEntity).toHaveBeenCalledExactlyOnceWith(entityId("id-gpeople:abc123"));
  });
});

describe("every sync re-checks the card", () => {
  /**
   * @test-id: tst_module_addressbook_004
   * @scenario: scn_google_pull_003
   * @covers: AddressbookModule.ingest (re-check)
   * @deterministic: yes
   * @fixtures: one attached card gaining an address nobody holds, then one another person holds
   */
  it("tst_module_addressbook_004 an address added to an attached card links to its person", async () => {
    const world = addressBookWorld({
      nodes: [person("hub-C"), address("cat@example.com")],
      links: [heldBy("hub-C", "addr-cat@example.com")],
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com"])] });

    vi.setSystemTime(new Date(T1));
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com", "bob@example.com"])] });
    expect(world.added.slice(2)).toEqual([opened("hub-0", "addr-bob@example.com", T1)]);

    // An added address another person holds makes that person an owner of
    // the card too — a merge candidate — and moves no address.
    vi.setSystemTime(new Date(T2));
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com", "bob@example.com", "cat@example.com"])] });
    expect(world.added.slice(3)).toEqual([opened("hub-C", "id-gpeople:c1", T2)]);
    expect(world.minted).toHaveLength(1);
  });

  /**
   * @test-id: tst_module_addressbook_005
   * @scenario: scn_google_pull_003
   * @covers: AddressbookModule.ingest (re-check)
   * @deterministic: yes
   * @fixtures: a person holding one address by hand and two cards, one of which drops every address
   */
  it("tst_module_addressbook_005 an address removed from a card ends its marked link, while another card of that person keeps the same address open", async () => {
    const world = addressBookWorld({
      nodes: [person("hub-P"), address("ann@example.com")],
      links: [heldBy("hub-P", "addr-ann@example.com")],
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [
      card("gpeople:c1", ["ann@example.com", "bob@example.com", "cat@example.com"]),
      card("gpeople:c2", ["bob@example.com"]),
    ] });
    expect(world.added).toEqual([
      opened("hub-P", "id-gpeople:c1", T0),
      opened("hub-P", "addr-bob@example.com", T0),
      opened("hub-P", "addr-cat@example.com", T0),
      opened("hub-P", "id-gpeople:c2", T0),
    ]);

    vi.setSystemTime(new Date(T1));
    await mod.ingest({ envelopes: [card("gpeople:c1", [])] });

    expect(periodsOf(world, "hub-P", "addr-cat@example.com")).toEqual([{ validFrom: T0, validUntil: T1 }]);
    expect(periodsOf(world, "hub-P", "addr-bob@example.com")).toEqual([{ validFrom: T0, validUntil: null }]);
    // A link the address book did not mark is never ended.
    expect(periodsOf(world, "hub-P", "addr-ann@example.com")).toEqual([{ validFrom: null, validUntil: null }]);
    // A card's owners are never ended by an address change.
    expect(periodsOf(world, "hub-P", "id-gpeople:c1")).toEqual([{ validFrom: T0, validUntil: null }]);
    expect(world.graph.spies.endLink).toHaveBeenCalledTimes(1);
  });

  /**
   * @test-id: tst_module_addressbook_006
   * @scenario: scn_google_pull_003
   * @covers: AddressbookModule.ingest (delete), AddressbookModule.onSyncComplete
   * @deterministic: yes
   * @fixtures: one person with two cards sharing an address; one deleted in Google, the other left unseen by a full pass
   */
  it("tst_module_addressbook_006 a contact deleted in Google archives its card and ends the address links only it held", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [
      card("gpeople:c1", ["ann@example.com", "bob@example.com"]),
      card("gpeople:c2", ["bob@example.com"]),
    ] });

    vi.setSystemTime(new Date(T1));
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete", remoteId: "gpeople:c1" })] });
    expect(world.nodes.get(entityId("id-gpeople:c1"))?.archived).toBe(true);
    expect(periodsOf(world, "hub-0", "addr-ann@example.com")).toEqual([{ validFrom: T0, validUntil: T1 }]);
    expect(periodsOf(world, "hub-0", "addr-bob@example.com")).toEqual([{ validFrom: T0, validUntil: null }]);
    expect(periodsOf(world, "hub-0", "id-gpeople:c1")).toEqual([{ validFrom: T0, validUntil: null }]);

    // The other way a contact leaves: a full pass that never saw it.
    vi.setSystemTime(new Date(T2));
    await mod.onSyncComplete(complete("initial:r:2"));
    expect(world.nodes.get(entityId("id-gpeople:c2"))?.archived).toBe(true);
    expect(periodsOf(world, "hub-0", "addr-bob@example.com")).toEqual([{ validFrom: T0, validUntil: T2 }]);
    expect(world.graph.spies.deleteEntity?.mock.calls).toEqual([[entityId("id-gpeople:c1")], [entityId("id-gpeople:c2")]]);
    expect(world.nodes.get(entityId("hub-0"))?.archived).toBe(false);
  });

  /**
   * @test-id: tst_module_addressbook_007
   * @scenario: scn_google_pull_003
   * @covers: AddressbookModule.ingest (re-check)
   * @deterministic: yes
   * @fixtures: one card losing its only address and getting it back, each sync replayed once
   */
  it("tst_module_addressbook_007 an address removed and then restored ends one link and opens a new one, and replaying either sync changes nothing more", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com"])] });

    vi.setSystemTime(new Date(T1));
    await mod.ingest({ envelopes: [card("gpeople:c1", [])] });
    await mod.ingest({ envelopes: [card("gpeople:c1", [])] });
    expect(periodsOf(world, "hub-0", "addr-ann@example.com")).toEqual([{ validFrom: T0, validUntil: T1 }]);

    vi.setSystemTime(new Date(T2));
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com"])] });
    vi.setSystemTime(new Date(T3));
    await mod.ingest({ envelopes: [card("gpeople:c1", ["ann@example.com"])] });

    expect(periodsOf(world, "hub-0", "addr-ann@example.com")).toEqual([
      { validFrom: T0, validUntil: T1 },
      { validFrom: T2, validUntil: null },
    ]);
    expect(world.graph.spies.endLink).toHaveBeenCalledTimes(1);
    expect(world.added).toEqual([
      opened("hub-0", "id-gpeople:c1", T0),
      opened("hub-0", "addr-ann@example.com", T0),
      opened("hub-0", "addr-ann@example.com", T2),
    ]);
    expect(world.minted).toHaveLength(1);
  });
});
