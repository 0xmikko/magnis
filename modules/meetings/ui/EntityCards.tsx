import { useContext, type JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical meeting card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (title + when/location/attendees count)
 * and expanded (full attendees list + agenda + notes) from the same
 * payload.
 */

/**
 * Render-time mapper that accepts the canonical `CalendarAttendee[]`
 * shape (`{name?, email}`) OR a bare `string[]` (some legacy agent
 * fixtures pass scalars). Returns the display string per attendee —
 * `name ?? email` for objects, the string itself for strings. Anything
 * else is dropped. The renderer can't see the typed wire shape (its
 * input is `Readonly<Record<string, unknown>>`), so this is a
 * presentation-layer normalizer, not a data fallback.
 */
function attendeesToDisplayList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): string[] => {
    if (typeof v === "string" && v.length > 0) return [v];
    if (
      typeof v === "object" &&
      v !== null &&
      "email" in v &&
      typeof (v as { email: unknown }).email === "string"
    ) {
      const obj = v as { name?: unknown; email: string };
      const name = typeof obj.name === "string" && obj.name.length > 0 ? obj.name : null;
      return [name ?? obj.email];
    }
    return [];
  });
}

/** The generic context card carries attendees as `attendee` EDGES — email is
 * the address node's name, the invite's display name rides the edge
 * dictionary. Presentation-layer read of the neighbour list. */
function attendeesFromNeighbours(data: Readonly<Record<string, unknown>>): string[] {
  const raw: unknown = data.neighbours;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const n of raw as readonly unknown[]) {
    if (n === null || typeof n !== "object" || Array.isArray(n)) continue;
    const rec = n as Record<string, unknown>;
    if (rec.kind !== "attendee") continue;
    const meta = rec.metadata;
    const display =
      meta !== null && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).display_name
        : undefined;
    if (typeof display === "string" && display.length > 0) out.push(display);
    else if (typeof rec.name === "string" && rec.name.length > 0) out.push(rec.name);
  }
  return out;
}

function allAttendees(data: Readonly<Record<string, unknown>>): string[] {
  const fromArray = attendeesToDisplayList(data.attendees);
  return fromArray.length > 0 ? fromArray : attendeesFromNeighbours(data);
}

/** `starts_at` is the dictionary's ISO timestamp; date/time split is view
 * work (the old backend card did this — it is the client's job now). */
function splitStartsAt(data: Readonly<Record<string, unknown>>): {
  date: string | undefined;
  time: string | undefined;
} {
  const raw = data.starts_at;
  if (typeof raw !== "string" || raw.length === 0) return { date: undefined, time: undefined };
  const t = raw.indexOf("T");
  if (t === -1) return { date: raw, time: undefined };
  const timePart = raw.slice(t + 1).split(/[+Z.]/)[0];
  return { date: raw.slice(0, t), time: timePart };
}

function description(data: Readonly<Record<string, unknown>>): string | undefined {
  const d = data.description;
  return typeof d === "string" && d.length > 0 ? d : undefined;
}

function agenda(data: Readonly<Record<string, unknown>>): string | undefined {
  const a = data.agenda;
  return typeof a === "string" && a.length > 0 ? a : undefined;
}

/**
 * Chevron shows when the meeting has fields beyond the 2-line collapsed row:
 * description, agenda, or an attendee list (collapsed only displays a count).
 */
export function meetingHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return (
    description(data) !== undefined ||
    agenda(data) !== undefined ||
    allAttendees(data).length > 0
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-content">{value}</span>
    </div>
  );
}

export function MeetingCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const title =
    (data.title as string | undefined) ?? (data.name as string | undefined);
  const fromDict = splitStartsAt(data);
  const date = (data.date as string | undefined) ?? fromDict.date;
  const time = (data.time as string | undefined) ?? fromDict.time;
  const location = data.location as string | undefined;
  const attendees = allAttendees(data);
  const { expanded } = useContext(ExpansionContext);

  const dateTime = [date, time].filter(Boolean).join(" · ");
  const attendeeCount = attendees.length;
  const desc = description(data);
  const ag = agenda(data);

  const rows: { label: string; value: string }[] = [];
  if (dateTime) rows.push({ label: "When", value: dateTime });
  if (location) rows.push({ label: "Location", value: location });
  if (attendees.length > 0) rows.push({ label: "Attendees", value: attendees.join(", ") });
  if (ag) rows.push({ label: "Agenda", value: ag });
  if (desc) rows.push({ label: "Notes", value: desc });

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {title ?? "Untitled Meeting"}
        </span>
        {!expanded && (
          <div className="mt-0.5 flex items-baseline gap-2 text-[11px] text-content-tertiary">
            {dateTime && <span>{dateTime}</span>}
            {location && (
              <span className="truncate">
                <Icon name="map-pin" size={10} className="mr-0.5 inline-block align-baseline" />
                {location}
              </span>
            )}
            {attendeeCount > 0 && <span className="shrink-0">{attendeeCount} attendees</span>}
          </div>
        )}
        {expanded && rows.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {rows.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
