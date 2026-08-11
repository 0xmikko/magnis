// Contacts sync ingest (@syncHandler "contacts") — S3, the replica model
// (plan §5): a page of Google contacts folds into ONE apply_batch of
// contacts.google_contact REPLICA nodes (anchored by remote_id, dictionary =
// fields as last synced, zero records, zero hub entities), the addresses are
// minted by their owner over email.ensure_addresses, and auto-attach then
// wires identity edges — attach to the one hub sharing an address, mint a
// hub when none exists, or mint + record same_as candidates when several
// claim the address. The sync NEVER writes the hub.

import { beforeEach, describe, expect, it } from "vitest";
import type { BatchEntityInput, GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
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

// The ingest-path world: apply_batch echoes each key → a deterministic id;
// links/entity reads feed auto-attach (default: empty world → every replica
// mints a hub); add_link records the identity edges; create_entity records
// hub mints. rpcCalls records the ensure_addresses hand-off.
interface World {
  graph: G;
  rpcCalls: { method: string; params: unknown }[];
  links: { from_id: string; to_id: string; kind: string; status?: string }[];
  minted: { schema_id: string; name: string }[];
  /** identity edges pre-existing in the world: entity id → its links. */
  linksFor?: Record<string, { from_id: string; to_id: string; kind: string }[]>;
  entities?: Record<string, { id: string; schema_id: string; name?: string }>;
  externalIds?: Record<string, string>;
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
    apply_batch: (frag: GraphBatchInput) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e: BatchEntityInput) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: frag.links?.length ?? 0,
        dropped_keys: [],
      }),
    list_links_for_entity: (id: string) => Promise.resolve(world.linksFor?.[id] ?? []),
    get_entities: (ids: string[]) =>
      Promise.resolve(
        ids
          .map((id) => world.entities?.[id])
          .filter((e): e is NonNullable<typeof e> => e !== undefined),
      ),
    get_entity: (id: string) => Promise.resolve(world.entities?.[id] ?? null),
    create_entity: (input: { schema_id: string; name: string }) => {
      world.minted.push({ schema_id: input.schema_id, name: input.name });
      return Promise.resolve({ id: `hub-${mintSeq++}`, schema_id: input.schema_id, name: input.name });
    },
    add_link: (p: { from_id: string; to_id: string; kind: string; status?: string }) => {
      world.links.push(p);
      return Promise.resolve();
    },
    list_entities: () => Promise.resolve({ items: [], total: 0 }),
  } as never);
  return world;
}

