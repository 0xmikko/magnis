// LinkedIn plugin — schema-id / facet-id / link-kind constants. Deduped between
// `module/service.ts` and the module tests (one spelling of each namespace
// string). The manifest is the source of truth for REGISTRATION (lifecycle uses
// registerManifestSchemas()); these consts are for read/write/ingest call sites.

/** Profile entity + its identity facet. */
export const PROFILE = "linkedin.profile";
export const PROFILE_IDENTITY = "linkedin.profile.identity";
/** Post entity + its content/metrics facets. */
export const POST = "linkedin.post";
export const POST_CONTENT = "linkedin.post.content";
export const POST_METRICS = "linkedin.post.metrics";
/** post → author-profile link (created at ingest within a page). */
export const AUTHORED_BY = "linkedin.post:linkedin.profile";
/** Social-contact identity link: profile → the contact whose
 *  tracked handle caused the profile to be ingested. */
export const PROFILE_PERSON_LINK = "linkedin.profile:contacts.person";
