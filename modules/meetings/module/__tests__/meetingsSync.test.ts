// Meetings sync ingest (@syncHandler) + control (@rpc sync.status /
// sync.reset). Exercises the module through @magnis/testkit/module (mockGraph +
// mountModule + a test RpcExecutor). Asserts: snapshot/live upsert via
// applyBatch (keyed on the remote id as external id, attendees as `attendee` edges over
// refs), the full live trigger.check payload with attendee email.address ids
// resolved through email.ensure_addresses, delete, empty-user hard error,
// and the syncState control surface.

/**
 * @test-id: tst_module_meetings_sync_001
 * @scenario: scn_backend_tests_006
 * @covers: MeetingsModule.ingest, MeetingsModule.syncStatus, MeetingsModule.syncReset
 * @legacy-id: tst_int_mtsync_002_meetings_snapshot_ingest_becomes_visible_via_rpc
 * @legacy-id: tst_int_mtsync_003_meetings_get_returns_synced_detail_view
 * @legacy-id: tst_int_mtsync_004_meetings_repeated_envelopes_converge_on_updated_payload
 * @legacy-id: tst_int_mtsync_005_meetings_delete_envelope_removes_synced_entity
 * @deterministic: yes
 */

import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, GraphBatchResult, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { entityId, entityRead, entityExtras, entity, link, mockGraph, mountModule, page, sourceEnvelope, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph({
    moduleSettings: () => Promise.resolve({ newSenderSyncEnabled: "true" }),
    applyBatch: (frag: GraphBatchInput): Promise<GraphBatchResult> =>
      Promise.resolve({
        ids: Object.fromEntries([...frag.entities, ...frag.refs].map((e) => [e.key, entityId(`id-${e.key}`)])),
        created: frag.entities.length,
        updated: 0,
        linksAdded: 0,
        droppedKeys: [], resolved: [],
      }),
    findByExternalId: (_id: string): Promise<string | null> => Promise.resolve(null),
    getEntity: (_id: string) => Promise.resolve(entity("m-del", "", { schemaId: CAL, properties: { source_id: "google", account_id: "acct-1" } })),
    findByExternalIds: (externalIds: string[]): Promise<(string | null)[]> => Promise.resolve(externalIds.map(() => null)),
    // The upsert reconciles the event's attendee edges against the invite's
    // CURRENT list — one edge read per upserted event.
    listLinksForEntity: (): Promise<never[]> => Promise.resolve([]),
    deleteEntity: (_id: string): Promise<void> => Promise.resolve(undefined),
    syncState: (): Promise<Record<string, unknown>> => Promise.resolve({ ok: true }),
    ...over,
  } as unknown as GraphOverrides);
}

function makeModule(
  graph: G,
  execute = vi.fn(async (_m: string, p?: unknown) => ({
    ids: (p as { items: { address: string }[] }).items.map((i) => `addr-${i.address}`),
  })),
): { mod: MeetingsModule; execute: ReturnType<typeof vi.fn> } {
  const mod = mountModule(MeetingsModule, {
    graph,
    ctx: { extensionId: "meetings" },
    rpc: { execute },
  }).module;
  return { mod, execute };
}

const env = (over: Partial<SyncEnvelope>): SyncEnvelope =>
  sourceEnvelope("meetings", {}, { sourceId: "google", accountId: "acct-1", userId: "u1", remoteId: "r1", timestamp: "2026-02-01T00:00:00Z", ...over });

describe("meetings @syncHandler — upsert", () => {
  it("upserts a snapshot via applyBatch keyed on its external id, no trigger", async () => {
    const applyBatch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, entityId(`id-${e.key}`)])),
      created: 1,
      updated: 0,
      linksAdded: 0,
      droppedKeys: [], resolved: [],
    }));
    const { mod } = makeModule(makeGraph({ applyBatch }));

    const payload = { title: "Past meeting", starts_at: "2026-01-01T09:00:00Z" };
    const res = await mod.ingest({ envelopes: [env({ kind: "snapshot", remoteId: "r2", payload })] });

    expect(applyBatch).toHaveBeenCalledTimes(1);
    const frag = applyBatch.mock.calls[0]![0];
    expect(frag.entities).toEqual([
      {
        key: "r2",
        schemaId: CAL,
        name: "Past meeting",
        idx: null,
        date: null,
        externalId: "r2",
        properties: { ...payload, source_id: "google", account_id: "acct-1" },
      },
    ]);
    expect(frag.links).toEqual([]);
    expect(res).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });
});

