// Meetings sync ingest (@syncHandler) + control (@rpc sync.status /
// sync.reset). Exercises the module through @magnis/testkit/module (mockGraph +
// mountModule + a test RpcExecutor). Asserts: snapshot/live upsert via
// apply_batch (anchored on the remote id, attendees as `attendee` edges over
// refs), the full live trigger.check payload with attendee email.address ids
// resolved through email.ensure_addresses, delete, empty-user hard error,
// and the sync_state control surface.

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
import type { GraphBatchInput, GraphBatchResult } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical, SyncEnvelope } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph({
    apply_batch: (frag: GraphBatchInput): Promise<GraphBatchResult> =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
    find_by_anchor: (_id: string): Promise<string | null> => Promise.resolve(null),
    get_entity: (_id: string) => Promise.resolve({ id: "m-del", schema_id: CAL, properties: { source_id: "google", account_id: "acct-1" } }),
    find_by_anchors: (anchors: string[]): Promise<(string | null)[]> => Promise.resolve(anchors.map(() => null)),
    // The upsert reconciles the event's attendee edges against the invite's
    // CURRENT list — one edge read per upserted event.
    list_links_for_entity: (): Promise<never[]> => Promise.resolve([]),
    delete_entity: (_id: string): Promise<void> => Promise.resolve(undefined),
    sync_state: (): Promise<Record<string, unknown>> => Promise.resolve({ ok: true }),
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
    ctx: { extension_id: "meetings" },
    rpc: { execute },
  }).module;
  return { mod, execute };
}

const env = (over: Partial<SyncEnvelope>): SyncEnvelope => ({
  source_id: "google",
  surface: "meetings",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
  remote_id: "r1",
  payload: {},
  timestamp: "2026-02-01T00:00:00Z",
  ...over,
});

