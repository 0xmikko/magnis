/** Backend message shape returned by telegram.messages.list RPC */
export interface TelegramMessageListItem {
  readonly id: string;
  readonly sender: string | null;
  readonly subject: string | null;
  readonly preview: string | null;
  readonly channel: string;
  readonly timestamp: string;
  readonly created_at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TelegramChatListItem {
  readonly entity_id: string;
  readonly chat_id: string;
  readonly chat_title: string | null;
  readonly last_message: string | null;
  readonly last_message_time: string | null;
  readonly last_message_sender: string | null;
  readonly is_outgoing: boolean | null;
  readonly message_count: number | null;
  readonly avatar_url: string | null;
  readonly is_pinned: boolean | null;
  readonly is_indexed: boolean | null;
}

export interface TelegramChat {
  /** Entity UUID — used for selection, routing, graph operations */
  readonly id: string;
  /** Telegram native chat_id — used for send/backfill RPCs */
  readonly chatId: string;
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
  readonly status: string;
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
