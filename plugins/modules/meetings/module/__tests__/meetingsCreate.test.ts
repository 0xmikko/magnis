// Stage 2 — meetings.create write path: validation (INV-3, BEFORE any write),
// snapshot shape (INV-13), and client_id idempotency (INV-4). Unit-tests the
// module class with a mock GraphService.

import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps, RawEntity } from "@magnis/plugin-sdk";
import { MeetingsModule } from "../service.ts";
import type { MeetingsCanonical, MeetingsFacets } from "../../types/index.ts";

const CAL = "meetings.calendar_event";
const CAL_DETAILS = "meetings.calendar_event.details";

function makeGraph(over: Partial<Record<string, unknown>> = {}): GraphService<
  MeetingsFacets,
  MeetingsCanonical
> {
  return {
    create_entity: vi.fn(async (p: { client_id?: string; name: string }) => ({
      id: p.client_id ?? "new-id",
      schema_id: CAL,
      name: p.name,
    })),
    attach_facet: vi.fn().mockResolvedValue(undefined),
    get_entity: vi.fn().mockResolvedValue(null),
    ...over,
  } as unknown as GraphService<MeetingsFacets, MeetingsCanonical>;
}

function makeModule(graph: GraphService<MeetingsFacets, MeetingsCanonical>): MeetingsModule {
  const deps = {
    graph,
    ctx: { extension_id: "meetings", user_id: "u1" },
    util: {},
    rpc: { execute: vi.fn() },
  } as unknown as PluginDeps<MeetingsFacets, MeetingsCanonical>;
  return new MeetingsModule(deps);
}

const GOOD = {
  title: "Sync",
  starts_at: "2026-02-01T09:00:00Z",
  ends_at: "2026-02-01T10:00:00Z",
};

describe("meetings.create — validation (INV-3, no write on failure)", () => {
  it("rejects an empty / whitespace title", async () => {
    const create_entity = vi.fn();
    const mod = makeModule(makeGraph({ create_entity }));
    await expect(mod.create({ ...GOOD, title: "   " })).rejects.toThrow(/non-empty/);
    expect(create_entity).not.toHaveBeenCalled();
  });

  it("rejects a non-RFC3339 starts_at / ends_at", async () => {
    const create_entity = vi.fn();
    const mod = makeModule(makeGraph({ create_entity }));
    await expect(mod.create({ ...GOOD, starts_at: "not-a-date" })).rejects.toThrow(
      /invalid starts_at/,
    );
    await expect(mod.create({ ...GOOD, ends_at: "2026/02/01" })).rejects.toThrow(/invalid ends_at/);
    expect(create_entity).not.toHaveBeenCalled();
  });

  it("rejects ends_at < starts_at", async () => {
    const create_entity = vi.fn();
    const mod = makeModule(makeGraph({ create_entity }));
    await expect(
      mod.create({ title: "X", starts_at: "2026-02-01T10:00:00Z", ends_at: "2026-02-01T09:00:00Z" }),
    ).rejects.toThrow(/ends_at must be >= starts_at/);
    expect(create_entity).not.toHaveBeenCalled();
  });
});

describe("meetings.create — happy path (INV-13 snapshot)", () => {
  it("creates the entity + details facet and returns the snapshot", async () => {
    const create_entity = vi.fn(async (p: { name: string }) => ({
      id: "m-new",
      schema_id: CAL,
      name: p.name,
    } as RawEntity));
    const attach_facet = vi.fn().mockResolvedValue(undefined);
    const mod = makeModule(makeGraph({ create_entity, attach_facet }));

    const snap = await mod.create({
      ...GOOD,
      attendees: [{ name: "Alice", email: "a@x" }],
      description: "Agenda",
      location: "HQ",
    });

    expect(create_entity).toHaveBeenCalledTimes(1);
    expect(create_entity.mock.calls[0]![0]).toMatchObject({ schema_id: CAL, name: "Sync" });
    expect(attach_facet).toHaveBeenCalledTimes(1);
    const facetCall = attach_facet.mock.calls[0]![0];
    expect(facetCall.entity_id).toBe("m-new");
    expect(facetCall.schema_id).toBe(CAL_DETAILS);
    expect(facetCall.data).toMatchObject({
      title: "Sync",
      starts_at: GOOD.starts_at,
      ends_at: GOOD.ends_at,
      attendees: [{ name: "Alice", email: "a@x" }],
      description: "Agenda",
      location: "HQ",
    });

    expect(snap).toMatchObject({
      id: "m-new",
      schema_id: CAL,
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

describe("meetings.create — idempotency (INV-4)", () => {
  it("returns the existing entity for a repeat client_id without re-creating", async () => {
    const existing: RawEntity = { id: "cid-1", schema_id: CAL, name: "Sync" } as RawEntity;
    const get_entity = vi.fn().mockResolvedValue(existing);
    const create_entity = vi.fn();
    const attach_facet = vi.fn();
    const mod = makeModule(makeGraph({ get_entity, create_entity, attach_facet }));

    const snap = (await mod.create({ ...GOOD, client_id: "cid-1" })) as Record<string, unknown>;

    expect(get_entity).toHaveBeenCalledWith("cid-1");
    expect(create_entity).not.toHaveBeenCalled();
    expect(attach_facet).not.toHaveBeenCalled();
    expect(snap.id).toBe("cid-1");
  });
});
