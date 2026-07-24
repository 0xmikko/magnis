// Telegram plugin — schema-id + link-kind constants. Deduped between
// `module/service.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Chat entity schema. */
export const CHAT = "telegram.chat";
/** Chat details facet (title/pins/last-message denorm/avatar/…). */
export const CHAT_DETAILS = "telegram.chat.details";
/** Message entity schema. */
export const MESSAGE = "telegram.message";
/** Message details facet (text/date/sender/media/…). */
export const MESSAGE_DETAILS = "telegram.message.details";
/** Cross-module contact: telegram mints contacts.person from senders. */
export const PERSON = "contacts.person";
/** Contact facet minted on a person from a telegram sender. */
export const CONTACT_FACET = "telegram.contact";
/** Link kind: person → chat (a sender belongs to a chat). */
export const PERSON_CHAT_LINK = "person:telegram.chat";
