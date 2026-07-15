// Shared schema→type maps for the meetings plugin (single source of truth for
// module/service.ts + ui/). Facet schema_id → payload type; canonical key →
// value. Read DTOs are byte-compatible with the native module (types.rs
// MeetingListItem / MeetingDetailView) and the UI's plugins/meetings/ui copies.

export interface MeetingCalendarEventDetails {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string | null;
  attendees?: unknown;
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

/** Facet schema_id → payload type (parameterizes GraphService). */
export interface MeetingsFacets {
  "meetings.calendar_event.details": MeetingCalendarEventDetails;
  "meetings.event.details": MeetingEventDetails;
}

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
  contact_id: string | null;
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

export interface FacetSummary {
  id: string;
  schema_id: string;
  source: string;
  observed_at: string;
  data: unknown;
}

export interface LinkedEntitySummary {
  id: string;
  name: string | null;
  schema_id: string;
  link_kind: string;
  created_at: string;
  data?: Record<string, unknown> | null;
}

export interface MeetingListItem {
  id: string;
  schema_id: string;
  title: string;
  date: string | null;
  time: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  description: string | null;
  conference_link: string | null;
  attendees: MeetingAttendeeView[];
  created_at: string;
}

export interface MeetingDetailView {
  id: string;
  schema_id: string;
  title: string;
  date: string | null;
  time: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  description: string | null;
  conference_link: string | null;
  attendees: MeetingAttendeeView[];
  canonical: Record<string, unknown>;
  facets: FacetSummary[];
  linked_entities: LinkedEntitySummary[];
  created_at: string;
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

export interface SearchResultItem {
  id: string;
  name: string | null;
  schema_id: string;
  schema_version: number;
}

/** MCP tool result envelope (mirrors services/tools ToolResult). */
export interface ToolResult {
  content: { type: "text"; text: string }[];
}

// ── sync ────────────────────────────────────────────────────────

/** A source envelope handed to the @syncHandler (mirrors Rust SourceEnvelope). */
export interface SyncEnvelope {
  source_id: string;
  surface: string;
  account_id: string;
  user_id: string;
  kind: string;
  remote_id?: string;
  cursor?: unknown;
  payload: Record<string, unknown>;
  timestamp: string;
}

/// A trigger.check the host bridge forwards to the event_bus for LIVE calendar
/// events (mirrors native ingest's `new_meeting` event). Snapshot/delete emit
/// none. `schema_id` keeps the native value "meetings.meeting" verbatim.
export interface MeetingTriggerCheck {
  type: "trigger.check";
  event_kind: "new_meeting";
  schema_id: "meetings.meeting";
  entity_id: string;
  phase: "live";
  touched_entity_ids: string[];
  user_id: string;
  context: { title: string | null; remote_id: string | null };
}
