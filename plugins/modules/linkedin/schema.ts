// LinkedIn plugin — schema-id / facet-id / link-kind constants. Deduped between
// `module/service.ts` and the module tests (one spelling of each namespace
// string). The schemas/ files are the source of truth for REGISTRATION (registered natively at install); these consts are for read/write/ingest call sites.

/** Profile entity + its identity facet. */
export const PROFILE = "linkedin.profile";

/** Post entity + its content/metrics facets. */
export const POST = "linkedin.post";

// S5: the identity / content / metrics facets are frozen archive — the profile
// and post dictionaries are the record. The schemas stay registered (no schema
// is ever removed); nothing reads or writes them.

/** S5: authorship is the host-owned RELATION, shared with every other
 *  content family — content → the identity that produced it. */
export const AUTHORED_BY = "authored_by";
/** S5: the hub → channel relation, written contact-first (the tracked handle
 *  is what caused the profile to be ingested at all). */
export const IDENTITY = "identity";
