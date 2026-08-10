// Meetings sync ingest (@syncHandler) + control (@rpc sync.status /
// sync.reset). Exercises the module through @magnis/testkit/module (mockGraph +
// mountModule + a test RpcExecutor). Asserts: snapshot/live upsert via
// apply_batch (anchored on the remote id, attendees as `attendee` edges over
// refs), the full live trigger.check payload with attendee email.address ids
// resolved through email.ensure_addresses, delete, empty-user hard error,
// and the sync_state control surface.

import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, GraphBatchResult } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical, SyncEnvelope } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph<MeetingsCanonical>;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph<MeetingsCanonical>({
    apply_batch: (frag: GraphBatchInput): Promise<GraphBatchResult> =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
    find_by_anchor: (_id: string): Promise<string | null> => Promise.resolve(null),
    // The upsert reconciles the event's attendee edges against the invite's
    // CURRENT list — one edge read per upserted event.
    list_links_for_entity: (): Promise<never[]> => Promise.resolve([]),
    delete_entity: (_id: string): Promise<void> => Promise.resolve(undefined),
    sync_state: (): Promise<Record<string, unknown>> => Promise.resolve({ ok: true }),
    ...over,
  } as unknown as GraphOverrides<MeetingsCanonical>);
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
        properties: payload,
        confidence: 90,
      },
    ]);
    expect(frag.links).toEqual([]);
    expect(res.trigger_checks).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("meetings @syncHandler — live envelopes emit a trigger.check", () => {
  it("ensures attendee addresses via email.ensure_address and returns the full payload", async () => {
    const apply_batch = vi.fn(async (_frag: GraphBatchInput) => ({
      ids: { r5: "m-r5" },
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

    expect(execute).toHaveBeenCalledWith("email.ensure_addresses", {
      items: [{ address: "a@x", display_name: "Alice" }, { address: "b@x", display_name: null }],
    });
    // The attendees are EDGES to the shared address nodes, and the invite's
    // per-event display name rides the edge dictionary.
    const frag = apply_batch.mock.calls[0]![0] as GraphBatchInput;
    expect(frag.entities[0]?.properties).toEqual({
      title: "Standup",
      starts_at: "2026-07-28T09:00:00Z",
    });
    expect(frag.refs).toEqual([
      { key: "addr:a@x", anchor: "email:address:a@x" },
      { key: "addr:b@x", anchor: "email:address:b@x" },
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
        { id: "l-keep", from_id: "id-r6", to_id: "addr-ann@x", kind: "attendee" },
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
    expect(res.dropped_remote_ids).toEqual([]);
    expect(res.ok).toBe(true);
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
 * @covers: plugins/modules/meetings/module/service.ts::MeetingsModule.ingest
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
