// Meetings surface: Google Calendar REST client + canonical conversion —
// twin of sources/google/src/calendar.rs.
//
// Each meetings envelope's `payload` is a full CalendarEvent serialization
// (NOT flattened) and `remote_id` is `gcal:{event_id}`.

import { CursorExpiredError, type Envelope } from "@magnis/connector-sdk";
import { checkRateLimit, fetchWithRetry, type FetchLike } from "../../http";
import { formatUtc } from "../../helpers";
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
  nextSyncToken?: string | null;
}

/** One page of a full Calendar pass or a token-based change poll. */
export interface EventsFetchResult {
  envelopes: Envelope[];
  nextCursor: Record<string, unknown>;
  hasMore: boolean;
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
    nextSyncToken: optString(o, "nextSyncToken", ctx),
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
  throw new Error("Calendar event missing start or end datetime");
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
  syncToken: string | undefined,
  pageToken: string | undefined,
  fetchFn: FetchLike,
): Promise<GcalEventsResponse> {
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
  });
  if (syncToken !== undefined) params.set("syncToken", syncToken);
  if (pageToken !== undefined) params.set("pageToken", pageToken);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;

  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (resp.status === 410) throw new CursorExpiredError("Calendar syncToken expired (410)");
  if (!resp.ok) {
    throw new Error(`Calendar list events failed: ${await resp.text()}`);
  }
  return parseGcalEventsResponse(await resp.json());
}

/** A full pass counts non-cancelled events while paging, then states the exact
 * total at its terminal syncToken. Later polls pass only the retained token.
 * @tested-by: tst_src_iso_google_005, tst_src_iso_google_006 */
export async function fetchEventsPage(
  token: string,
  cursor: unknown,
  fetchFn: FetchLike,
): Promise<EventsFetchResult> {
  const c =
    cursor !== null && typeof cursor === "object"
      ? (cursor as Record<string, unknown>)
      : undefined;
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;
  const syncToken = typeof c?.sync_token === "string" ? c.sync_token : undefined;
  const previousTotal = typeof c?.events_total === "number" ? c.events_total : 0;
  const page = await listEventsPage(token, syncToken, pageToken, fetchFn);

  const envelopes: Envelope[] = [];
  let total = previousTotal;
  for (const ev of page.items ?? []) {
    if (ev.status === "cancelled") {
      envelopes.push({ surface: "meetings", payload: {}, remote_id: calendarRemoteId(ev.id), kind: "delete" });
      continue;
    }
    const calEvent = gcalEventToCalendarEvent(ev);
    if (syncToken === undefined) total += 1;
    envelopes.push({
      surface: "meetings",
      payload: calEvent as unknown as Record<string, unknown>,
      remote_id: calendarRemoteId(ev.id),
      kind: "snapshot",
    });
  }
  // @tested-by: tst_src_iso_google_005, tst_src_iso_google_006
  const hasMore = typeof page.nextPageToken === "string";
  if (hasMore) {
    const nextCursor: Record<string, unknown> = { page_token: page.nextPageToken };
    if (syncToken !== undefined) nextCursor.sync_token = syncToken;
    else nextCursor.events_total = total;
    return { envelopes, nextCursor, hasMore };
  }
  if (page.nextSyncToken === null || page.nextSyncToken === undefined || page.nextSyncToken === "") {
    throw new Error("Calendar terminal page missing nextSyncToken");
  }
  if (syncToken === undefined) {
    envelopes.unshift({ surface: "meetings", kind: "snapshot", remote_id: "calendar", payload: { entity_type: "calendar", events_total: total } });
  }
  return { envelopes, nextCursor: { sync_token: page.nextSyncToken }, hasMore };
}
