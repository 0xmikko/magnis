// Stage 1 — meetings read surface: shape parity + behavior. Unit-tests the V8
// module class directly with a mock GraphService whose methods are vi.fn()
// spies. Mirrors the native meetings domain (types.rs): list (window over
// meetings.calendar_event, starts_at DESC), get (entity + facets + links),
// search (meetings.EVENT schema — native quirk), attendee parse (INV-24c) and
// read-time attendee→contact enrichment.

import { describe, expect, it, vi } from "vitest";
import type {
  EntityDetail,
  GraphService,
  LinkSummary,
  PluginDeps,
  RawEntity,
  WindowPage,
} from "@magnis/plugin-sdk";
import { MeetingsModule } from "../service.ts";
import { parseAttendees } from "../helpers.ts";
import type { MeetingsCanonical, MeetingsFacets } from "../../types/index.ts";

const CAL = "meetings.calendar_event";
const CAL_DETAILS = "meetings.calendar_event.details";

// Mock graph: only the ops the read path may touch are stubbed; anything else
// throws so an accidental crossing fails loudly.
function makeGraph(over: Partial<Record<string, unknown>> = {}): GraphService<
  MeetingsFacets,
  MeetingsCanonical
> {
  const reject =
    (name: string) =>
    (..._a: unknown[]): never => {
      throw new Error(`unexpected graph op on read path: ${name}`);
    };
  return {
    list_entities_window: vi.fn(reject("list_entities_window")),
    get_entity_full: vi.fn(reject("get_entity_full")),
    list_entities_by_context: vi.fn(reject("list_entities_by_context")),
    search_entities_by_name: vi.fn(reject("search_entities_by_name")),
    list_facets_for_entities: vi.fn(reject("list_facets_for_entities")),
    find_by_external_id: vi.fn(reject("find_by_external_id")),
    list_links_for_entity: vi.fn(reject("list_links_for_entity")),
    get_entity: vi.fn(reject("get_entity")),
    get_entities: vi.fn().mockResolvedValue([]),
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

const entity = (id: string, name: string, created = "2026-01-01T00:00:00Z"): RawEntity =>
  ({ id, schema_id: CAL, name, created_at: created }) as RawEntity;

// ── parseAttendees (INV-24c) ──────────────────────────────────────
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
      /malformed attendees facet.*ent-1/,
    );
    expect(() => parseAttendees({ attendees: "Alice, Bob" }, "ent-1")).toThrow(
      /malformed attendees facet/,
    );
    expect(() => parseAttendees({ attendees: "a@x, b@x" }, "ent-1")).toThrow(
      /malformed attendees facet/,
    );
  });
});

// ── meetings.list ─────────────────────────────────────────────────
describe("meetings.list", () => {
  it("windows meetings.calendar_event by starts_at DESC and shapes list items", async () => {
    const win: WindowPage = {
      items: [
        {
          entity: entity("m2", "Later meeting"),
          data: {
            starts_at: "2026-02-02T15:00:00Z",
            ends_at: "2026-02-02T16:00:00Z",
            location: "Room B",
            description: "Agenda 2",
            attendees: [],
          },
        },
        {
          entity: entity("m1", "Earlier meeting"),
          data: {
            starts_at: "2026-02-01T09:00:00Z",
            ends_at: "2026-02-01T10:00:00Z",
            location: "",
            attendees: [],
          },
        },
      ],
      total: 2,
    };
    const list_entities_window = vi.fn().mockResolvedValue(win);
    const mod = makeModule(makeGraph({ list_entities_window }));

    const res = await mod.list({ limit: 50, offset: 0 });

    // ONE window crossing; ordered by the details facet's starts_at DESC.
    expect(list_entities_window).toHaveBeenCalledTimes(1);
    const spec = list_entities_window.mock.calls[0]![0];
    expect(spec.schema).toBe(CAL);
    expect(spec.facet_schema).toBe(CAL_DETAILS);
    expect(spec.order).toEqual([
      { field: { facet_schema: CAL_DETAILS, facet_path: "starts_at" }, desc: true },
    ]);

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
      entity: entity("m1", "Sync meeting"),
      facets: [
        {
          id: "f1",
          schema_id: CAL_DETAILS,
          source: "google",
          observed_at: "2026-01-01T00:00:00Z",
          data: {
            starts_at: "2026-02-01T09:00:00Z",
            ends_at: "2026-02-01T10:00:00Z",
            location: "HQ",
            description: "Weekly",
            attendees: [{ name: "Alice", email: "alice@x.com" }, { email: "bob@x.com" }],
          },
        },
      ],
      links: [{ id: "l1", from_id: "proj-1", to_id: "m1", kind: "created" }],
    };
    const graph = makeGraph({
      get_entity_full: vi.fn().mockResolvedValue(detail),
      get_entities: vi
        .fn()
        .mockResolvedValue([{ id: "proj-1", schema_id: "projects.project", name: "Proj" }]),
      // alice resolves to a contact; bob does not.
      find_by_external_id: vi.fn(async (ext: string) =>
        ext === "email:address:alice@x.com" ? "addr-alice" : null,
      ),
      list_links_for_entity: vi.fn(
        async (): Promise<LinkSummary[]> => [
          { id: "hl", from_id: "person-1", to_id: "addr-alice", kind: "has_email" },
        ],
      ),
      get_entity: vi.fn(async (id: string) =>
        id === "person-1" ? { id, schema_id: "contacts.person", name: "Alice" } : null,
      ),
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
    expect(view.linked_entities).toEqual([
      expect.objectContaining({ id: "proj-1", link_kind: "created", schema_id: "projects.project" }),
    ]);
  });

  it("throws when the meeting is not found / not owned", async () => {
    const mod = makeModule(makeGraph({ get_entity_full: vi.fn().mockResolvedValue(null) }));
    await expect(mod.get({ id: "nope" })).rejects.toThrow(/not found/);
  });
});

// ── meetings.search (native quirk: searches meetings.EVENT) ────────
describe("meetings.search", () => {
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