function mountWorld(world: World): ContactsModule {
  return mountModule(ContactsModule, {
    graph: world.graph,
    ctx: { extension_id: "contacts" },
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

const personOf = (frag: GraphBatchInput, key: string): BatchEntityInput => {
  const e = frag.entities.find((e) => e.key === key);
  if (e === undefined) throw new Error(`personOf: no entity with key ${key}`);
  return e;
};

function lastBatch(graph: G): GraphBatchInput {
  const calls = spy(graph, "apply_batch").mock.calls;
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("lastBatch: apply_batch never called");
  return last[0] as GraphBatchInput;
}

describe("contacts ingest — the replica model (tst_be_contactsingest_001)", () => {
  it("one envelope → ONE replica node: anchored, dictionary as last synced, zero facets, zero hub writes in the batch", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.graph.spies.apply_batch).toHaveBeenCalledTimes(1);
    const frag = lastBatch(world.graph);
    expect(frag.entities.map((e) => e.schema_id)).toEqual(["contacts.google_contact"]);

    const replica = personOf(frag, "gpeople:abc123");
    expect(replica.anchor).toBe("gpeople:abc123");
    expect(replica.name).toBe("Mikhail Lazarev");
    const props = replica.properties ?? {};
    expect(props.given_name).toBe("Mikhail");
    expect(props.family_name).toBe("Lazarev");
    expect(props.photo_url).toBe("https://photos.example.com/a.jpg");
    expect(Array.isArray(props.emails)).toBe(true);
    expect(Array.isArray(props.phones)).toBe(true);

    // The address owner minted; contacts only asked.
    expect(world.rpcCalls.map((c) => c.method)).toEqual(["email.ensure_addresses"]);
  });

  it("no hub anywhere → mint (name vouch) + identity edges to replica and address", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([{ schema_id: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.links).toEqual([
      { from_id: "hub-0", to_id: "id-gpeople:abc123", kind: "identity", declared_by: "gpeople:abc123" },
      { from_id: "hub-0", to_id: "addr-mikhail@example.com", kind: "identity", declared_by: "gpeople:abc123" },
    ]);
  });

  it("exactly one hub holds identity to a shared address → attach, no mint", async () => {
    const world = ingestWorld({
      linksFor: {
        "addr-mikhail@example.com": [
          { from_id: "hub-X", to_id: "addr-mikhail@example.com", kind: "identity" },
        ],
      },
      entities: { "hub-X": { id: "hub-X", schema_id: "contacts.person", name: "Mika" } },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.links).toEqual([
      { from_id: "hub-X", to_id: "id-gpeople:abc123", kind: "identity", declared_by: "gpeople:abc123" },
      {
        from_id: "hub-X",
        to_id: "addr-mikhail@example.com",
        kind: "identity",
        declared_by: "gpeople:abc123",
      },
    ]);
  });

  it("several hubs claim the address → mint a separate hub + same_as merge-candidates", async () => {
    const world = ingestWorld({
      linksFor: {
        "addr-mikhail@example.com": [
          { from_id: "hub-A", to_id: "addr-mikhail@example.com", kind: "identity" },
          { from_id: "hub-B", to_id: "addr-mikhail@example.com", kind: "identity" },
        ],
      },
      entities: {
        "hub-A": { id: "hub-A", schema_id: "contacts.person" },
        "hub-B": { id: "hub-B", schema_id: "contacts.person" },
      },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toHaveLength(1);
    const candidates = world.links.filter((l) => l.kind === "same_as");
    expect(candidates.map((l) => l.to_id).sort()).toEqual(["hub-A", "hub-B"]);
    expect(candidates.every((l) => l.status === "candidate")).toBe(true);
  });

  // The legacy-fleet probe retired with the archive it read: a pre-anchor hub
  // was recognised by the hashed key sitting in its frozen rows, and those
  // rows are gone. Such a hub is now invisible to ingest, so a fresh one is
  // minted — the documented consequence of dropping the archive
  // (docs/plans/facet-removal.md).
  it("a pre-anchor hub is no longer recognised — ingest mints a fresh one", async () => {
    const world = ingestWorld({
      externalIds: { "gpeople:abc123": "old-hub" },
      entities: { "old-hub": { id: "old-hub", schema_id: "contacts.person", name: "Old" } },
    });
    const mod = mountWorld(world);
    await mod.ingest({
      envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload({ emails: [] }) })],
    });

    expect(world.minted).toEqual([{ schema_id: "contacts.person", name: "Mikhail Lazarev" }]);
    expect(world.links).toEqual([
      { from_id: "hub-0", to_id: "id-gpeople:abc123", kind: "identity", declared_by: "gpeople:abc123" },
    ]);
  });

  it("re-sync: the replica already has its hub → zero new edges, zero mints", async () => {
    const world = ingestWorld({
      linksFor: {
        "id-gpeople:abc123": [
          { from_id: "hub-X", to_id: "id-gpeople:abc123", kind: "identity" },
        ],
      },
    });
    const mod = mountWorld(world);
    await mod.ingest({ envelopes: [env({ remote_id: "gpeople:abc123", payload: contactPayload() })] });

    expect(world.minted).toEqual([]);
    expect(world.links).toEqual([]);
  });

  it("two envelopes for the same resourceName fold to one replica (no dup)", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    await mod.ingest({
      envelopes: [
        env({ remote_id: "gpeople:abc123", payload: contactPayload() }),
        env({ remote_id: "gpeople:abc123", payload: contactPayload({ display_name: "Mikhail L." }) }),
      ],
    });
    const frag = lastBatch(world.graph);
    expect(frag.entities).toHaveLength(1);
  });

  it("empty envelopes → no apply_batch", async () => {
    const world = ingestWorld();
    const mod = mountWorld(world);
    const r = await mod.ingest({ envelopes: [] });
    expect(world.graph.spies.apply_batch).toHaveBeenCalledTimes(0);
    expect(r.ok).toBe(true);
  });
});

