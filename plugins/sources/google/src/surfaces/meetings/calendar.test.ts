import { describe, expect, test } from "bun:test";
import {
  fetchEventsPage,
  gcalEventToCalendarEvent,
  type GcalEvent,
} from "./calendar";
import type { FetchLike, HttpResponse } from "../../http";
import { CursorExpiredError } from "@magnis/connector-sdk";

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
  /**
   * @test-id: tst_src_iso_google_005
   * @scenario: scn_google_pull_002
   * @covers: plugins/sources/google/src/surfaces/meetings/calendar.ts::fetchEventsPage
   * @deterministic: yes
   * @fixtures: two Calendar pages with one cancelled event and terminal sync token
   */
  test("tst_src_iso_google_005 full Calendar pass counts once and retains its terminal token", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      return url.includes("pageToken=p2")
        ? ok({ items: [{ ...basicEvent(), id: "evt_2" }], nextSyncToken: "sync-1" })
        : ok({ items: [basicEvent(), { id: "evt_x", status: "cancelled" }], nextPageToken: "p2" });
    };
    const p1 = await fetchEventsPage("tok", undefined, fetchFn);
    expect(p1.envelopes.map((e) => e.remote_id)).toEqual(["gcal:evt_1", "gcal:evt_x"]);
    expect(p1.envelopes[1]?.kind).toBe("delete");
    expect(p1.nextCursor).toEqual({ page_token: "p2", events_total: 1 });
    expect(p1.hasMore).toBe(true);
    const p2 = await fetchEventsPage("tok", p1.nextCursor, fetchFn);
    expect(p2.envelopes.map((e) => e.remote_id)).toEqual(["calendar", "gcal:evt_2"]);
    expect(p2.envelopes[0]?.payload).toEqual({ entity_type: "calendar", events_total: 2 });
    expect(p2.nextCursor).toEqual({ sync_token: "sync-1" });
    expect(p2.hasMore).toBe(false);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const params = new URL(call).searchParams;
      expect(params.get("singleEvents")).toBe("true");
      expect(params.get("showDeleted")).toBe("true");
      expect(params.has("timeMin")).toBe(false);
      expect(params.has("timeMax")).toBe(false);
      expect(params.has("orderBy")).toBe(false);
      expect(params.has("fields")).toBe(false);
    }
  });

  /**
   * @test-id: tst_src_iso_google_006
   * @scenario: scn_google_pull_002
   * @covers: plugins/sources/google/src/surfaces/meetings/calendar.ts::fetchEventsPage
   * @deterministic: yes
   * @fixtures: token poll, expired token, and missing terminal token
   */
  test("tst_src_iso_google_006 token poll returns only changes and 410 expires the cursor", async () => {
    let requested = "";
    const fetchFn: FetchLike = async (url) => {
      requested = url;
      return ok({ items: [basicEvent(), { id: "gone", status: "cancelled" }], nextSyncToken: "sync-2" });
    };
    const result = await fetchEventsPage("tok", { sync_token: "sync-1" }, fetchFn);
    expect(new URL(requested).searchParams.get("syncToken")).toBe("sync-1");
    expect(result.envelopes.map((e) => e.kind)).toEqual(["snapshot", "delete"]);
    expect(result.nextCursor).toEqual({ sync_token: "sync-2" });
    expect(result.hasMore).toBe(false);
    await expect(fetchEventsPage("tok", { sync_token: "expired" }, async () => ({
      ok: false, status: 410, headers: { get: () => null }, text: async () => "gone", json: async () => ({}),
    }))).rejects.toBeInstanceOf(CursorExpiredError);
    await expect(fetchEventsPage("tok", undefined, async () => ok({ items: [] })))
      .rejects.toThrow("nextSyncToken");
    await expect(fetchEventsPage("tok", undefined, async () => ok({ items: [{ ...basicEvent(), start: { dateTime: "invalid" } }], nextSyncToken: "s" })))
      .rejects.toThrow("bad datetime");
  });
});
