// Address book sync ingest (@syncHandler "addressbook"): a page of Google
// contacts folds into ONE apply_batch of addressbook.card nodes (anchored by
// remote_id, dictionary = fields as last synced) and the email.address nodes
// they list. A card then finds its person by those addresses — none holds
// one: a new person; one does: attach; several do: each gets an identity link
// to the card and nothing merges. The sync never writes the person.
//
// The graph below keeps state across syncs the way the host does: anchors
// resolve, `end_link` dates a link and keeps the row, `delete_entity`
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
import type { AddLinkParams, BatchEntityInput, GraphBatchInput, GraphService, LinkSummary, RawEntity, SourceEnvelope } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, sourceEnvelope, type MockGraph } from "@magnis/testkit/module";
import { AddressbookModule } from "../service.ts";

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
  id: string;
  schema_id: string;
  name: string;
  anchor?: string;
  properties: Record<string, unknown>;
  /** A synchronizable node's saved choice. */
  syncEnabled?: boolean;
  archived: boolean;
}

interface WorldLink {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  validFrom: string | null;
  validUntil: string | null;
  metadata: Record<string, unknown> | null;
}

interface World {
  graph: MockGraph;
  nodes: Map<string, WorldNode>;
  links: WorldLink[];
  /** Every add_link call, as the module made it. */
  added: AddLinkParams[];
  minted: { schema_id: string; name: string }[];
}

const LINK_FIELDS = ["from_id", "to_id", "kind", "metadata", "validFrom", "validUntil"];

/** The email owner's settings the world answers with; its manifest creates
 * new senders synchronized. */
const EMAIL_SETTINGS = { newSenderSyncEnabled: "true" };

