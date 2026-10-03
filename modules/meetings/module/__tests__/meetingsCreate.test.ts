// meetings.create write path: validation (BEFORE any write),
// snapshot shape, and client_id idempotency. Exercises the
// module class through @magnis/testkit/module (mockGraph + mountModule).

/**
 * @test-id: tst_module_meetings_create_001
 * @scenario: scn_backend_tests_006
 * @covers: MeetingsModule.create
 * @legacy-id: tst_be_meetings_create_001_writes_entity_and_facet
 * @legacy-id: tst_be_meetings_create_002_idempotent_on_client_id
 * @legacy-id: tst_be_meetings_create_003_validates_dates
 * @legacy-id: tst_be_meetings_create_rpc_001_dispatch_round_trip
 * @legacy-id: tst_be_meetings_create_rpc_002_requires_approval
 * @legacy-id: tst_be_meetings_create_rpc_003_rejects_empty_title
 * @legacy-id: tst_be_meetings_create_rpc_004_rejects_malformed_dates
 * @legacy-id: tst_be_meetings_create_rpc_005_rejects_ends_before_starts
 * @deterministic: yes
 */

import { describe, expect, it, vi } from "vitest";
import type { CreateEntityParams, Entity, PropertiesUpdate } from "@magnis/sdk";
import { entity, mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph;

function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph({
    createEntity: (p: CreateEntityParams) =>
      Promise.resolve(entity(p.clientId ?? "new-id", p.name, { schemaId: CAL })),
    updateProperties: () => Promise.resolve(undefined),
    addLink: () => Promise.resolve(undefined),
    getEntity: () => Promise.resolve(null),
    ...over,
  } as unknown as GraphOverrides);
}

function makeModule(
  graph: G,
  execute = vi.fn(async (_m: string, p?: unknown) => ({
    ids: (p as { items: { address: string }[] }).items.map((i) => `addr-${i.address}`),
  })),
): MeetingsModule {
  return mountModule(MeetingsModule, {
    graph,
    ctx: { extensionId: "meetings" },
    rpc: { execute },
  }).module;
}

const GOOD = {
  title: "Sync",
  starts_at: "2026-02-01T09:00:00Z",
  ends_at: "2026-02-01T10:00:00Z",
};

describe("meetings.create — validation (rejected input writes nothing)", () => {
  it("rejects an empty / whitespace title", async () => {
    const createEntity = vi.fn();
    const mod = makeModule(makeGraph({ createEntity }));
    await expect(mod.create({ ...GOOD, title: "   " })).rejects.toThrow(/non-empty/);
    expect(createEntity).not.toHaveBeenCalled();
  });

  it("rejects a non-RFC3339 starts_at / ends_at", async () => {
    const createEntity = vi.fn();
    const mod = makeModule(makeGraph({ createEntity }));
    await expect(mod.create({ ...GOOD, starts_at: "not-a-date" })).rejects.toThrow(
      /invalid starts_at/,
    );
    await expect(mod.create({ ...GOOD, ends_at: "2026/02/01" })).rejects.toThrow(/invalid ends_at/);
    expect(createEntity).not.toHaveBeenCalled();
  });

  it("rejects ends_at < starts_at", async () => {
    const createEntity = vi.fn();
    const mod = makeModule(makeGraph({ createEntity }));
    await expect(
      mod.create({ title: "X", starts_at: "2026-02-01T10:00:00Z", ends_at: "2026-02-01T09:00:00Z" }),
    ).rejects.toThrow(/ends_at must be >= starts_at/);
    expect(createEntity).not.toHaveBeenCalled();
  });
});

describe("meetings.create — happy path (returns the full meeting snapshot)", () => {
  it("creates the entity, writes its dictionary + attendee edges, returns the snapshot", async () => {
    const createEntity = vi.fn(async (p: CreateEntityParams): Promise<Entity> =>
      entity("m-new", p.name, { schemaId: CAL }));
    const updateProperties = vi.fn().mockResolvedValue(undefined);
    const addLink = vi.fn().mockResolvedValue(undefined);
    const mod = makeModule(makeGraph({ createEntity, updateProperties, addLink }));

    const snap = await mod.create({
      ...GOOD,
      attendees: [{ name: "Alice", email: "a@x" }],
      description: "Agenda",
      location: "HQ",
    });

    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(createEntity.mock.calls[0]![0]).toMatchObject({ schemaId: CAL, name: "Sync" });
    // The dictionary is the record — and the attendees are NOT in it.
    expect(updateProperties).toHaveBeenCalledTimes(1);
    const dictCall = updateProperties.mock.calls[0]![0] as PropertiesUpdate & {
      properties: Record<string, unknown>;
    };
    expect(dictCall.entityId).toBe("m-new");
    expect(dictCall.properties).toMatchObject({
      title: "Sync",
      starts_at: GOOD.starts_at,
      ends_at: GOOD.ends_at,
      description: "Agenda",
      location: "HQ",
    });
    expect("attendees" in dictCall.properties).toBe(false);
    // …they are edges to the shared address node, name on the edge.
    expect(addLink).toHaveBeenCalledWith({
      from: "m-new",
      to: "addr-a@x",
      kind: "attendee",
      metadata: { display_name: "Alice" },
    });

    expect(snap).toMatchObject({
      id: "m-new",
      schemaId: CAL,
      title: "Sync",
      starts_at: GOOD.starts_at,
      ends_at: GOOD.ends_at,
      attendees: [{ name: "Alice", email: "a@x" }],
      description: "Agenda",
      location: "HQ",
    });
  });

  it("omits description/location from the snapshot when absent", async () => {
    const mod = makeModule(makeGraph());
    const snap = (await mod.create({ ...GOOD })) as Record<string, unknown>;
    expect("description" in snap).toBe(false);
    expect("location" in snap).toBe(false);
    expect(snap.attendees).toEqual([]);
  });
});

describe("meetings.create — idempotency", () => {
  it("returns the existing entity for a repeat client_id without re-creating", async () => {
    const existing = entity("cid-1", "Sync", { schemaId: CAL });
    const getEntity = vi.fn().mockResolvedValue(existing);
    const createEntity = vi.fn();
    const updateProperties = vi.fn();
    const mod = makeModule(makeGraph({ getEntity, createEntity, updateProperties }));

    const snap = (await mod.create({ ...GOOD, client_id: "cid-1" })) as Record<string, unknown>;

    expect(getEntity).toHaveBeenCalledWith("cid-1");
    expect(createEntity).not.toHaveBeenCalled();
    expect(updateProperties).not.toHaveBeenCalled();
    expect(snap.id).toBe("cid-1");
  });
});
