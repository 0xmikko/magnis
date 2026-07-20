// Remote-id builder for the `meetings` surface (Google Calendar events).
// Encodes the idempotency key the meetings module ingest dedups on.

/** Calendar event → stable remote_id (`gcal:{event_id}`). */
export const calendarRemoteId = (eventId: string): string => `gcal:${eventId}`;
