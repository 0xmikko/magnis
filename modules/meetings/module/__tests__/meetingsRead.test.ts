// Meetings read surface: shape parity + behavior. Exercises the V8
// module class through @magnis/testkit/module (mockGraph + mountModule).
// Mirrors the native meetings domain (types.rs): list (window over
// meetings.calendar_event, the dictionary's starts_at DESC), get (entity +
// links), search (meetings.EVENT schema — native quirk), strict attendee
// parsing on the WRITE path (malformed input throws, never silently repaired)
// and read-time attendee enrichment over the `attendee` edges.
//
// mockGraph is a throwing Proxy: any op NOT arranged (or passed via `over`)
// throws when hit, so an accidental crossing fails loudly — the guarantee that
// REPLACES the old hand-rolled per-op reject() spies.

import { describe, expect, it, vi } from "vitest";
import type { Entity, EntityWithLinks, JsonObject, Link } from "@magnis/sdk";
import { entity as graphEntity, link, mockGraph, mountModule, page, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import { parseAttendees } from "../helpers.ts";
import type { MeetingsCanonical } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph;

// Only getEntities is arranged by default; the read path's other ops are
// supplied per-test via `over`. Anything else throws via the mockGraph Proxy.
function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph({
    getEntities: () => Promise.resolve([]),
    ...over,
  } as unknown as GraphOverrides);
}

function makeModule(graph: G): MeetingsModule {
  return mountModule(MeetingsModule, { graph, ctx: { extensionId: "meetings" } }).module;
}

const entity = (
  id: string,
  name: string,
  properties: JsonObject = {},
  created = "2026-01-01T00:00:00Z",
): Entity => graphEntity(id, name, { schemaId: CAL, createdAt: created, properties });

// ── parseAttendees (strict — malformed input throws) ──────────────
describe("parseAttendees", () => {
  it("parses the canonical {name?, email}[] array", () => {
    const out = parseAttendees(
      { attendees: [{ name: "Alice", email: "a@x" }, { email: "b@x" }] },
      "ent-1",
    );
    expect(out).toEqual([
      { name: "Alice", email: "a@x" },
      { email: "b@x" },
    ]);
  });

  it("treats absent/null as the empty state", () => {
    expect(parseAttendees({}, "ent-1")).toEqual([]);
    expect(parseAttendees({ attendees: null }, "ent-1")).toEqual([]);
    expect(parseAttendees(undefined, "ent-1")).toEqual([]);
  });

  it("throws on malformed attendees (missing email / non-array / legacy comma-string)", () => {
    expect(() => parseAttendees({ attendees: [{ name: "Alice" }] }, "ent-1")).toThrow(
      /malformed attendees.*ent-1/,
    );
    expect(() => parseAttendees({ attendees: "Alice, Bob" }, "ent-1")).toThrow(
      /malformed attendees/,
    );
    expect(() => parseAttendees({ attendees: "a@x, b@x" }, "ent-1")).toThrow(
      /malformed attendees/,
    );
  });
});

// ── meetings.list ─────────────────────────────────────────────────
describe("meetings.list", () => {
  it("windows meetings.calendar_event by starts_at DESC and shapes list items", async () => {
    const win = page([
      entity("m2", "Later meeting", {
        starts_at: "2026-02-02T15:00:00Z",
        ends_at: "2026-02-02T16:00:00Z",
        location: "Room B",
        description: "Agenda 2",
      }),
      entity("m1", "Earlier meeting", {
        starts_at: "2026-02-01T09:00:00Z",
        ends_at: "2026-02-01T10:00:00Z",
        location: "",
      }),
    ]);
    const listEntitiesWindow = vi.fn().mockResolvedValue(win);
    const mod = makeModule(
      makeGraph({
        listEntitiesWindow,
        // No attendee edges on either row — ONE page-level batch read.
        listLinksForEntities: vi.fn(async (): Promise<Link[]> => []),
      }),
    );

    const res = await mod.list({ limit: 50, offset: 0 });

    // ONE window crossing; ordered by the DICTIONARY's starts_at DESC, and no
    // record schema is named anywhere on the read path.
    expect(listEntitiesWindow).toHaveBeenCalledTimes(1);
    const spec = listEntitiesWindow.mock.calls[0]![0];
    expect(spec.schema).toBe(CAL);
    expect(spec.facet_schema).toBeUndefined();
    expect(spec.order).toEqual([{ field: { propertyPath: "starts_at" }, desc: true }]);

    expect(res.total).toBe(2);
    expect(res.items.map((m) => m.id)).toEqual(["m2", "m1"]);
    const m2 = res.items[0]!;
    expect(m2.title).toBe("Later meeting");
    expect(m2.starts_at).toBe("2026-02-02T15:00:00Z");
    expect(m2.location).toBe("Room B");
    expect(m2.description).toBe("Agenda 2");
    expect(m2.date).toBe("2026-02-02");
    expect(m2.time).toBe("15:00 - 16:00");
    expect(m2.attendees).toEqual([]);
    // empty-string location is dropped (native .filter(!is_empty)).
    expect(res.items[1]!.location).toBeNull();
  });
});

