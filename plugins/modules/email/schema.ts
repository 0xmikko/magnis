// Email plugin — schema-id constants. Deduped between `module/service.ts`,
// `module/helpers.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Message entity schema. */
export const MESSAGE_SCHEMA = "email.message";
/** Address entity schema (the cross-module email.address hub). */
export const ADDRESS_SCHEMA = "email.address";

// S5: the details records are frozen archive — the message and address
// dictionaries are the record. The schemas stay registered (no schema is ever
// removed); nothing reads or writes them, so no constant points at them.