describe("meetings @syncHandler — live envelopes emit a trigger.check", () => {
  /**
   * @test-id: tst_module_meetings_sync_002
   * @scenario: scn_google_pull_001
   * @covers: MeetingsModule.ingest
   * @deterministic: yes
   * @fixtures: one Google meeting with an attendee; sync RPC is forbidden
   */
  it("tst_module_meetings_sync_002 writes attendee addresses without cross-module RPC in sync", async () => {
    const graph = makeGraph();
    const execute = vi.fn(() => Promise.reject(new Error("op_plugin_rpc_call forbidden in sync")));
    const { mod } = makeModule(graph, execute);
    await expect(mod.ingest({ envelopes: [env({ payload: {
      title: "Standup", starts_at: "2026-07-28T09:00:00Z", attendees: [{ email: "a@x" }],
    } })] })).resolves.toBeDefined();
    expect(execute).not.toHaveBeenCalled();
    expect(graph.spies.applyBatch?.mock.calls[0]?.[0].entities).toContainEqual(expect.objectContaining({
      schemaId: "email.address",
      externalId: "email:address:a@x",
    }));
  });

  it("ensures attendee addresses via email.ensure_address and returns the full payload", async () => {
    const applyBatch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((entity) => [
        entity.key,
        entity.key === "r5" ? "m-r5" : `addr-${entity.key.slice("addr:".length)}`,
      ])),
      created: 1,
      updated: 0,
      linksAdded: 0,
      droppedKeys: [], resolved: [],
    }));
    const { mod, execute } = makeModule(makeGraph({ applyBatch }));

    const payload: JsonObject = {
      title: "Standup",
      starts_at: "2026-07-28T09:00:00Z",
      attendees: [{ name: "Alice", email: "a@x" }, { email: "b@x" }],
    };
    const res = await mod.ingest({
      envelopes: [env({ kind: "live", remoteId: "r5", payload })],
    });

    expect(execute).not.toHaveBeenCalled();
    // The attendees are EDGES to the shared address nodes, and the invite's
    // per-event display name rides the edge dictionary.
    const frag = applyBatch.mock.calls[0]![0] as GraphBatchInput;
    expect(frag.entities[0]?.properties).toEqual({
      title: "Standup",
      starts_at: "2026-07-28T09:00:00Z",
      source_id: "google",
      account_id: "acct-1",
    });
    expect(frag.refs).toEqual([]);
    expect(frag.entities.slice(1).map((item) => item.externalId)).toEqual([
      "email:address:a@x", "email:address:b@x",
    ]);
    // declaredBy names the EMITTING batch item — the host resolves the edge
    // stamp's observed_at through it on the sync dispatch.
    expect(frag.links).toEqual([
      {
        fromKey: "r5",
        toKey: "addr:a@x",
        kind: "meetings.attendee",
        confidence: null,
        metadata: { display_name: "Alice" },
        declaredBy: "r5",
        validFrom: null,
        validUntil: null,
      },
      {
        fromKey: "r5",
        toKey: "addr:b@x",
        kind: "meetings.attendee",
        confidence: null,
        metadata: null,
        declaredBy: "r5",
        validFrom: null,
        validUntil: null,
      },
    ]);
    expect(res.triggerChecks).toEqual([
      {
        type: "trigger.check",
        eventKind: "new_meeting",
        schemaId: "meetings.meeting",
        entityId: "m-r5",
        phase: "live",
        touchedEntityIds: ["m-r5", "addr-a@x", "addr-b@x"],
        userId: "u1",
        // INV-10: the engine fails closed without the event's own time, so
        // every trigger.check emitter must carry it — meetings included, or the
        // whole module's triggers go silent.
        context: { title: "Standup", remote_id: "r5", occurred_at: "2026-07-28T09:00:00Z" },
      },
    ]);
  });
});

describe("meetings @syncHandler — attendee edge reconcile", () => {
  it("an attendee the provider no longer reports loses its edge; others survive", async () => {
    const deleteLink = vi.fn((_id: string) => Promise.resolve(undefined));
    // The event already carries edges from an EARLIER invite revision: a
    // now-removed guest, the still-current guest, a non-attendee edge, and an
    // inbound edge that merely points AT the event.
    const listLinksForEntity = vi.fn(() =>
      Promise.resolve([
        link("id-r6", "addr-old@x", "meetings.attendee", { id: "l-stale" }),
        link("id-r6", "id-addr:ann@x", "meetings.attendee", { id: "l-keep" }),
        link("id-r6", "proj-1", "created_by", { id: "l-proj" }),
        link("other", "id-r6", "meetings.attendee", { id: "l-inbound" }),
      ]),
    );
    const { mod } = makeModule(
      makeGraph({ deleteLink, listLinksForEntity } as Record<string, unknown>),
    );
    await mod.ingest({
      envelopes: [
        env({
          remoteId: "r6",
          payload: { title: "Sync", starts_at: "2026-07-29T09:00:00Z", attendees: [{ email: "ann@x" }] },
        }),
      ],
    });
    // Only the ex-guest's OUTBOUND attendee edge goes — wholesale-replace
    // semantics the earlier design gave for free, now explicit.
    expect(deleteLink.mock.calls.map((c) => c[0])).toEqual(["l-stale"]);
  });
});

