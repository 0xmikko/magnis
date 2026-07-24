import { describe, expect, test } from "bun:test";
import {
  fetchEventsPage,
  gcalEventToCalendarEvent,
  type GcalEvent,
} from "./calendar";
import type { FetchLike, HttpResponse } from "../../http";

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function basicEvent(): GcalEvent {
  return {
    id: "evt_1",
    summary: "Team standup",
    description: "Daily sync",
    location: "Room A",
    status: "confirmed",
    start: { dateTime: "2026-03-13T09:00:00+02:00" },
    end: { dateTime: "2026-03-13T09:30:00+02:00" },
    attendees: [
      { email: "alice@example.com", displayName: "Alice" },
      { displayName: "No Email" }, // filtered: attendees need an email
    ],
    hangoutLink: "https://meet.google.com/abc",
  };
}

describe("gcal event conversion", () => {
  test("tst_gts_gcal_001 timed event → UTC RFC3339 Z + attendee email filter", () => {
    const cal = gcalEventToCalendarEvent(basicEvent());
    expect(cal.id).toBe("evt_1");
    expect(cal.title).toBe("Team standup");
    expect(cal.all_day).toBe(false);
    // Offset normalized to UTC, chrono-style (no .000).
    expect(cal.starts_at).toBe("2026-03-13T07:00:00Z");
    expect(cal.ends_at).toBe("2026-03-13T07:30:00Z");
    expect(cal.status).toBe("confirmed");
    // Only attendees WITH an email survive.
    expect(cal.attendees).toEqual([{ name: "Alice", email: "alice@example.com" }]);
    expect(cal.conference_link).toBe("https://meet.google.com/abc");
  });

  test("tst_gts_gcal_002 all-day event → T00:00:00Z + defaults", () => {
    const cal = gcalEventToCalendarEvent({
      id: "evt_2",
      summary: "Holiday",
      start: { date: "2026-03-14" },
      end: { date: "2026-03-15" },
    });
    expect(cal.all_day).toBe(true);
    expect(cal.starts_at).toBe("2026-03-14T00:00:00Z");
    expect(cal.ends_at).toBe("2026-03-15T00:00:00Z");
    expect(cal.status).toBe("confirmed"); // default when absent
    expect(cal.description).toBeNull();
    expect(cal.attendees).toEqual([]);
  });

  test("tst_gts_gcal_003 missing summary → Untitled Event", () => {
    const cal = gcalEventToCalendarEvent({
      id: "evt_3",
      start: { dateTime: "2026-03-13T09:00:00Z" },
      end: { dateTime: "2026-03-13T09:30:00Z" },
    });
    expect(cal.title).toBe("Untitled Event");
  });
});

describe("meetings fetch", () => {
  test("tst_gts_gcal_004 cancelled skipped; envelope shape; window params", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      return ok({
        items: [
          basicEvent(),
          { ...basicEvent(), id: "evt_x", status: "cancelled" },
        ],
      });
    };
    const r = await fetchEventsPage("tok", undefined, {}, fetchFn);
    expect(r.envelopes).toHaveLength(1); // cancelled dropped
    const env0 = r.envelopes[0];
    if (env0 === undefined) throw new Error("meetings page: missing envelope 0");
    expect(env0.surface).toBe("meetings");
    expect(env0.kind).toBe("snapshot");
    expect(env0.remote_id).toBe("gcal:evt_1");
    expect(env0.payload.title).toBe("Team standup");

    const call0 = calls[0];
    if (call0 === undefined) throw new Error("meetings fetch: missing call 0");
    const url = new URL(call0);
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("orderBy")).toBe("startTime");
    expect(url.searchParams.get("maxResults")).toBe("250");
    // Default window: ~now-30d .. now+90d.
    const timeMin = Date.parse(url.searchParams.get("timeMin")!);
    const timeMax = Date.parse(url.searchParams.get("timeMax")!);
    expect(Math.abs(timeMin - (Date.now() - 30 * 86_400_000))).toBeLessThan(60_000);
    expect(Math.abs(timeMax - (Date.now() + 90 * 86_400_000))).toBeLessThan(60_000);
    // Explicit window override is honored.
    await fetchEventsPage(
      "tok",
      undefined,
      { time_min: "2026-01-01T00:00:00Z", time_max: "2026-02-01T00:00:00Z" },
      fetchFn,
    );
    const call1 = calls[1];
    if (call1 === undefined) throw new Error("meetings fetch: missing call 1");
    expect(new URL(call1).searchParams.get("timeMin")).toBe("2026-01-01T00:00:00Z");
  });

  test("tst_gts_gcal_005 cursor null on last page; discovered cumulative; NO total", async () => {
    const fetchFn: FetchLike = async (url) =>
      url.includes("pageToken=p2")
        ? ok({ items: [{ ...basicEvent(), id: "evt_2" }] })
        : ok({ items: [basicEvent()], nextPageToken: "p2" });

    const p1 = await fetchEventsPage("tok", undefined, {}, fetchFn);
    expect(p1.nextCursor).toEqual({ page_token: "p2", discovered: 1 });
    expect("total" in (p1.nextCursor ?? {})).toBe(false);
    expect(p1.discovered).toBe(1);

    const p2 = await fetchEventsPage("tok", p1.nextCursor, {}, fetchFn);
    expect(p2.nextCursor).toBeNull(); // last page → null (unlike email)
    expect(p2.discovered).toBe(2); // cumulative via cursor
  });
});
