// Meetings read helpers — ports the native domain adapter (types.rs):
// strict attendee parsing (malformed input is rejected, never silently
// repaired), read-time attendee→contact enrichment, RFC-3339 → date/time
// display, and the list-item builder.

import type { GraphService, RawEntity } from "@magnis/plugin-sdk";
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

/** A string facet field, treated as null when empty (native `.filter(!is_empty)`). */
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
/// absent), matching the native facet/snapshot serialization.
export function normalizeAttendees(attendees: CalendarAttendee[] | undefined): {
  name: string | null;
  email: string;
}[] {
  return (attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email }));
}

/// Parse the canonical `attendees` shape from a facet payload.
///
/// Attendees use ONE format = `CalendarAttendee[]`
/// (`{name?, email}`). Three explicit cases, strict NO FALLBACKS:
///   (a) field absent or `null`            → `[]` (valid empty state)
///   (b) valid array of `{name?, email}`   → parsed array
///   (c) present but malformed (missing required `email`, or a non-array,
///       incl. a legacy comma-string)      → THROW, naming the entity.
/// Case (c) must propagate to the caller (no log-and-`[]`).
export function parseAttendees(
  facetData: Data | undefined,
  entityId: string,
): CalendarAttendee[] {
  const raw = facetData?.attendees;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`malformed attendees facet for entity ${entityId}: expected an array`);
  }
  return raw.map((a) => {
    if (typeof a !== "object" || a === null || Array.isArray(a)) {
      throw new Error(`malformed attendees facet for entity ${entityId}: attendee is not an object`);
    }
    const email = (a as Data).email;
    if (typeof email !== "string") {
      throw new Error(`malformed attendees facet for entity ${entityId}: attendee missing email`);
    }
    const name = (a as Data).name;
    const out: CalendarAttendee = { email };
    if (typeof name === "string") out.name = name;
    return out;
  });
}

/// Resolve one email to the `contacts.person` it represents (or null): a guest
/// IS a contact. `email` → `email.address` (external id `email:address:{norm}`)
/// → inbound `has_email` link from a `contacts.person`. Read-time, so it covers
/// meetings whose attendee never went through the resolving trigger.
export async function resolveContactForEmail(
  graph: GraphService,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const addrId = await graph.find_by_external_id(`email:address:${normalized}`);
  if (!addrId) return null;
  const links = await graph.list_links_for_entity(addrId);
  for (const link of links) {
    if (link.kind !== "has_email" || link.to_id !== addrId) continue;
    const person = await graph.get_entity(link.from_id);
    if (person?.schema_id === "contacts.person") return person.id;
  }
  return null;
}

/// Resolve each raw attendee to its contact (or null), preserving order.
export async function enrichAttendees(
  graph: GraphService,
  raw: CalendarAttendee[],
): Promise<MeetingAttendeeView[]> {
  const out: MeetingAttendeeView[] = [];
  for (const a of raw) {
    const contact_id = await resolveContactForEmail(graph, a.email);
    out.push({ name: a.name ?? null, email: a.email, contact_id });
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

/// Build a list/detail base item from an entity + its details facet data +
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