describe("meetings @syncHandler — delete", () => {
  it("deletes an existing meeting by its external id", async () => {
    const findByExternalId = vi.fn().mockResolvedValue("m-del");
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ findByExternalId, deleteEntity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remoteId: "rdel" })] });

    expect(findByExternalId).toHaveBeenCalledWith("rdel");
    expect(deleteEntity).toHaveBeenCalledWith("m-del");
    expect(res.droppedRemoteIds).toEqual([]);
  });

  it("is a no-op (not an error, not dropped) for an unknown delete id", async () => {
    const findByExternalId = vi.fn().mockResolvedValue(null);
    const deleteEntity = vi.fn();
    const { mod } = makeModule(makeGraph({ findByExternalId, deleteEntity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remoteId: "ghost" })] });

    expect(deleteEntity).not.toHaveBeenCalled();
    expect(res).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });
});

/**
 * @test-id: tst_module_google_001
 * @scenario: scn_google_pull_002
 * @covers: MeetingsModule.ingest, MeetingsModule.onSyncComplete
 * @deterministic: yes
 * @fixtures: two Google accounts, an unrelated source and a curated meeting
 */
describe("completed Calendar replacement pass", () => {
  it("removes only unseen replicas owned by this Source/account after completion", async () => {
    const stale = entity("old", "", { schemaId: CAL, properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:1" } });
    const seen = entity("seen", "", { schemaId: CAL, properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:2" } });
    const otherAccount = entity("other", "", { schemaId: CAL, properties: { source_id: "google", account_id: "acct-2", sync_pass: "initial:r:1" } });
    const curated = entity("curated", "", { schemaId: CAL, properties: { account_id: "acct-1" } });
    const listEntitiesByPropertyField = vi.fn().mockResolvedValue(page([stale, seen, otherAccount, curated]));
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ listEntitiesByPropertyField, deleteEntity }));

    expect(deleteEntity).not.toHaveBeenCalled(); // an interrupted pass has no completion hook
    expect(await mod.onSyncComplete({ userId: "u1", sourceId: "google", accountId: "acct-1", identityKey: null, generation: "initial:r:2" })).toEqual({
      departed: [], plan: { [CAL]: { total: 0, skipped: 0 } },
    });
    expect(listEntitiesByPropertyField).toHaveBeenCalledWith({ entitySchema: CAL, key: "account_id", value: "acct-1", limit: 500, offset: 0 });
    expect(deleteEntity).toHaveBeenCalledTimes(1);
    expect(deleteEntity).toHaveBeenCalledWith(entityId("old"));
  });
});

/**
 * @test-id: tst_module_meetings_plan_001
 * @scenario: scn_google_sync_001
 * @covers: MeetingsModule.ingest (plan)
 * @deterministic: yes
 * @fixtures: terminal full Calendar count and a later catch-up page
 */
describe("meetings @syncHandler — the plan from the pages", () => {
  it("states the completed full Calendar count once and nothing outside a worker's pass", async () => {
    const applyBatch = vi.fn().mockResolvedValue({ ids: { r1: "id-r1" }, created: 1, updated: 0, linksAdded: 0, droppedKeys: [], resolved: [] });
    const { mod } = makeModule(makeGraph({ applyBatch }));
    const calendar = env({ remoteId: "calendar", payload: { entity_type: "calendar", events_total: 3 } });
    const first = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [calendar, env({ payload: { title: "Standup", start_at: "2026-02-01T10:00:00Z", end_at: "2026-02-01T10:15:00Z" } })] });
    expect(first).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: { "meetings.calendar_event": { total: 3, skipped: 0 } }, excluded: [] });
    expect(applyBatch).toHaveBeenCalledTimes(1);
    expect((applyBatch.mock.calls[0]?.[0] as GraphBatchInput).entities.map((item) => item.key)).not.toContain("calendar");
    const later = await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ remoteId: "calendar", payload: { entity_type: "calendar", events_total: 3 } })] });
    expect(later.plan).toEqual({ "meetings.calendar_event": { total: 0, skipped: 0 } });
    const outside = await mod.ingest({ envelopes: [calendar] });
    expect(outside).toEqual({ droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] });
  });
});

