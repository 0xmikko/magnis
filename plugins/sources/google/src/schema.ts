// google connector — surface set + remote-id scheme, in one place. The
// remote-id builders were duplicated between the live fetchers (calendar.ts /
// contacts.ts) and the fixture replay path (fixture.ts); the surface list was an
// inline array in connector.ts. Centralizing them spells the idempotency keys
// (INV-4) exactly ONE way. (email's remote_id is the bare Gmail message id — no
// prefix — so there is no builder for it.)

/** Surfaces this connector feeds — advertised in `initialize`, routed in the
 *  fetch switch. */
export const SURFACES = ["email", "meetings", "contacts"];

/** Calendar event → stable remote_id (`gcal:{event_id}`). */
export const calendarRemoteId = (eventId: string): string => `gcal:${eventId}`;

/** People connection → stable remote_id (`gpeople:{stable_hash}`), so dedup
 *  survives a display-name change. */
export const contactRemoteId = (stableId: string): string => `gpeople:${stableId}`;
