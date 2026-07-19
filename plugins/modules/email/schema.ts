// Email plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The manifest is the source of truth for REGISTRATION
// (lifecycle uses registerManifestSchemas()); these consts are for read/write
// call sites only.

/** Message entity schema. */
export const MESSAGE_SCHEMA = "email.message";
/** Single-aligned message details facet (sender/subject/body/snippet/…). */
export const MESSAGE_DETAILS = "email.message.details";
/** Address entity schema (the cross-module email.address hub, DEC-9). */
export const ADDRESS_SCHEMA = "email.address";
/** Address details facet (display name / provenance). */
export const ADDRESS_DETAILS = "email.address.details";
