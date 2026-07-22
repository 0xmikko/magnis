// X plugin — schema-id + link-kind constants. Deduped between `module/service.ts`
// and the module tests (the single spelling of each namespace string). The
// schemas/ files are the source of truth for REGISTRATION (registered natively at install); these consts are for read/write call sites only.

/** Profile entity schema. */
export const PROFILE = "x.profile";
/** Profile identity facet (handle/display_name/followers/bio/url/avatar). */
export const PROFILE_IDENTITY = "x.profile.identity";
/** Post entity schema. */
export const POST = "x.post";
/** Post content facet (text/created_at/media/urls/…). */
export const POST_CONTENT = "x.post.content";
/** Post metrics facet (likes/reposts/replies/impressions). */
export const POST_METRICS = "x.post.metrics";
/** Link kind: post → author profile. */
export const AUTHORED_BY = "x.post:x.profile";
/** Identity link: profile → contacts.person. */
export const PROFILE_PERSON_LINK = "x.profile:contacts.person";
