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
    // The calendar envelope first (the ids-only pass counted one confirmed
    // event), then the one event; the cancelled one is dropped and not counted.
    expect(r.envelopes.map((e) => e.remote_id)).toEqual(["calendar", "gcal:evt_1"]);
    expect(r.envelopes[0]?.payload).toEqual({ entity_type: "calendar", events_total: 1 });
    const env0 = r.envelopes[1];
    if (env0 === undefined) throw new Error("meetings page: missing envelope 1");
    expect(env0.surface).toBe("meetings");
    expect(env0.kind).toBe("snapshot");
    expect(env0.remote_id).toBe("gcal:evt_1");
    expect(env0.payload.title).toBe("Team standup");

    // The ids-only pass over the same window comes first, then the page.
    const call0 = calls[0];
    if (call0 === undefined) throw new Error("meetings fetch: missing call 0");
    const ids = new URL(call0);
    expect(ids.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(ids.searchParams.get("fields")).toBe("nextPageToken,items(id,status)");
    expect(ids.searchParams.get("maxResults")).toBe("2500");
    expect(ids.searchParams.get("singleEvents")).toBe("true");
    const call1 = calls[1];
    if (call1 === undefined) throw new Error("meetings fetch: missing call 1");
    const url = new URL(call1);
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("orderBy")).toBe("startTime");
    expect(url.searchParams.get("maxResults")).toBe("250");
    expect(url.searchParams.get("timeMin")).toBe(ids.searchParams.get("timeMin"));
    expect(url.searchParams.get("timeMax")).toBe(ids.searchParams.get("timeMax"));
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
    const call2 = calls[2];
    if (call2 === undefined) throw new Error("meetings fetch: missing call 2");
    expect(new URL(call2).searchParams.get("timeMin")).toBe("2026-01-01T00:00:00Z");
  });

  /** @test-id: tst_gts_gcal_005
   * @scenario: scn_google_sync_001
   * @covers: fetchEventsPage ids-only count, calendar envelope, cursor
   * @deterministic: yes
   * @fixtures: an ids-only pass of two pages counting three events, one cancelled; two event pages, one event that fails to convert
   */
  test("tst_gts_gcal_005 the calendar states its count from one ids-only pass on the first page; cursor null on the last page; no counters", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes("fields=")) {
        return url.includes("pageToken=ids2")
          ? ok({ items: [{ id: "evt_2", status: "confirmed" }, { id: "evt_x", status: "cancelled" }] })
          : ok({ items: [{ id: "evt_1", status: "confirmed" }, { id: "evt_bad" }], nextPageToken: "ids2" });
      }
      return url.includes("pageToken=p2")
        ? ok({ items: [{ ...basicEvent(), id: "evt_2" }] })
        : ok({ items: [basicEvent(), { id: "evt_bad", start: { dateTime: "not a moment" } }], nextPageToken: "p2" }); // evt_bad fails to convert
    };

    const p1 = await fetchEventsPage("tok", undefined, {}, fetchFn);
    expect(p1.envelopes.map((e) => e.remote_id)).toEqual(["calendar", "gcal:evt_1"]);
    // Three ids answered the pass, one cancelled: two events; the page left one out.
    expect(p1.envelopes[0]?.payload).toEqual({ entity_type: "calendar", events_total: 3, skipped: 1 });
    expect(p1.nextCursor).toEqual({ page_token: "p2" });
    expect("discovered" in p1).toBe(false);
    expect(calls.filter((u) => u.includes("fields=")).length).toBe(2);

    const p2 = await fetchEventsPage("tok", p1.nextCursor, {}, fetchFn);
    // A later page counts nothing again.
    expect(calls.filter((u) => u.includes("fields=")).length).toBe(2);
    expect(p2.envelopes.map((e) => e.remote_id)).toEqual(["gcal:evt_2"]);
    expect(p2.nextCursor).toBeNull(); // last page → null (unlike email)
  });
});
