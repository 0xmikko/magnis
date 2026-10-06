import { describe, expect, it } from "vitest";
import { buildAgendaGroups, mapMeetingFromApi } from "../helpers";
import type { MeetingListItem } from "../types";

function makeMeeting(overrides: Partial<MeetingListItem> = {}): MeetingListItem {
  return {
    id: "m-1",
    schemaId: "meetings.calendar_event",
    title: "Planning sync",
    date: "2026-02-20",
    time: "10:00",
    startsAt: "2026-02-20T10:00:00Z",
    endsAt: "2026-02-20T11:00:00Z",
    location: "Room A",
    description: null,
    conferenceLink: null,
    attendees: [
      { name: "Alice Johnson", email: "alice@example.com", contactId: null },
      { name: "Bob Smith", email: "bob@example.com", contactId: null },
    ],
    createdAt: "2026-02-19T12:00:00Z",
    ...overrides,
  };
}

describe("mapMeetingFromApi", () => {
  it("maps regular meeting payload", () => {
    const result = mapMeetingFromApi(makeMeeting());
    expect(result.title).toBe("Planning sync");
    expect(result.with).toBe("Alice Johnson, Bob Smith");
    expect(result.preview).toBe("Room A");
    expect(result.initials).toBe("AJ");
  });

  it("provides robust fallbacks for partial payloads", () => {
    const result = mapMeetingFromApi(
      makeMeeting({
        title: "   ",
        date: null,
        time: null,
        location: null,
        attendees: [],
      }),
    );

    expect(result.title).toBe("Untitled meeting");
    expect(result.date).toBe("TBD");
    expect(result.time).toBe("TBD");
    expect(result.with).toBe("No attendees");
    expect(result.preview).toBe("No location");
    expect(result.initials).toBe("UM");
  });

  /**
   * tst_fe_meetings_helpers_attendees_001 — helpers consume the
   * module's attendee view and render `name ?? email`.
   * When `name` is null the email is the display string.
   */
  it("tst_fe_meetings_helpers_attendees_001 handles canonical attendee objects (name ?? email)", () => {
    const result = mapMeetingFromApi(
      makeMeeting({
        attendees: [
          { name: "Alice", email: "alice@x.test", contactId: null },
          { name: null, email: "bob@x.test", contactId: null },
        ],
      }),
    );
    expect(result.with).toBe("Alice, bob@x.test");
  });
});

describe("buildAgendaGroups ordering", () => {
  const at = (id: string, iso: string): MeetingListItem =>
    makeMeeting({ id, startsAt: iso, date: iso.slice(0, 10) });

  it("orders day groups chronologically (earliest day first), so upcoming flows downward", () => {
    const groups = buildAgendaGroups(
      [
        at("c", "2026-06-11T23:00:00Z"),
        at("a", "2026-06-08T15:00:00Z"),
        at("b", "2026-06-09T09:30:00Z"),
      ],
      new Date(0),
      new Date(2100, 0, 1),
    );
    expect(groups.map((g) => g.date.getTime())).toEqual(
      [...groups.map((g) => g.date.getTime())].sort((x, y) => x - y),
    );
    // earliest day first
    expect(groups[0]!.meetingIds).toEqual(["a"]);
    expect(groups[groups.length - 1]!.meetingIds).toEqual(["c"]);
  });

  it("keeps within-day events morning→evening", () => {
    const groups = buildAgendaGroups(
      [at("pm", "2026-06-08T15:00:00Z"), at("am", "2026-06-08T09:00:00Z")],
      new Date(0),
      new Date(2100, 0, 1),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.meetingIds).toEqual(["am", "pm"]);
  });
});