function addressBookWorld(seed: {
  nodes?: Omit<WorldNode, "archived">[];
  links?: Omit<WorldLink, "id">[];
  emailSettings?: Record<string, string>;
} = {}): World {
  const nodes = new Map<string, WorldNode>((seed.nodes ?? []).map((node) => [node.id, { ...node, archived: false }]));
  const links: WorldLink[] = (seed.links ?? []).map((link, index) => ({ ...link, id: `seed-${String(index)}` }));
  const added: AddLinkParams[] = [];
  const minted: { schema_id: string; name: string }[] = [];
  let hubSeq = 0;
  const isLive = (id: string): boolean => nodes.get(id)?.archived === false;
  const live = (id: string): WorldNode => {
    const node = nodes.get(id);
    if (node === undefined || node.archived) throw new Error(`Not found: Entity ${id}`);
    return node;
  };
  const byAnchor = (anchor: string): WorldNode | undefined =>
    [...nodes.values()].find((node) => node.anchor === anchor && !node.archived);
  const raw = (node: WorldNode): RawEntity => ({ id: node.id, schema_id: node.schema_id, name: node.name, indexed: true, properties: node.properties });
  const overrides: Partial<GraphService> = {
    apply_batch: (batch: GraphBatchInput) => {
      const ids: Record<string, string> = {};
      let created = 0;
      for (const entity of batch.entities) {
        const found = [...nodes.values()].find((node) => node.anchor !== undefined && node.anchor === entity.anchor);
        const id = found?.id ?? (entity.schema_id === "email.address" ? `addr-${entity.name ?? ""}` : `id-${entity.key}`);
        if (found === undefined) created += 1;
        nodes.set(id, {
          id, schema_id: entity.schema_id, name: entity.name ?? "", anchor: entity.anchor,
          properties: entity.properties ?? {}, syncEnabled: entity.syncEnabled, archived: found?.archived ?? false,
        });
        ids[entity.key] = id;
      }
      for (const ref of batch.refs ?? []) {
        const found = ref.anchor === undefined ? undefined : byAnchor(ref.anchor);
        if (found === undefined) throw new Error(`apply_batch: ref ${ref.key} resolves to nothing`);
        ids[ref.key] = found.id;
      }
      return Promise.resolve({ ids, created, updated: batch.entities.length - created, links_added: 0, dropped_keys: [] });
    },
    moduleSettings: (forSchema?: string) => {
      if (forSchema !== "email.address") throw new Error(`moduleSettings: unexpected schema ${String(forSchema)}`);
      return Promise.resolve(seed.emailSettings ?? EMAIL_SETTINGS);
    },
    find_by_anchor: (anchor: string) => Promise.resolve(byAnchor(anchor)?.id ?? null),
    find_by_anchors: (anchors: string[]) => Promise.resolve(anchors.map((anchor) => byAnchor(anchor)?.id ?? null)),
    get_entity: (id: string) => Promise.resolve(isLive(id) ? raw(live(id)) : null),
    get_entities: (ids: string[]) => Promise.resolve(ids.map((id) => raw(live(id)))),
    create_entity: (input) => {
      const id = `hub-${String(hubSeq++)}`;
      nodes.set(id, { id, schema_id: input.schema_id, name: input.name, properties: {}, archived: false });
      minted.push({ schema_id: input.schema_id, name: input.name });
      return Promise.resolve(raw(live(id)));
    },
    add_link: (params: AddLinkParams) => {
      const unknown = Object.keys(params).filter((key) => !LINK_FIELDS.includes(key));
      if (unknown.length > 0) throw new Error(`link: unknown fields ${unknown.join(", ")}`);
      if (("validFrom" in params) !== ("validUntil" in params)) throw new Error("link: a period names validFrom and validUntil");
      live(params.from_id);
      live(params.to_id);
      added.push(params);
      const validFrom = params.validFrom ?? null;
      const same = links.some((link) =>
        link.from_id === params.from_id && link.to_id === params.to_id && link.kind === params.kind && link.validFrom === validFrom);
      if (!same) {
        links.push({
          id: `link-${String(links.length)}`, from_id: params.from_id, to_id: params.to_id, kind: params.kind,
          validFrom, validUntil: params.validUntil ?? null, metadata: params.metadata ?? null,
        });
      }
      return Promise.resolve();
    },
    end_link: (id: string, validUntil: string) => {
      const link = links.find((candidate) => candidate.id === id);
      if (link === undefined) throw new Error(`Not found: Link ${id}`);
      if (link.validUntil !== null) throw new Error(`link ${id} has already ended`);
      link.validUntil = validUntil;
      return Promise.resolve();
    },
    list_links_for_entity: (id: string, kind?: string) => {
      live(id);
      return Promise.resolve(links
        .filter((link) => (link.from_id === id || link.to_id === id) && (kind === undefined || link.kind === kind))
        .filter((link) => isLive(link.from_id) && isLive(link.to_id))
        .map((link): LinkSummary => ({ ...link })));
    },
    delete_entity: (id: string) => {
      live(id).archived = true;
      return Promise.resolve();
    },
    list_entities_by_property_field: (params) => {
      const rows = [...nodes.values()]
        .filter((node) => !node.archived && node.schema_id === params.entity_schema && node.properties[params.key] === params.value)
        .map(raw);
      const offset = params.offset ?? 0;
      return Promise.resolve({ items: rows.slice(offset, offset + (params.limit ?? rows.length)), total: rows.length });
    },
  };
  return { graph: mockGraph(overrides), nodes, links, added, minted };
}

function mountWorld(world: World): AddressbookModule {
  return mountModule(AddressbookModule, {
    graph: world.graph,
    ctx: { extension_id: "addressbook" },
    rpc: { execute: () => Promise.reject(new Error("op_plugin_rpc_call forbidden in sync")) },
  }).module;
}

const person = (id: string, name = id): Omit<WorldNode, "archived"> => ({ id, schema_id: "contacts.person", name, properties: {} });
const address = (value: string): Omit<WorldNode, "archived"> => ({
  id: `addr-${value}`, schema_id: "email.address", name: value, anchor: `email:address:${value}`, properties: { address: value },
});
/** A link nobody marked: made by hand, by email or by another module. */
const heldBy = (from_id: string, to_id: string): Omit<WorldLink, "id"> => ({
  from_id, to_id, kind: "identity", validFrom: null, validUntil: null, metadata: null,
});
/** The link the address book opens at sync time `at`. */
const opened = (from_id: string, to_id: string, at: string): AddLinkParams => ({
  from_id, to_id, kind: "identity", metadata: { producer: "addressbook" }, validFrom: at, validUntil: null,
});
const periodsOf = (world: World, from_id: string, to_id: string): { validFrom: string | null; validUntil: string | null }[] =>
  world.links
    .filter((link) => link.from_id === from_id && link.to_id === to_id)
    .map(({ validFrom, validUntil }) => ({ validFrom, validUntil }));

const env = (over: Partial<SourceEnvelope>): SourceEnvelope =>
  sourceEnvelope("addressbook", {}, { source_id: "google", account_id: "acct-1", user_id: "u1", remote_id: "gpeople:abc123", timestamp: "2026-03-14T09:00:00Z", ...over });

