// Web plugin — schema-id and link-kind constants, the single spelling of each
// namespace string for `module/` and the module tests.

/** One URL of one user. */
export const LINK = "web.link";

/** One content a URL served; it never changes. */
export const PAGE = "web.page";

/** The host relation from an entity to a snapshot of its content, one row per
 * period. */
export const CONTENTS = "contents";

/** The host relation another module declares from its record to a link. */
export const REFERENCES = "references";

/** The surface `sources/web` answers commands on; it delivers no pages. */
export const SURFACE_WEB = "web";
/** The account every command names: a Source without login gives each user one
 * account, whose id is the Source id. */
export const SOURCE_ACCOUNT = "web";
