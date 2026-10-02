/** The chat and message rows the module's `chats.list` and `messages.list`
 * answer, declared once in the module's own types. */
export type { MessageListItem, TelegramChatListItem } from "../types.ts";

export interface TelegramChat {
  /** Entity UUID — used for selection, routing, graph operations */
  readonly id: string;
  /** Telegram native chat_id — used for send/backfill RPCs */
  readonly chatId: string;
  /** Exact Source account used for commands against this observed chat. */
  readonly accountId: string | null;
  readonly name: string;
  readonly initials: string;
  readonly avatarColor: string;
  readonly avatarUrl?: string;
  readonly lastMessage: string;
  readonly time: string;
  readonly pinned?: boolean;
  readonly muted?: boolean;
  readonly unreadCount?: number;
  readonly isIndexed?: boolean;
}

export interface TelegramMessage {
  readonly id: string;
  readonly direction: "in" | "out";
  readonly senderName?: string;
  readonly senderAvatarUrl?: string;
  readonly text: string;
  readonly time: string;
  readonly date?: string;
  readonly sendStatus?: "sending" | "sent" | "failed";
  readonly mediaType?: string;
  readonly mediaUrl?: string;
  readonly telegramMsgId?: number;
  readonly replyToMsgId?: number;
}

export interface TelegramConversation {
  readonly chatId: string;
  readonly contactName: string;
  readonly contactInitials: string;
  readonly contactAvatarColor: string;
  readonly contactAvatarUrl?: string;
  /** The chat's REAL graph message total — the newest `telegram.messages.list`
   *  `total` for this chat (message units). NEVER the loaded page length. */
  readonly messageTotal: number;
  readonly messages: readonly TelegramMessage[];
}

export interface TelegramModuleData {
  readonly searchPlaceholder: string;
  readonly inputPlaceholder: string;
  readonly chats: readonly TelegramChat[];
  readonly conversations: Readonly<Record<string, TelegramConversation>>;
}

export interface TelegramSyncProgress {
  phase: "starting" | "syncing" | "complete";
  dialogs_done?: number;
  messages_synced?: number;
}
