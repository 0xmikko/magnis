// Telegram plugin — schema-id + link-kind constants. Deduped between
// `module/service.ts` and the module tests (the single spelling of each
// namespace string). The schemas/ files are the source of truth for REGISTRATION
// (registered natively at install); these consts are for read/write
// call sites only.

/** Chat entity schema. */
export const CHAT = "telegram.chat";
/** Chat details record (title/pins/last-message denorm/avatar/…). */
export const CHAT_DETAILS = "telegram.chat.details";
/** Message entity schema. */
export const MESSAGE = "telegram.message";
/** Message details record (text/date/sender/media/…). */
export const MESSAGE_DETAILS = "telegram.message.details";
/** Cross-module contact: telegram mints contacts.person from senders. */
export const PERSON = "contacts.person";
/** Contact record minted on a person from a telegram sender. */
export const CONTACT_FACET = "telegram.contact";
/** Link kind: person → chat (a sender belongs to a chat). RETIRES in S4's
 * migration (ambiguous rows → discard); no new writes. */
export const PERSON_CHAT_LINK = "person:telegram.chat";
/** Account entity schema (S4): the telegram REPLICA — one node per distinct
 * telegram user id, the operator's own included (minted at connection-ready).
 * Anchored `tg:account:<telegram_user_id>`. */
export const TELEGRAM_ACCOUNT = "telegram.account";
/** The account anchor form. */
export const accountAnchor = (id: string | number): string => `tg:account:${String(id)}`;
/** The chat anchor form (S4): chats resolve through the chokepoint. */
export const chatAnchor = (id: string): string => `tg:chat:${id}`;
