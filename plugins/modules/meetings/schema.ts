// Meetings plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Calendar-event entity schema (the list/get read surface). */
export const CAL = "meetings.calendar_event";
/** Single-aligned calendar-event details facet (starts_at/ends_at/location/…). */
export const CAL_DETAILS = "meetings.calendar_event.details";
/** Legacy `meetings.event` schema — the native search quirk searches over it. */
export const EVENT = "meetings.event";
/** Manually-created meeting entity schema (new_meeting write path). */
export const MEETING = "meetings.meeting";
