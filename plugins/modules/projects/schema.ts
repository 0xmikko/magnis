// Projects plugin — schema-id + link-kind constants. Deduped between
// `module/service.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Entity schema (the primary facet shares this id: name/status). */
export const PROJECT = "projects.project";
/** Operational checklist facet (items array). */
export const PROJECT_CHECKLIST = "projects.project.checklist";
/** Markdown description facet (body). */
export const PROJECT_DESCRIPTION = "projects.description";
/** Link kind: a member entity `belongs_to` a project (member → project). */
export const MEMBER_LINK = "belongs_to";
