/** What meetings' two entities ARE, and how each is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * The attendees are NOT in the calendar event's dictionary: they are its
 * `attendee` edges, and the invite's per-event display name rides the edge
 * while the address rides the node.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type { MeetingCalendarEventDetails, MeetingEventDetails } from "./types.ts";

export const calendarEvent = entity(
  {
    id: "meetings.calendar_event",
    name: "Calendar event",
    description: "A calendar event / meeting entity owned by the meetings plugin.",
    roles: ["event"],
    triggerable: true,
  },
  {
    id: z.string().optional(),
    title: z.string().nullish(),
    starts_at: moment().nullish(),
    ends_at: moment().nullish(),
    location: z.string().nullish(),
    description: z.string().nullish(),
    status: z.string().nullish(),
    all_day: z.boolean().optional(),
    google_event_id: z.string().nullish(),
    hangout_link: z.string().nullish(),
    calendar_id: z.string().nullish(),
    conference_link: z.string().nullish(),
    updated_at: moment().optional(),
  },
  { order: ["starts_at", "desc"], title: "title", body: "description" },
) satisfies z.ZodType<MeetingCalendarEventDetails>;

const _calendarIsTheModulesOwnType: AssertEqual<
  z.infer<typeof calendarEvent>,
  MeetingCalendarEventDetails
> = true;
void _calendarIsTheModulesOwnType;

/** The entity `meetings.search` reads and no path writes. It keeps its
 * registration — a schema the module searches by id cannot be unregistered —
 * and the shape is the one the module's own reader expects. */
export const event = entity(
  {
    id: "meetings.event",
    name: "Event",
    description: "A general event entity owned by the meetings plugin.",
  },
  {
    title: column("name", z.string()),
    description: z.string().nullish(),
    starts_at: moment(),
    ends_at: moment().nullish(),
    location: z.string().nullish(),
    status: z.string().nullish(),
    all_day: z.boolean().optional(),
  },
  { order: ["starts_at", "desc"], title: "title", body: "description" },
) satisfies z.ZodType<MeetingEventDetails>;

const _eventIsTheModulesOwnType: AssertEqual<z.infer<typeof event>, MeetingEventDetails> = true;
void _eventIsTheModulesOwnType;
