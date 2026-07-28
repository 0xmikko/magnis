// Email plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Message entity schema. */
export const MESSAGE_SCHEMA = "email.message";
/** Single-aligned message details facet (sender/subject/body/snippet/…). */
export const MESSAGE_DETAILS = "email.message.details";
/** Address entity schema (the cross-module email.address hub). */
export const ADDRESS_SCHEMA = "email.address";
/** Address details facet (display name / provenance). */
export const ADDRESS_DETAILS = "email.address.details";

/** Durable send-attempt entity — the idempotency ledger for outgoing mail. */
export const SEND_ATTEMPT_SCHEMA = "email.send_attempt";
/** Its single-aligned details facet (status + provider ids). */
export const SEND_ATTEMPT_DETAILS = "email.send_attempt.details";
/** UUIDv5 namespace for deriving an attempt key from the message content. */
export const SEND_ATTEMPT_NS = "6f9619ff-8b86-d011-b42d-00c04fc964ff";
