// Meetings sync ingest (@syncHandler) + control (@rpc sync.status /
// sync.reset). Exercises the module through @magnis/testkit/module (mockGraph +
// mountModule + a test RpcExecutor). Asserts: snapshot/live upsert via
// apply_batch (external_id idempotency, confidence 90), the full live
// trigger.check payload with attendee email.address ids resolved through
// email.ensure_address, delete, empty-user hard error,
// and the sync_state control surface.

import { describe, expect, it, vi } from "vitest";
import type { GraphBatchInput, GraphBatchResult } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical, MeetingsFacets, SyncEnvelope } from "../../types.ts";

const CAL = "meetings.calendar_event";
const CAL_DETAILS = "meetings.calendar_event.details";
type G = MockGraph<MeetingsFacets, MeetingsCanonical>;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph<MeetingsFacets, MeetingsCanonical>({
    apply_batch: (frag: GraphBatchInput): Promise<GraphBatchResult> =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
    find_by_external_id: (_id: string): Promise<string | null> => Promise.resolve(null),
    delete_entity: (_id: string): Promise<void> => Promise.resolve(undefined),
    sync_state: (): Promise<Record<string, unknown>> => Promise.resolve({ ok: true }),
    ...over,
  } as unknown as GraphOverrides<MeetingsFacets, MeetingsCanonical>);
}

function makeModule(
  graph: G,
  execute = vi.fn(async (_m: string, p?: unknown) => ({ id: `addr-${(p as { address: string }).address}` })),
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
  it("upserts a snapshot via apply_batch keyed on external_id, no trigger", async () => {
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
        facets: [{ schema_id: CAL_DETAILS, data: payload, external_id: "r2", confidence: 90 }],
      },
    ]);
    expect(res.trigger_checks).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("meetings @syncHandler — live trigger.check (INV-6)", () => {
  it("ensures attendee addresses via email.ensure_address and returns the full payload", async () => {
    const apply_batch = vi.fn(async () => ({
      ids: { r5: "m-r5" },
      created: 1,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    }));
    const { mod, execute } = makeModule(makeGraph({ apply_batch }));

    const payload = {
      title: "Standup",
      attendees: [{ name: "Alice", email: "a@x" }, { email: "b@x" }],
    };
    const res = await mod.ingest({
      envelopes: [env({ kind: "live", remote_id: "r5", payload })],
    });

    expect(execute).toHaveBeenCalledWith("email.ensure_address", { address: "a@x", display_name: "Alice" });
    expect(execute).toHaveBeenCalledWith("email.ensure_address", { address: "b@x", display_name: null });
    expect(res.trigger_checks).toEqual([
      {
        type: "trigger.check",
        event_kind: "new_meeting",
        schema_id: "meetings.meeting",
        entity_id: "m-r5",
        phase: "live",
        touched_entity_ids: ["m-r5", "addr-a@x", "addr-b@x"],
        user_id: "u1",
        context: { title: "Standup", remote_id: "r5" },
      },
    ]);
  });
});

describe("meetings @syncHandler — delete (INV-7)", () => {
  it("deletes an existing meeting by external_id", async () => {
    const find_by_external_id = vi.fn().mockResolvedValue("m-del");
    const delete_entity = vi.fn().mockResolvedValue(undefined);
    const { mod } = makeModule(makeGraph({ find_by_external_id, delete_entity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "rdel" })] });

    expect(find_by_external_id).toHaveBeenCalledWith("rdel");
    expect(delete_entity).toHaveBeenCalledWith("m-del");
    expect(res.dropped_remote_ids).toEqual([]);
  });

  it("is a no-op (not an error, not dropped) for an unknown delete id", async () => {
    const find_by_external_id = vi.fn().mockResolvedValue(null);
    const delete_entity = vi.fn();
    const { mod } = makeModule(makeGraph({ find_by_external_id, delete_entity }));

    const res = await mod.ingest({ envelopes: [env({ kind: "delete", remote_id: "ghost" })] });

    expect(delete_entity).not.toHaveBeenCalled();
    expect(res.dropped_remote_ids).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("meetings @syncHandler — empty user_id is a hard error (INV-8)", () => {
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
