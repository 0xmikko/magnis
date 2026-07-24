// Meetings surface: Google Calendar REST client + canonical conversion —
// twin of plugins/sources/google/src/calendar.rs.
//
// Each meetings envelope's `payload` is a full CalendarEvent serialization
// (NOT flattened) and `remote_id` is `gcal:{event_id}`.

import type { Envelope } from "@magnis/connector-sdk";
import { checkRateLimit, fetchWithRetry, type FetchLike } from "../../http";
import { formatUtc } from "../../helpers";
import {
  mergeProgress,
  progressCursor,
  type WindowFetchResult,
} from "../../progress";
import { calendarRemoteId } from "./schema";
import {
  asObject,
  optObject,
  optObjectArray,
  optString,
  reqString,
} from "../../validate";

// ── Raw Google Calendar API shapes (camelCase, as served) ─────

interface GcalDateTime {
  dateTime?: string | null;
  date?: string | null;
}

export interface GcalEvent {
  id: string;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  start?: GcalDateTime | null;
  end?: GcalDateTime | null;
  attendees?: { email?: string | null; displayName?: string | null }[] | null;
  hangoutLink?: string | null;
}

interface GcalEventsResponse {
  items?: GcalEvent[] | null;
  nextPageToken?: string | null;
}

// ── Response parser (serde parity — see validate.ts) ──────────

/** `GcalDateTime` (calendar.rs:42) — both fields `Option<String>`. */
function parseGcalDateTime(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): GcalDateTime | null {
  const dt = optObject(o, field, ctx);
  if (dt === null) return null;
  const c = `${ctx}.${field}`;
  return {
    dateTime: optString(dt, "dateTime", c),
    date: optString(dt, "date", c),
  };
}

/** `GcalEventsResponse` (calendar.rs:21) — both fields `Option<_>`, but each
 * `GcalEvent.id` (calendar.rs:29) is required; every other event field is
 * `Option<_>`, as is every `GcalAttendee` field (calendar.rs:49). */
function parseGcalEventsResponse(v: unknown): GcalEventsResponse {
  const ctx = "GcalEventsResponse";
  const o = asObject(v, ctx);
  const items = optObjectArray(o, "items", ctx);
  return {
    items:
      items === null
        ? null
        : items.map((ev, i) => {
            const c = `${ctx}.items[${String(i)}]`;
            const attendees = optObjectArray(ev, "attendees", c);
            return {
              id: reqString(ev, "id", c),
              summary: optString(ev, "summary", c),
              description: optString(ev, "description", c),
              location: optString(ev, "location", c),
              status: optString(ev, "status", c),
              start: parseGcalDateTime(ev, "start", c),
              end: parseGcalDateTime(ev, "end", c),
              attendees:
                attendees === null
                  ? null
                  : attendees.map((a, j) => ({
                      email: optString(a, "email", `${c}.attendees[${String(j)}]`),
                      displayName: optString(
                        a,
                        "displayName",
                        `${c}.attendees[${String(j)}]`,
                      ),
                    })),
              hangoutLink: optString(ev, "hangoutLink", c),
            };
          }),
    nextPageToken: optString(o, "nextPageToken", ctx),
  };
}

// ── Canonical CalendarEvent shape ─────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string;
  attendees: { name: string | null; email: string }[];
  conference_link: string | null;
}

// ── GcalEvent → CalendarEvent conversion (ported) ─────────────

function resolveDatetime(
  dt: GcalDateTime | null | undefined,
): [string, boolean] {
  if (dt?.dateTime !== null && dt?.dateTime !== undefined) {
    const t = Date.parse(dt.dateTime);
    if (Number.isNaN(t)) throw new Error(`bad datetime '${dt.dateTime}'`);
    return [formatUtc(new Date(t)), false];
  }
  if (dt?.date !== null && dt?.date !== undefined) {
    // All-day event: "2026-03-01" → midnight UTC.
    const iso = `${dt.date}T00:00:00Z`;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) throw new Error(`bad date '${dt.date}'`);
    return [formatUtc(new Date(t)), true];
  }
  return [formatUtc(new Date()), false];
}

export function gcalEventToCalendarEvent(ev: GcalEvent): CalendarEvent {
  const [startsAt, allDay] = resolveDatetime(ev.start);
  const [endsAt] = resolveDatetime(ev.end);

  const attendees = (ev.attendees ?? []).flatMap((a) =>
    a.email !== null && a.email !== undefined ? [{ name: a.displayName ?? null, email: a.email }] : [],
  );

  return {
    id: ev.id,
    title: ev.summary ?? "Untitled Event",
    description: ev.description ?? null,
    location: ev.location ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    status: ev.status ?? "confirmed",
    attendees,
    conference_link: ev.hangoutLink ?? null,
  };
}

// ── REST client + fetch logic ─────────────────────────────────

async function listEventsPage(
  token: string,
  timeMin: string,
  timeMax: string,
  pageToken: string | undefined,
  fetchFn: FetchLike,
): Promise<GcalEventsResponse> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  if (pageToken !== undefined) params.set("pageToken", pageToken);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;

  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Calendar list events failed: ${await resp.text()}`);
  }
  return parseGcalEventsResponse(await resp.json());
}

export interface EventsWindow {
  time_min?: string;
  time_max?: string;
}

const DAY_MS = 86_400_000;

/** Bootstrap/catch-up events fetch. Window defaults to now-30d..now+90d,
 * overridable via `window.time_min` / `window.time_max`. Cancelled events are
 * skipped. No cheap total estimate → cumulative `discovered` only;
 * `nextCursor` is null on the last page. */
export async function fetchEventsPage(
  token: string,
  cursor: unknown,
  window: EventsWindow,
  fetchFn: FetchLike,
): Promise<WindowFetchResult> {
  const timeMin =
    window.time_min ?? new Date(Date.now() - 30 * DAY_MS).toISOString();
  const timeMax =
    window.time_max ?? new Date(Date.now() + 90 * DAY_MS).toISOString();

  const c =
    cursor !== null && typeof cursor === "object"
      ? (cursor as Record<string, unknown>)
      : undefined;
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;

  const page = await listEventsPage(token, timeMin, timeMax, pageToken, fetchFn);

  const envelopes: Envelope[] = [];
  for (const ev of page.items ?? []) {
    if (ev.status === "cancelled") continue;
    let calEvent: CalendarEvent;
    try {
      calEvent = gcalEventToCalendarEvent(ev);
    } catch (e) {
      console.error(
        `magnis-google: failed to convert calendar event ${ev.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    envelopes.push({
      surface: "meetings",
      payload: calEvent as unknown as Record<string, unknown>,
      remote_id: calendarRemoteId(ev.id),
      kind: "snapshot",
    });
  }

  const progress = progressCursor(cursor, envelopes.length, undefined);

  let nextCursor: Record<string, unknown> | null = null;
  if (typeof page.nextPageToken === "string") {
    nextCursor = { page_token: page.nextPageToken };
    mergeProgress(nextCursor, progress);
  }

  return { envelopes, nextCursor, discovered: progress.discovered };
}
