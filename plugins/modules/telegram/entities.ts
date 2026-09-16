/** What telegram's three entities ARE, and how each is searched.
 *
 * BUILD TIME ONLY — a leaf. `module/`, `ui/` and `types.ts` import nothing
 * from here.
 *
 * What the edges carry is not in a dictionary: a message's chat is an
 * `in_chat` edge and its sender an `authored_by` edge, and what ONE account
 * observes about a chat — unread counts, pins — rides that account's
 * `observed_in` edge rather than the chat itself.
 */
import { z } from "zod";
import { column, entity, moment, type AssertEqual } from "@magnis/declare";

import type {
  TelegramAccountDetails,
  TelegramChatDetails,
  TelegramMessageDetails,
} from "./types.ts";

export const account = entity(
  {
    id: "telegram.account",
    name: "Telegram account",
    description: "A telegram account entity owned by the telegram plugin.",
    roles: ["identity_channel"],
  },
  {
    telegram_user_id: z.number().optional(),
    is_self: z.boolean().optional(),
    display_name: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    phone: z.string().optional(),
  },
  {
    order: ["display_name", "asc"],
    title: "display_name",
    // One searchable name over the four places a person's name may live.
    alias: { name: ["display_name", "first_name", "last_name", "username"] },
  },
) satisfies z.ZodType<TelegramAccountDetails>;

const _accountIsTheModulesOwnType: AssertEqual<z.infer<typeof account>, TelegramAccountDetails> = true;
void _accountIsTheModulesOwnType;

export const chat = entity(
  {
    id: "telegram.chat",
    name: "Telegram chat",
    description: "A telegram chat/dialog entity.",
    roles: ["container"],
    triggerable: true,
  },
  {
    chat_id: z.number().optional(),
    title: column("name", z.string().optional()),
    type: z.string().optional(),
    username: z.string().optional(),
    avatar_url: z.string().optional(),
    /** The operator's choice to index a chat's media; set through telegram.chats.set_indexed. */
    is_indexed: z.boolean().optional(),
    member_count: z.number().optional(),
    read_inbox_max_id: z.number().optional(),
    read_outbox_max_id: z.number().optional(),
    unread_mentions_count: z.number().optional(),
    top_message: z.number().optional(),
    pts: z.number().optional(),
    last_message_date: moment().optional(),
    last_message_preview: z.string().optional(),
    last_sender_name: z.string().optional(),
  },
  { order: ["last_message_date", "desc"], title: "title", body: "last_message_preview" },
) satisfies z.ZodType<TelegramChatDetails>;

const _chatIsTheModulesOwnType: AssertEqual<z.infer<typeof chat>, TelegramChatDetails> = true;
void _chatIsTheModulesOwnType;

export const message = entity(
  {
    id: "telegram.message",
    name: "Telegram message",
    description: "A telegram message entity.",
    roles: ["content"],
  },
  {
    message_id: z.number().optional(),
    text: z.string().optional(),
    date: column("date", moment().optional()),
    is_outgoing: z.boolean().optional(),
    chat_title: z.string().optional(),
    reply_to_msg_id: z.number().optional(),
    media_type: z.string().optional(),
    has_media: z.boolean().optional(),
    file_name: z.string().optional(),
    is_pinned: z.boolean().optional(),
    source_ref: z
      .object({
        account_id: z.string().optional(),
        chat_id: z.number().optional(),
        message_id: z.number().optional(),
        media_type: z.string().optional(),
        dest_subpath: z.string().optional(),
      })
      .optional(),
    sender_info: z
      .object({
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
  },
  { order: ["date", "desc"], title: "text", body: "text" },
) satisfies z.ZodType<TelegramMessageDetails>;

const _messageIsTheModulesOwnType: AssertEqual<z.infer<typeof message>, TelegramMessageDetails> = true;
void _messageIsTheModulesOwnType;