// ── meetings.get ──────────────────────────────────────────────────
describe("meetings.get", () => {
  it("returns the detail view with enriched attendees + linked entities", async () => {
    const detail: EntityWithLinks = {
      entity: entity("m1", "Sync meeting", {
        starts_at: "2026-02-01T09:00:00Z",
        ends_at: "2026-02-01T10:00:00Z",
        location: "HQ",
        description: "Weekly",
      }),
      // The attendee edges ride the detail's own links — no second crossing.
      links: [
        link("proj-1", "m1", "created", { id: "l1" }),
        link("m1", "addr-alice", "attendee", { id: "l2", metadata: { display_name: "Alice" } }),
        link("m1", "addr-bob", "attendee", { id: "l3" }),
      ],
    };
    const graph = makeGraph({
      getEntityFull: vi.fn().mockResolvedValue(detail),
      getEntities: vi.fn(async (ids: string[]) =>
        [
          graphEntity("proj-1", "Proj", { schemaId: "projects.project" }),
          graphEntity("addr-alice", "alice@x.com", { schemaId: "email.address", properties: { address: "alice@x.com" } }),
          graphEntity("addr-bob", "bob@x.com", { schemaId: "email.address", properties: { address: "bob@x.com" } }),
          graphEntity("person-1", "Alice", { schemaId: "contacts.person" }),
        ].filter((e) => ids.includes(e.id)),
      ),
      // alice's address is claimed by a contact; bob's is not. The batch
      // reads BOTH addresses' edges in one call and the person in another.
      listLinksForEntities: vi.fn(async (): Promise<Link[]> => [
        link("person-1", "addr-alice", "identity", { id: "hl" }),
      ]),
    });
    const mod = makeModule(graph);

    const view = await mod.get({ id: "m1" });

    expect(view.id).toBe("m1");
    expect(view.title).toBe("Sync meeting");
    expect(view.location).toBe("HQ");
    expect(view.attendees).toEqual([
      { name: "Alice", email: "alice@x.com", contact_id: "person-1" },
      { name: null, email: "bob@x.com", contact_id: null },
    ]);
    // Every link neighbour is a Context-panel row — the project that created
    // the meeting and both attendee addresses.
    expect(view.linked_entities).toEqual([
      expect.objectContaining({ id: "proj-1", linkKind: "created", schemaId: "projects.project" }),
      expect.objectContaining({ id: "addr-alice", linkKind: "attendee" }),
      expect.objectContaining({ id: "addr-bob", linkKind: "attendee" }),
    ]);
  });

  it("throws when the meeting is not found / not owned", async () => {
    const mod = makeModule(makeGraph({ getEntityFull: vi.fn().mockResolvedValue(null) }));
    await expect(mod.get({ id: "nope" })).rejects.toThrow(/not found/);
  });
});

// ── meetings.search (native quirk: searches meetings.EVENT) ────────
describe("meetings.search", () => {
  /**
   * @test-id: tst_plugin_meetings_search_002
   * @scenario: scn_hosted_demo_urbangrid_search_001
   * @covers: plugins-public/modules/meetings/module/service.ts
   * @deterministic: yes
   * @fixtures: decorated meetings module tool definition
   */
  it("tst_plugin_meetings_search_002 leaves graph search to the declared entity", async () => {
    const { tools } = await mountModule(MeetingsModule, {
      mode: "dispatch",
      ctx: { extensionId: "meetings" },
    });
    expect(tools.some((candidate) => candidate.name === "meetings.search")).toBe(false);
  });

  it("searches the meetings.event schema, not calendar_event", async () => {
    const listEntitiesByContext = vi.fn().mockResolvedValue([
      graphEntity("e1", "Quarterly review", { schemaId: "meetings.event" }),
      graphEntity("c1", "Quarterly review", { schemaId: "meetings.calendar_event" }),
      graphEntity("e2", "Standup", { schemaId: "meetings.event" }),
    ]);
    const mod = makeModule(makeGraph({ listEntitiesByContext }));

    const res = await mod.search({ query: "quarterly" });
    const parsed = JSON.parse((res.content[0] as { text: string }).text);

    expect(parsed.map((r: { id: string }) => r.id)).toEqual(["e1"]);
    expect(parsed[0]).toEqual({ id: "e1", name: "Quarterly review", schemaId: "meetings.event" });
  });
});