/**
 * @test-id: tst_module_google_004
 * @scenario: scn_google_pull_004
 * @covers: MeetingsModule.ingest (incremental plan)
 * @deterministic: yes
 * @fixtures: one new event, its replay and deletion during token-based Poll
 */
describe("Calendar Poll progress", () => {
  it("counts only a Graph create and a real deletion, not a replay", async () => {
    const findByExternalIds = vi.fn().mockResolvedValueOnce([null]).mockResolvedValueOnce(["id-r1"]);
    const findByExternalId = vi.fn().mockResolvedValueOnce("id-r1").mockResolvedValueOnce(null);
    const getEntity = vi.fn().mockResolvedValue(entity("id-r1", "", { schemaId: CAL, properties: { source_id: "google", account_id: "acct-1" } }));
    const deleteEntity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ findByExternalIds, findByExternalId, getEntity, deleteEntity }));
    const event = env({ payload: { title: "New event", starts_at: "2026-02-01T10:00:00Z" } });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [event] })).plan?.[CAL]).toEqual({ total: 1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [event] })).plan?.[CAL]).toEqual({ total: 0, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.[CAL]).toEqual({ total: -1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.[CAL]).toEqual({ total: 0, skipped: 0 });
    expect(deleteEntity).toHaveBeenCalledExactlyOnceWith("id-r1");
  });
});

describe("meetings @syncHandler — empty userId is a hard error", () => {
  it("throws and writes nothing", async () => {
    const applyBatch = vi.fn();
    const { mod } = makeModule(makeGraph({ applyBatch }));
    await expect(
      mod.ingest({ envelopes: [env({ kind: "live", remoteId: "r9", userId: "" })] }),
    ).rejects.toThrow(/userId/);
    expect(applyBatch).not.toHaveBeenCalled();
  });
});

describe("meetings sync control (@rpc)", () => {
  it("sync.status reads syncState('status')", async () => {
    const syncState = vi.fn().mockResolvedValue({ states: [] });
    const { mod } = makeModule(makeGraph({ syncState }));
    await mod.syncStatus();
    expect(syncState).toHaveBeenCalledWith("status");
  });

  it("sync.reset resets only the meetings.calendar_event namespace", async () => {
    const syncState = vi.fn().mockResolvedValue({ ok: true });
    const { mod } = makeModule(makeGraph({ syncState }));
    await mod.syncReset();
    expect(syncState).toHaveBeenCalledWith("reset", CAL);
  });
});

/**
 * @test-id: tst_module_meetings_trigger_001
 * @scenario: scn_demo_trigger_002
 * @covers: modules/meetings/module/service.ts::MeetingsModule.ingest
 * @deterministic: yes
 *
 * @invariant INV-10 — a meeting without a start time yields `occurred_at: null`,
 * which the engine treats as fail-closed. The producing side must be explicit
 * about that rather than omitting the key, or the contract is undetectable.
 */
describe("meetings trigger.check carries the event's own time", () => {
  it("tst_module_meetings_trigger_001 a meeting with no start yields a null occurred_at", async () => {
    const { mod } = makeModule(makeGraph());

    const res = await mod.ingest({
      envelopes: [env({ kind: "live", remoteId: "r9", payload: { title: "No start" } })],
    });

    expect(res.triggerChecks[0]?.context).toHaveProperty("occurred_at", null);
  });
});

/**
 * @test-id: tst_module_meetings_email_sync_001
 * @scenario: scn_google_sync_001
 * @covers: MeetingsModule.ingest
 * @deterministic: yes
 * @fixtures: an existing stopped attendee and a new address with owner default false
 */
it("tst_module_meetings_email_sync_001 reuses existing addresses and reads the owner's creation rule without RPC", async () => {
  const graph = makeGraph({
    findByExternalIds: (externalIds: string[]) => Promise.resolve(externalIds.map((externalId) => externalId === "email:address:old@example.com" ? "old-address" : null)),
    moduleSettings: (schema: string) => {
      expect(schema).toBe("email.address");
      return Promise.resolve({ newSenderSyncEnabled: "false" });
    },
  });
  const { mod, execute } = makeModule(graph);
  await mod.ingest({ envelopes: [env({ payload: { title: "Meeting", attendees: [{ email: "old@example.com" }, { email: "new@example.com" }] } })] });
  expect(graph.spies.applyBatch).toHaveBeenCalledWith(expect.objectContaining({
    entities: expect.arrayContaining([expect.objectContaining({ externalId: "email:address:new@example.com", syncEnabled: false })]),
    refs: [{ key: "addr:old@example.com", externalId: "email:address:old@example.com" }],
  }));
  expect(execute).not.toHaveBeenCalled();
});
