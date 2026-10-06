// Shared schema→type maps for the meetings plugin (single source of truth for
// module/service.ts + ui/). Record schema_id → payload type; canonical key →
// value. Read DTOs are byte-compatible with the native module (types.rs
// MeetingListItem / MeetingDetailView); the UI imports them from here.
import type { LinkedEntitySummary } from "@magnis/sdk";

/** One stored calendar-event record — the provider's dictionary MINUS the
 * attendees, which are the event's `attendee` edges. `entities.ts` declares
 * exactly this and the build proves the two are one type. */
export interface MeetingCalendarEventDetails {
  source_id?: string;
  account_id?: string;
  sync_pass?: string;
  /** The provider's own event id, written verbatim by ingest. */
  id?: string;
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string | null;
  all_day?: boolean;
  google_event_id?: string | null;
  hangout_link?: string | null;
  calendar_id?: string | null;
  conference_link?: string | null;
  updated_at?: string;
}

export interface MeetingEventDetails {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  status?: string | null;
  all_day?: boolean;
}

/** Record schema_id → payload type (parameterizes GraphService). */

/** Canonical key → value (parameterizes GraphService). */
export interface MeetingsCanonical {
  "calendar_event.title": string | null;
  "calendar_event.starts_at": string | null;
  "calendar_event.ends_at": string | null;
  "calendar_event.location": string | null;
  "calendar_event.description": string | null;
  "calendar_event.attendees": unknown;
  "calendar_event.status": string | null;
  "event.title": string | null;
  "event.starts_at": string | null;
  "event.ends_at": string | null;
  "event.location": string | null;
  "event.status": string | null;
}

// ── domain DTOs ───────────────────────────────────────────────────

/** A calendar attendee (`{name?, email}`) — native CalendarAttendee. */
export interface CalendarAttendee {
  name?: string;
  email: string;
}

/** An attendee resolved to the contact it represents (read-time). */
export interface MeetingAttendeeView {
  name: string | null;
  email: string;
  contactId: string | null;
}

/** Operator/agent-driven `meetings.create` params (native NewMeetingParams). */
export interface NewMeetingParams {
  title: string;
  starts_at: string;
  ends_at: string;
  attendees?: CalendarAttendee[];
  description?: string;
  location?: string;
  client_id?: string;
}


export interface MeetingListItem {
  id: string;
  schemaId: string;
  title: string;
  date: string | null;
  time: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  description: string | null;
  conferenceLink: string | null;
  attendees: MeetingAttendeeView[];
  createdAt: string;
}

export interface MeetingDetailView {
  id: string;
  schemaId: string;
  title: string;
  date: string | null;
  time: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  description: string | null;
  conferenceLink: string | null;
  attendees: MeetingAttendeeView[];
  canonical: Record<string, unknown>;
  linkedEntities: LinkedEntitySummary[];
  createdAt: string;
}

// ── tool params ───────────────────────────────────────────────────

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface GetParams {
  id: string;
}

/** Agent search tool params (shared::search_entities, shared.rs:447). */
export interface SearchParams {
  query?: string;
  context?: string;
  limit?: number;
}

/** MCP tool result envelope (mirrors services/tools ToolResult). */
export interface ToolResult {
  content: { type: "text"; text: string }[];
}
