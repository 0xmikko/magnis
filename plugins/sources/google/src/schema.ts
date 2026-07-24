// google connector — shared surface set. The per-surface remote-id builders
// live inside each surface folder (surfaces/<name>/schema.ts); this root schema
// keeps ONLY the cross-surface surface list the connector router advertises.
// (email's remote_id is the bare Gmail message id — no prefix, no builder.)

/** Surfaces this connector feeds — advertised in `initialize`, routed in the
 *  fetch switch. */
export const SURFACES = ["email", "meetings", "contacts"];
