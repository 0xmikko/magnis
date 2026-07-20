// Contacts plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The manifest is the source of truth for REGISTRATION
// (lifecycle uses registerManifestSchemas()); these consts are for read/write
// call sites only.

/** Entity schema (person). */
export const CONTACT = "contacts.person";
/** Profile facet (first_name/last_name/username/relevance_tier). */
export const CONTACT_PROFILE = "contacts.person.profile";
/** Collection email facet (one facet per address). */
export const CONTACT_EMAIL = "contacts.person.email";
/** Collection phone facet (one facet per number). */
export const CONTACT_PHONE = "contacts.person.phone";
/** Social-tracking opt-in facet (tracked_x / x_handle / tracked_linkedin / …). */
export const CONTACT_SOCIAL = "contacts.person.social";
/** External-link facet (source_type + external_id + url/name). */
export const CONTACT_EXTERNAL_LINK = "contacts.person.external_link";
