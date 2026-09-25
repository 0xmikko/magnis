// Meetings read helpers — ports the native domain adapter (types.rs):
// strict attendee parsing (malformed input is rejected, never silently
// repaired), read-time attendee→contact enrichment over the `attendee` edges,
// RFC-3339 → date/time display, and the list-item builder.

import type { GraphService, LinkSummary, RawEntity } from "@magnis/plugin-sdk";
import type {
  CalendarAttendee,
  MeetingAttendeeView,
  MeetingListItem,
} from "../types.ts";

export type Data = Record<string, unknown>;

export const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/** A string record field, treated as null when empty (native `.filter(!is_empty)`). */
const nonEmpty = (d: Data, k: string): string | null => str(d, k);

/// Strict RFC-3339 parse (mirrors native chrono parse_from_rfc3339): returns the
/// epoch ms, or null if the string isn't a well-formed RFC-3339 timestamp. JS
/// `Date.parse` alone is too lenient, so gate on the canonical shape first.
export function parseRfc3339(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/// Normalize attendees to the canonical `{name, email}` shape (name → null when
/// absent), matching the native record/snapshot serialization.
export function normalizeAttendees(attendees: CalendarAttendee[] | undefined): {
  name: string | null;
  email: string;
}[] {
  return (attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email }));
}

/// Parse the canonical `attendees` shape from a sync payload (the ingest write
/// path — the read path goes through the edges, not this).
///
/// Attendees use ONE format = `CalendarAttendee[]`
/// (`{name?, email}`). Three explicit cases, strict NO FALLBACKS:
///   (a) field absent or `null`            → `[]` (valid empty state)
///   (b) valid array of `{name?, email}`   → parsed array
///   (c) present but malformed (missing required `email`, or a non-array,
///       incl. a legacy comma-string)      → THROW, naming the entity.
/// Case (c) must propagate to the caller (no log-and-`[]`).
export function parseAttendees(
  payload: Data | undefined,
  entityId: string,
): CalendarAttendee[] {
  const raw = payload?.attendees;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`malformed attendees for entity ${entityId}: expected an array`);
  }
  return raw.map((a) => {
    if (typeof a !== "object" || a === null || Array.isArray(a)) {
      throw new Error(`malformed attendees for entity ${entityId}: attendee is not an object`);
    }
    const email = (a as Data).email;
    if (typeof email !== "string") {
      throw new Error(`malformed attendees for entity ${entityId}: attendee missing email`);
    }
    const name = (a as Data).name;
    const out: CalendarAttendee = { email };
    if (typeof name === "string") out.name = name;
    return out;
  });
}

/// The event's attendees, read from its `attendee` edges (plan §6): the edge
/// ends at the shared `email.address` node, and the display name the invite
/// carried rides the edge dictionary — the address node is shared by every
/// event, so a per-invite name could never live on it.
export async function enrichAttendees(
  graph: GraphService,
  eventId: string,
  links?: LinkSummary[],
): Promise<MeetingAttendeeView[]> {
  const page = await attendeesForPage(graph, [eventId], links ? { [eventId]: links } : undefined);
  return page.get(eventId) ?? [];
}

/// The PAGE-level twin (S6 review): a whole window's attendees in FOUR fixed
/// crossings — event edges, address nodes, address identity edges, persons —
/// where the per-row shape did one edge read per event plus up to three
/// crossings per attendee.
export async function attendeesForPage(
  graph: GraphService,
  eventIds: string[],
  prefetched?: Record<string, LinkSummary[]>,
): Promise<Map<string, MeetingAttendeeView[]>> {
  const out = new Map<string, MeetingAttendeeView[]>();
  if (eventIds.length === 0) return out;
  const eventSet = new Set(eventIds);
  const edges = (
    prefetched
      ? Object.values(prefetched).flat()
      : await graph.list_links_for_entities(eventIds)
  ).filter((l) => l.kind === "attendee" && eventSet.has(l.from_id));
  if (edges.length === 0) return out;

  const addressIds = [...new Set(edges.map((e) => e.to_id))];
  const addresses = await graph.get_entities(addressIds);
  const addressById = new Map(addresses.map((a) => [a.id, a]));

  // One batch of the addresses' inbound identity edges, one batch of persons.
  const identityEdges = (await graph.list_links_for_entities(addressIds)).filter(
    (l) => l.kind === "identity" && addressById.has(l.to_id),
  );
  const personIds = [...new Set(identityEdges.map((l) => l.from_id))];
  const persons = personIds.length === 0 ? [] : await graph.get_entities(personIds);
  const personById = new Map(persons.map((p) => [p.id, p]));
  const contactByAddress = new Map<string, string>();
  for (const edge of identityEdges) {
    const person = personById.get(edge.from_id);
    if (person?.schema_id === "contacts.person" && !contactByAddress.has(edge.to_id)) {
      contactByAddress.set(edge.to_id, person.id);
    }
  }

  for (const edge of edges) {
    const addr = addressById.get(edge.to_id);
    if (!addr) continue;
    const meta = (edge.metadata ?? {}) as Data;
    const arr = out.get(edge.from_id) ?? [];
    arr.push({
      name: str(meta, "display_name"),
      email: str(addr.properties ?? {}, "address") ?? addr.name,
      contact_id: contactByAddress.get(addr.id) ?? null,
    });
    out.set(edge.from_id, arr);
  }
  return out;
}

/// RFC-3339 → (date "YYYY-MM-DD", time "HH:MM - HH:MM"). Mirrors native
/// format_date_time: the wall-clock time AS WRITTEN in the timestamp's own
/// offset (chrono parse_from_rfc3339 + %H:%M). Extract straight from the string
/// rather than via Date() so the host timezone can't shift the displayed time.
export function formatDateTime(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): { date: string | null; time: string | null } {
  const startM = typeof startsAt === "string"
    ? (/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(startsAt))
    : null;
  const date = startM ? (startM.at(1) ?? null) : null;
  const startTime = startM ? (startM.at(2) ?? null) : null;
  const endM = typeof endsAt === "string" ? (/T(\d{2}:\d{2})/.exec(endsAt)) : null;
  const endTime = endM ? (endM.at(1) ?? null) : null;

  let time: string | null;
  if (startTime && endTime) time = `${startTime} - ${endTime}`;
  else if (startTime) time = startTime;
  else time = null;

  return { date, time };
}

/// Build a list/detail base item from an entity + its details record data +
/// already-enriched attendees. Native title default = "Untitled Meeting".
export function buildListItem(
  entity: RawEntity,
  d: Data,
  attendees: MeetingAttendeeView[],
): MeetingListItem {
  const { date, time } = formatDateTime(
    str(d, "starts_at") ?? undefined,
    str(d, "ends_at") ?? undefined,
  );
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    title: entity.name && entity.name.length > 0 ? entity.name : "Untitled Meeting",
    date,
    time,
    starts_at: str(d, "starts_at"),
    ends_at: str(d, "ends_at"),
    location: nonEmpty(d, "location"),
    description: nonEmpty(d, "description"),
    conference_link: nonEmpty(d, "conference_link"),
    attendees,
    created_at: entity.created_at ?? "",
  };
}
