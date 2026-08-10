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
import type { EntityDetail, LinkSummary, RawEntity, WindowPage } from "@magnis/plugin-sdk";
import { mockGraph, mountModule, type GraphOverrides, type MockGraph } from "@magnis/testkit/module";
import { MeetingsModule } from "../service.ts";
import { parseAttendees } from "../helpers.ts";
import type { MeetingsCanonical } from "../../types.ts";

const CAL = "meetings.calendar_event";
type G = MockGraph<MeetingsCanonical>;

// Only get_entities is arranged by default; the read path's other ops are
// supplied per-test via `over`. Anything else throws via the mockGraph Proxy.
function makeGraph(over: Partial<Record<string, unknown>> = {}): G {
  return mockGraph<MeetingsCanonical>({
    get_entities: () => Promise.resolve([]),
    ...over,
  } as unknown as GraphOverrides<MeetingsCanonical>);
}

function makeModule(graph: G): MeetingsModule {
  return mountModule(MeetingsModule, { graph, ctx: { extension_id: "meetings" } }).module;
}

const entity = (
  id: string,
  name: string,
  properties: Record<string, unknown> = {},
  created = "2026-01-01T00:00:00Z",
): RawEntity => ({ id, schema_id: CAL, name, created_at: created, properties }) as RawEntity;

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
    const win: WindowPage = {
      items: [
        {
          entity: entity("m2", "Later meeting", {
            starts_at: "2026-02-02T15:00:00Z",
            ends_at: "2026-02-02T16:00:00Z",
            location: "Room B",
            description: "Agenda 2",
          }),
        },
        {
          entity: entity("m1", "Earlier meeting", {
            starts_at: "2026-02-01T09:00:00Z",
            ends_at: "2026-02-01T10:00:00Z",
            location: "",
          }),
        },
      ],
      total: 2,
    };
    const list_entities_window = vi.fn().mockResolvedValue(win);
    const mod = makeModule(
      makeGraph({
        list_entities_window,
        // No attendee edges on either row — ONE page-level batch read.
        list_links_for_entities: vi.fn(async (): Promise<LinkSummary[]> => []),
      }),
    );

    const res = await mod.list({ limit: 50, offset: 0 });

    // ONE window crossing; ordered by the DICTIONARY's starts_at DESC, and no
    // record schema is named anywhere on the read path.
    expect(list_entities_window).toHaveBeenCalledTimes(1);
    const spec = list_entities_window.mock.calls[0]![0];
    expect(spec.schema).toBe(CAL);
    expect(spec.facet_schema).toBeUndefined();
    expect(spec.order).toEqual([{ field: { property_path: "starts_at" }, desc: true }]);

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
    const detail: EntityDetail = {
      entity: entity("m1", "Sync meeting", {
        starts_at: "2026-02-01T09:00:00Z",
        ends_at: "2026-02-01T10:00:00Z",
        location: "HQ",
        description: "Weekly",
      }),
      // The attendee edges ride the detail's own links — no second crossing.
      links: [
        { id: "l1", from_id: "proj-1", to_id: "m1", kind: "created" },
        {
          id: "l2",
          from_id: "m1",
          to_id: "addr-alice",
          kind: "attendee",
          metadata: { display_name: "Alice" },
        },
        { id: "l3", from_id: "m1", to_id: "addr-bob", kind: "attendee" },
      ],
    };
    const graph = makeGraph({
      get_entity_full: vi.fn().mockResolvedValue(detail),
      get_entities: vi.fn(async (ids: string[]) =>
        [
          { id: "proj-1", schema_id: "projects.project", name: "Proj" },
          {
            id: "addr-alice",
            schema_id: "email.address",
            name: "alice@x.com",
            properties: { address: "alice@x.com" },
          },
          {
            id: "addr-bob",
            schema_id: "email.address",
            name: "bob@x.com",
            properties: { address: "bob@x.com" },
          },
          { id: "person-1", schema_id: "contacts.person", name: "Alice" },
        ].filter((e) => ids.includes(e.id)),
      ),
      // alice's address is claimed by a contact; bob's is not. The batch
      // reads BOTH addresses' edges in one call and the person in another.
      list_links_for_entities: vi.fn(async (): Promise<LinkSummary[]> => [
        { id: "hl", from_id: "person-1", to_id: "addr-alice", kind: "identity" },
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
      expect.objectContaining({ id: "proj-1", link_kind: "created", schema_id: "projects.project" }),
      expect.objectContaining({ id: "addr-alice", link_kind: "attendee" }),
      expect.objectContaining({ id: "addr-bob", link_kind: "attendee" }),
    ]);
  });

  it("throws when the meeting is not found / not owned", async () => {
    const mod = makeModule(makeGraph({ get_entity_full: vi.fn().mockResolvedValue(null) }));
    await expect(mod.get({ id: "nope" })).rejects.toThrow(/not found/);
  });
});

// ── meetings.search (native quirk: searches meetings.EVENT) ────────
describe("meetings.search", () => {
  /**
   * @test-id: tst_plugin_meetings_search_002
   * @scenario: scn_hosted_demo_urbangrid_search_001
   * @covers: plugins-public/plugins/modules/meetings/module/service.ts
   * @deterministic: yes
   * @fixtures: decorated meetings module tool definition
   */
  it("tst_plugin_meetings_search_002 identifies context as an optional entity UUID", async () => {
    const { tools } = await mountModule(MeetingsModule, {
      mode: "dispatch",
      ctx: { extension_id: "meetings" },
    });
    const search = tools.find((candidate) => candidate.name === "meetings.search");
    const properties = search?.inputSchema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;

    expect(properties?.context).toMatchObject({
      type: "string",
      format: "uuid",
      description: expect.stringContaining("entity UUID"),
    });
  });

  it("searches the meetings.event schema, not calendar_event", async () => {
    const list_entities_by_context = vi.fn().mockResolvedValue([
      { id: "e1", schema_id: "meetings.event", name: "Quarterly review" },
      { id: "c1", schema_id: "meetings.calendar_event", name: "Quarterly review" },
      { id: "e2", schema_id: "meetings.event", name: "Standup" },
    ]);
    const mod = makeModule(makeGraph({ list_entities_by_context }));

    const res = await mod.search({ query: "quarterly" });
    const parsed = JSON.parse((res.content[0] as { text: string }).text);

    expect(parsed.map((r: { id: string }) => r.id)).toEqual(["e1"]);
    expect(parsed[0].schema_id).toBe("meetings.event");
  });
});