describe("meetings @syncHandler — upsert", () => {
  it("upserts a snapshot via apply_batch keyed on its anchor, no trigger", async () => {
    const apply_batch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: 1,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }));
    const { mod } = makeModule(makeGraph({ apply_batch }));

    const payload = { title: "Past meeting", starts_at: "2026-01-01T09:00:00Z" };
    const res = await mod.ingest({ envelopes: [env({ kind: "snapshot", remote_id: "r2", payload })] });

    expect(apply_batch).toHaveBeenCalledTimes(1);
    const frag = apply_batch.mock.calls[0]![0];
    expect(frag.entities).toEqual([
      {
        key: "r2",
        schema_id: CAL,
        name: "Past meeting",
        anchor: "r2",
        properties: { ...payload, source_id: "google", account_id: "acct-1" },
        confidence: 90,
      },
    ]);
    expect(frag.links).toEqual([]);
    expect(res).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
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
    expect(graph.spies.apply_batch?.mock.calls[0]?.[0].entities).toContainEqual(expect.objectContaining({
      schema_id: "email.address",
      anchor: "email:address:a@x",
    }));
  });

  it("ensures attendee addresses via email.ensure_address and returns the full payload", async () => {
    const apply_batch = vi.fn(async (frag: GraphBatchInput) => ({
      ids: Object.fromEntries(frag.entities.map((entity) => [
        entity.key,
        entity.key === "r5" ? "m-r5" : `addr-${entity.key.slice("addr:".length)}`,
      ])),
      created: 1,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }));
    const { mod, execute } = makeModule(makeGraph({ apply_batch }));

    const payload = {
      title: "Standup",
      starts_at: "2026-07-28T09:00:00Z",
      attendees: [{ name: "Alice", email: "a@x" }, { email: "b@x" }],
    };
    const res = await mod.ingest({
      envelopes: [env({ kind: "live", remote_id: "r5", payload })],
    });

    expect(execute).not.toHaveBeenCalled();
    // The attendees are EDGES to the shared address nodes, and the invite's
    // per-event display name rides the edge dictionary.
    const frag = apply_batch.mock.calls[0]![0] as GraphBatchInput;
    expect(frag.entities[0]?.properties).toEqual({
      title: "Standup",
      starts_at: "2026-07-28T09:00:00Z",
      source_id: "google",
      account_id: "acct-1",
    });
    expect(frag.refs).toEqual([]);
    expect(frag.entities.slice(1).map((entity) => entity.anchor)).toEqual([
      "email:address:a@x", "email:address:b@x",
    ]);
    // declared_by names the EMITTING batch item — the host resolves the edge
    // stamp's observed_at through it on the sync dispatch.
    expect(frag.links).toEqual([
      {
        from_key: "r5",
        to_key: "addr:a@x",
        kind: "attendee",
        declared_by: "r5",
        metadata: { display_name: "Alice" },
      },
      { from_key: "r5", to_key: "addr:b@x", kind: "attendee", declared_by: "r5" },
    ]);
    expect(res.trigger_checks).toEqual([
      {
        type: "trigger.check",
        event_kind: "new_meeting",
        schema_id: "meetings.meeting",
        entity_id: "m-r5",
        phase: "live",
        touched_entity_ids: ["m-r5", "addr-a@x", "addr-b@x"],
        user_id: "u1",
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
    const delete_link = vi.fn((_id: string) => Promise.resolve(undefined));
    // The event already carries edges from an EARLIER invite revision: a
    // now-removed guest, the still-current guest, a non-attendee edge, and an
    // inbound edge that merely points AT the event.
    const list_links_for_entity = vi.fn(() =>
      Promise.resolve([
        { id: "l-stale", from_id: "id-r6", to_id: "addr-old@x", kind: "attendee" },
        { id: "l-keep", from_id: "id-r6", to_id: "id-addr:ann@x", kind: "attendee" },
        { id: "l-proj", from_id: "id-r6", to_id: "proj-1", kind: "created_by" },
        { id: "l-inbound", from_id: "other", to_id: "id-r6", kind: "attendee" },
      ]),
    );
    const { mod } = makeModule(
      makeGraph({ delete_link, list_links_for_entity } as Record<string, unknown>),
    );
    await mod.ingest({
      envelopes: [
        env({
          remote_id: "r6",
          payload: { title: "Sync", starts_at: "2026-07-29T09:00:00Z", attendees: [{ email: "ann@x" }] },
        }),
      ],
    });
    // Only the ex-guest's OUTBOUND attendee edge goes — wholesale-replace
    // semantics the earlier design gave for free, now explicit.
    expect(delete_link.mock.calls.map((c) => c[0])).toEqual(["l-stale"]);
  });
});

describe("meetings @syncHandler — delete", () => {
  it("deletes an existing meeting by its anchor", async () => {
    const find_by_anchor = vi.fn().mockResolvedValue("m-del");
    const delete_entity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ find_by_anchor, delete_entity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "rdel" })] });

    expect(find_by_anchor).toHaveBeenCalledWith("rdel");
    expect(delete_entity).toHaveBeenCalledWith("m-del");
    expect(res.dropped_remote_ids).toEqual([]);
  });

  it("is a no-op (not an error, not dropped) for an unknown delete id", async () => {
    const find_by_anchor = vi.fn().mockResolvedValue(null);
    const delete_entity = vi.fn();
    const { mod } = makeModule(makeGraph({ find_by_anchor, delete_entity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "ghost" })] });

    expect(delete_entity).not.toHaveBeenCalled();
    expect(res).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
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
    const stale = { id: "old", anchor: "gcal:old", schema_id: CAL, properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:1" } };
    const seen = { id: "seen", anchor: "gcal:seen", schema_id: CAL, properties: { source_id: "google", account_id: "acct-1", sync_pass: "initial:r:2" } };
    const otherAccount = { id: "other", anchor: "gcal:other", schema_id: CAL, properties: { source_id: "google", account_id: "acct-2", sync_pass: "initial:r:1" } };
    const curated = { id: "curated", anchor: "local:curated", schema_id: CAL, properties: { account_id: "acct-1" } };
    const list_entities_by_property_field = vi.fn().mockResolvedValue({ items: [stale, seen, otherAccount, curated], total: 4 });
    const delete_entity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ list_entities_by_property_field, delete_entity }));

    expect(delete_entity).not.toHaveBeenCalled(); // an interrupted pass has no completion hook
    expect(await mod.onSyncComplete({ source_id: "google", account_id: "acct-1", generation: "initial:r:2" })).toEqual({
      departed: [], plan: { [CAL]: { total: 0, skipped: 0 } },
    });
    expect(list_entities_by_property_field).toHaveBeenCalledWith({ entity_schema: CAL, key: "account_id", value: "acct-1", limit: 500, offset: 0 });
    expect(delete_entity).toHaveBeenCalledTimes(1);
    expect(delete_entity).toHaveBeenCalledWith("old");
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
    const apply_batch = vi.fn().mockResolvedValue({ ids: { r1: "id-r1" }, created: 1, updated: 0, links_added: 0, dropped_keys: [] });
    const { mod } = makeModule(makeGraph({ apply_batch }));
    const calendar = env({ remote_id: "calendar", payload: { entity_type: "calendar", events_total: 3 } });
    const first = await mod.ingest({ command: "bootstrap", generation: "initial:r:1", envelopes: [calendar, env({ payload: { title: "Standup", start_at: "2026-02-01T10:00:00Z", end_at: "2026-02-01T10:15:00Z" } })] });
    expect(first).toEqual({ dropped_remote_ids: [], trigger_checks: [], plan: { "meetings.calendar_event": { total: 3, skipped: 0 } } });
    expect(apply_batch).toHaveBeenCalledTimes(1);
    expect((apply_batch.mock.calls[0]?.[0] as GraphBatchInput).entities.map((item) => item.key)).not.toContain("calendar");
    const later = await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ remote_id: "calendar", payload: { entity_type: "calendar", events_total: 3 } })] });
    expect(later.plan).toEqual({ "meetings.calendar_event": { total: 0, skipped: 0 } });
    const outside = await mod.ingest({ envelopes: [calendar] });
    expect(outside).toEqual({ dropped_remote_ids: [], trigger_checks: [] });
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
    const find_by_anchors = vi.fn().mockResolvedValueOnce([null]).mockResolvedValueOnce(["id-r1"]);
    const find_by_anchor = vi.fn().mockResolvedValueOnce("id-r1").mockResolvedValueOnce(null);
    const get_entity = vi.fn().mockResolvedValue({ id: "id-r1", schema_id: CAL, properties: { source_id: "google", account_id: "acct-1" } });
    const delete_entity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ find_by_anchors, find_by_anchor, get_entity, delete_entity }));
    const event = env({ payload: { title: "New event", starts_at: "2026-02-01T10:00:00Z" } });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [event] })).plan?.[CAL]).toEqual({ total: 1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [event] })).plan?.[CAL]).toEqual({ total: 0, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.[CAL]).toEqual({ total: -1, skipped: 0 });
    expect((await mod.ingest({ command: "catch_up", generation: "initial:r:1", envelopes: [env({ kind: "delete" })] })).plan?.[CAL]).toEqual({ total: 0, skipped: 0 });
    expect(delete_entity).toHaveBeenCalledExactlyOnceWith("id-r1");
  });
});

