// x connector — shared surface set + payload tag. Per-surface remote-id builders
// live inside each surface folder (surfaces/<name>/schema.ts). `PLATFORM` is the
// payload platform tag; the SURFACE_* consts are the wire surface names
// (advertised in initialize, routed in the connector's fetch switch).

/** Payload platform tag (`payload.platform`). */
export const PLATFORM = "x";

/** Wire surface: tracked profiles + their recent posts. */
export const SURFACE_X = "x";
/** Wire surface: the following import as social_contact envelopes. */
export const SURFACE_CONTACTS = "contacts";