// A Google connector `Contact` payload (sources/google/src/surfaces/addressbook/contacts.ts).
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
/** A card listing exactly these addresses. */
const card = (remoteId: string, addresses: string[]): SourceEnvelope =>
  env({ remote_id: remoteId, payload: contactPayload({ id: remoteId, emails: addresses.map((value) => ({ address: value })) }) });

const cardOf = (frag: GraphBatchInput, key: string): BatchEntityInput => {
  const e = frag.entities.find((e) => e.key === key);
  if (e === undefined) throw new Error(`cardOf: no entity with key ${key}`);
  return e;
};

function lastBatch(graph: MockGraph): GraphBatchInput {
  const calls = graph.spies.apply_batch?.mock.calls ?? [];
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("lastBatch: apply_batch never called");
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
    expect(world.graph.spies.list_links_for_entity?.mock.calls.every((call) => call[1] === "identity")).toBe(true);
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
      schema_id: "email.address",
      anchor: "email:address:mikhail@example.com",
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
    expect(batch.entities).toContainEqual(expect.objectContaining({ anchor: "email:address:new@example.com", syncEnabled: false }));
    expect(batch.entities).not.toContainEqual(expect.objectContaining({ anchor: "email:address:old@example.com" }));
    expect(batch.refs).toEqual([{ key: "addr:old@example.com", anchor: "email:address:old@example.com" }]);
    expect(world.nodes.get("addr-old@example.com")?.syncEnabled).toBe(false);
  });

  it("one envelope → ONE card node: anchored, dictionary as last synced, zero person writes in the batch", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.graph.spies.apply_batch).toHaveBeenCalledTimes(1);
    const frag = lastBatch(world.graph);
    expect(frag.entities.map((e) => e.schema_id)).toEqual(["email.address", "addressbook.card"]);

    const stored = cardOf(frag, "gpeople:abc123");
    expect(stored.anchor).toBe("gpeople:abc123");
    expect(stored.name).toBe("Mikhail Lazarev");
    const props = stored.properties ?? {};
    expect(props.given_name).toBe("Mikhail");
    expect(props.family_name).toBe("Lazarev");
    expect(props.photo_url).toBe("https://photos.example.com/a.jpg");
    expect(Array.isArray(props.emails)).toBe(true);
    expect(Array.isArray(props.phones)).toBe(true);
  });

  it("no person anywhere → one person (name vouch) + identity links to the card and the address", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([{ schema_id: "contacts.person", name: "Mikhail Lazarev" }]);
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
    await mountWorld(world).ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

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
    expect(world.links.filter((link) => link.to_id === "addr-cat@example.com")).toEqual([]);
  });

  // The legacy-fleet probe retired with the archive it read: a pre-anchor hub
  // was recognised by the hashed key sitting in its frozen rows, and those
  // rows are gone. Such a hub is now invisible to ingest, so a fresh one is
  // minted — the documented consequence of dropping the archive
  // (docs/plans/facet-removal.md).
  it("a pre-anchor hub is no longer recognised — ingest mints a fresh one", async () => {
    const world = addressBookWorld({ nodes: [person("old-hub", "Old")] });
    await mountWorld(world).ingest({
      envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload({ emails: [] }) })],
    });

    expect(world.minted).toEqual([{ schema_id: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.added).toEqual([opened("hub-0", "id-gpeople:abc123", T0)]);
  });

  it("re-sync: the card already has its person and the person its address → zero new links, zero new persons", async () => {
    const world = addressBookWorld({
      nodes: [
        person("hub-X"), address("mikhail@example.com"),
        { id: "id-gpeople:abc123", schema_id: "addressbook.card", name: "Mikhail Lazarev", anchor: "gpeople:abc123", properties: {} },
      ],
      links: [heldBy("hub-X", "id-gpeople:abc123"), heldBy("hub-X", "addr-mikhail@example.com")],
    });
    await mountWorld(world).ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.added).toEqual([]);
  });

  it("two envelopes for the same resourceName fold to one card (no dup)", async () => {
    const world = addressBookWorld();
    await mountWorld(world).ingest({
      envelopes: [
        env({ remote_id: "gpeople:abc123", payload: contactPayload() }),
        env({ remote_id: "gpeople:abc123", payload: contactPayload({ display_name: "Mikhail L." }) }),
      ],
    });
    const frag = lastBatch(world.graph);
    expect(frag.entities.filter((entity) => entity.schema_id === "addressbook.card")).toHaveLength(1);
  });

  it("empty envelopes → no apply_batch", async () => {
    const world = addressBookWorld();
    const r = await mountWorld(world).ingest({ envelopes: [] });
    expect(world.graph.spies.apply_batch).toHaveBeenCalledTimes(0);
    expect(r).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
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
    const list = env({ remote_id: "list", payload: { entity_type: "list", total_people: 3 } });
    const first = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [list, env({ payload: contactPayload() })] });
    expect(first).toEqual({ dropped_remote_ids: [], trigger_checks: [], plan: { "addressbook.card": { total: 3, skipped: 0 } } });
    expect(lastBatch(world.graph).entities.map((item) => item.key)).not.toContain("list");
    const later = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [env({ remote_id: "list", payload: { entity_type: "list", skipped: 1 } }), env({ remote_id: "gpeople:c2", payload: contactPayload({ id: "c2" }) })] });
    expect(later.plan).toEqual({ "addressbook.card": { total: 0, skipped: 1 } });
    const outside = await mod.ingest({ envelopes: [list] });
    expect(outside).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
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
  it("archives the anchored card on a People deletion and leaves its person untouched", async () => {
    const world = addressBookWorld();
    const mod = mountWorld(world);
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ payload: contactPayload() })] });
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete", remote_id: "gpeople:abc123" })] });
    expect(world.graph.spies.delete_entity).toHaveBeenCalledExactlyOnceWith("id-gpeople:abc123");
    expect(world.nodes.get("id-gpeople:abc123")?.archived).toBe(true);
    expect(world.nodes.get("hub-0")?.archived).toBe(false);
    expect(world.minted).toHaveLength(1);
  });

  it("reconciles only unseen Google cards after a complete pass", async () => {
    const stored = (id: string, account_id: string, sync_pass: string): Omit<WorldNode, "archived"> => ({
      id, schema_id: "addressbook.card", name: id, anchor: `gpeople:${id}`, properties: { source_id: "google", account_id, sync_pass },
    });
    const world = addressBookWorld({
      nodes: [stored("old", "acct-1", "initial:r:1"), stored("seen", "acct-1", "initial:r:2"), stored("other", "acct-2", "initial:r:1")],
    });
    const mod = mountWorld(world);
    expect(await mod.onSyncComplete({ source_id: "google", account_id: "acct-1", generation: "initial:r:2" })).toEqual({
      departed: [], plan: { "addressbook.card": { total: 0, skipped: 0 } },
    });
    expect(world.graph.spies.delete_entity).toHaveBeenCalledExactlyOnceWith("old");
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
    expect(world.graph.spies.delete_entity).toHaveBeenCalledExactlyOnceWith("id-gpeople:abc123");
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
    expect(world.graph.spies.end_link).toHaveBeenCalledTimes(1);
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
    await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete", remote_id: "gpeople:c1" })] });
    expect(world.nodes.get("id-gpeople:c1")?.archived).toBe(true);
    expect(periodsOf(world, "hub-0", "addr-ann@example.com")).toEqual([{ validFrom: T0, validUntil: T1 }]);
    expect(periodsOf(world, "hub-0", "addr-bob@example.com")).toEqual([{ validFrom: T0, validUntil: null }]);
    expect(periodsOf(world, "hub-0", "id-gpeople:c1")).toEqual([{ validFrom: T0, validUntil: null }]);

    // The other way a contact leaves: a full pass that never saw it.
    vi.setSystemTime(new Date(T2));
    await mod.onSyncComplete({ source_id: "google", account_id: "acct-1", generation: "initial:r:2" });
    expect(world.nodes.get("id-gpeople:c2")?.archived).toBe(true);
    expect(periodsOf(world, "hub-0", "addr-bob@example.com")).toEqual([{ validFrom: T0, validUntil: T2 }]);
    expect(world.graph.spies.delete_entity?.mock.calls).toEqual([["id-gpeople:c1"], ["id-gpeople:c2"]]);
    expect(world.nodes.get("hub-0")?.archived).toBe(false);
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
    expect(world.graph.spies.end_link).toHaveBeenCalledTimes(1);
    expect(world.added).toEqual([
      opened("hub-0", "id-gpeople:c1", T0),
      opened("hub-0", "addr-ann@example.com", T0),
      opened("hub-0", "addr-ann@example.com", T2),
    ]);
    expect(world.minted).toHaveLength(1);
  });
});