describe("meetings @syncHandler — empty user_id is a hard error", () => {
  it("throws and writes nothing", async () => {
    const apply_batch = vi.fn();
    const { mod } = makeModule(makeGraph({ apply_batch }));
    await expect(
      mod.ingest({ envelopes: [env({ kind: "live", remote_id: "r9", user_id: "" })] }),
    ).rejects.toThrow(/user_id/);
    expect(apply_batch).not.toHaveBeenCalled();
  });
});

describe("meetings sync control (@rpc)", () => {
  it("sync.status reads sync_state('status')", async () => {
    const sync_state = vi.fn().mockResolvedValue({ states: [] });
    const { mod } = makeModule(makeGraph({ sync_state }));
    await mod.syncStatus();
    expect(sync_state).toHaveBeenCalledWith("status");
  });

  it("sync.reset resets only the meetings.calendar_event namespace", async () => {
    const sync_state = vi.fn().mockResolvedValue({ ok: true });
    const { mod } = makeModule(makeGraph({ sync_state }));
    await mod.syncReset();
    expect(sync_state).toHaveBeenCalledWith("reset", CAL);
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
      envelopes: [env({ kind: "live", remote_id: "r9", payload: { title: "No start" } })],
    });

    expect(res.trigger_checks[0]?.context).toHaveProperty("occurred_at", null);
  });
});
