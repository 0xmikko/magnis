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
// eslint-disable-next-line react-refresh/only-export-components
export function meetingHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return (
    description(data) !== undefined ||
    agenda(data) !== undefined ||
    attendeesToDisplayList(data.attendees).length > 0
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
  const title = data.title as string | undefined;
  const date = data.date as string | undefined;
  const time = data.time as string | undefined;
  const location = data.location as string | undefined;
  const attendees = attendeesToDisplayList(data.attendees);
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
