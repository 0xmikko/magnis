/**
 * Stage 6 of docs/plans/mock-google-calendar.md — frontend `+` button
 * wires to `meetings.create` RPC.
 *
 * tst_fe_meetings_create_001 — the create handler dispatches the right
 *   RPC params (title, starts_at, ends_at, client_id) and calls
 *   `onCreated` with the returned entity id. INV-16.
 * tst_fe_meetings_create_002 — DecisionSummary regression: an approved
 *   `meetings.create` decision result resolves to schema_id
 *   `meetings.calendar_event` via the AgentPanelBlocks fallback
 *   (Stage 1.5 fix). INV-20.
 */
import { describe, expect, it, vi } from "vitest";
import { createMeetingFromHeaderButton } from "../createMeeting";
import { extractEntities } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";

function makeRuntime(rpc: (method: string, params: unknown) => Promise<unknown>): AppRuntime {
  return {
    queryClient: {} as AppRuntime["queryClient"],
    transport: {
      rpc: vi.fn(rpc),
    } as unknown as AppRuntime["transport"],
    modules: {} as AppRuntime["modules"],
    stores: {} as AppRuntime["stores"],
    agent: {} as AppRuntime["agent"],
    composer: {} as AppRuntime["composer"],
  };
}

describe("tst_fe_meetings_create_001 — + button dispatches meetings.create", () => {
  it("calls runtime.transport.rpc with the correct method and shape", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ id: "m-1" });
    const runtime = makeRuntime(rpcSpy);
    const onCreated = vi.fn();

    await createMeetingFromHeaderButton(runtime, onCreated);

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [method, params] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(method).toBe("meetings.create");
    expect(typeof params.title).toBe("string");
    expect(((params.title as string).trim().length)).toBeGreaterThan(0);
    expect(typeof params.starts_at).toBe("string");
    expect(typeof params.ends_at).toBe("string");
    // RFC-3339: must parse back to a Date.
    expect(Number.isNaN(Date.parse(params.starts_at as string))).toBe(false);
    expect(Number.isNaN(Date.parse(params.ends_at as string))).toBe(false);
    // ends_at strictly after starts_at — backend rejects otherwise (INV-14).
    expect(Date.parse(params.ends_at as string)).toBeGreaterThan(
      Date.parse(params.starts_at as string),
    );
    // Idempotency token — UUIDv4 string per crypto.randomUUID().
    expect(typeof params.client_id).toBe("string");
    expect((params.client_id as string).length).toBeGreaterThanOrEqual(32);
  });

  it("calls onCreated with the returned entity id", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ id: "m-42" });
    const runtime = makeRuntime(rpcSpy);
    const onCreated = vi.fn();

    await createMeetingFromHeaderButton(runtime, onCreated);

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith("m-42");
  });

  it("propagates RPC errors (no swallow)", async () => {
    const rpcSpy = vi.fn().mockRejectedValue(new Error("backend down"));
    const runtime = makeRuntime(rpcSpy);
    const onCreated = vi.fn();

    await expect(createMeetingFromHeaderButton(runtime, onCreated)).rejects.toThrow(
      /backend down/,
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("tst_fe_meetings_create_002 — DecisionSummary single-entity collapse", () => {
  it("infers schema_id=meetings.calendar_event from a meetings.create result", () => {
    // Stage 1.5 fix: TOOL_PREFIX_TO_SCHEMA.meetings === "meetings.calendar_event".
    // INV-20 — the unified MeetingCard resolves via the canonical schema.
    const entities = extractEntities(
      { id: "m-1", title: "Standup", starts_at: "2026-05-14T10:00:00Z" },
      { toolName: "meetings.create" },
    );
    expect(entities).toHaveLength(1);
    expect(entities[0]?.schema_id).toBe("meetings.calendar_event");
    expect(entities[0]?.title).toBe("Standup");
  });
});
