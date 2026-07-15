import type { ContextMenuEntry } from "@magnis/host/ui";
import type { ModuleAgentContribution } from "@magnis/host/runtime";
import { TelegramIcon } from "./TelegramIcon";
import { defineModule } from "@magnis/host/base";
import { TelegramToolCallRenderer } from "./TelegramToolCallRenderer";
import { TelegramBatchSendRenderer } from "./TelegramBatchSendRenderer";
import { TelegramSetTriggerRenderer } from "./TelegramSetTriggerRenderer";
import {
  TelegramMessageCard,
  TelegramChatCard,
  telegramMessageHasMore,
  telegramChatHasMore,
} from "./EntityCards";
import { TelegramChatItemContent } from "./TelegramChatItemContent";
import { TelegramDetailWrapper } from "./TelegramDetailWrapper";
import type { createTelegramStore } from "./store";
import { telegramKeys } from "./queries";
import { setupEventInvalidation } from "@magnis/host/runtime";
import { writeDraftDirect } from "@magnis/host/composer";
import { normalizeTelegramChatTitle } from "./chatTitle";
import { initialsFromName } from "./utils/text";
import { formatChatListTime, pickAvatarColor } from "./helpers";
import type { ListItem } from "@magnis/host/base";
import type { TelegramChatListItem } from "./types";

export const SEARCH_PLACEHOLDER = "Search chats...";
export const INPUT_PLACEHOLDER = "Type a message...";

export const NEW_CHAT_TITLE = "New chat";

export const PAGE_SIZE = 50;

export const CHATS_PAGE_SIZE = 40;

export const CHAT_CACHE_KEY = "tg:chat-list";
export const CHAT_CACHE_TTL = 86_400_000; // 24 hours

export const TELEGRAM_AUTH_POLL_INTERVAL = 1500;

// eslint-disable-next-line react-refresh/only-export-components
export const MEDIA_LABELS: Readonly<Record<string, string>> = {
  photo: "Photo",
  video: "Video",
  sticker: "Sticker",
  document: "Document",
  voice: "Voice message",
  audio: "Audio",
  poll: "Poll",
  location: "Location",
  contact: "Contact",
  gif: "GIF",
  webpage: "Link",
};

export const TELEGRAM_AVATAR_COLORS = [
  "#FF6B35",
  "#4A90D9",
  "#43A047",
  "#E53935",
  "#8E24AA",
  "#D81B60",
] as const;

export const TELEGRAM_SENDER_COLORS = [
  "#FF6B6B",
  "#4FC3F7",
  "#81C784",
  "#FFB74D",
  "#BA68C8",
  "#4DD0E1",
  "#F06292",
  "#AED581",
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export const MESSAGE_MENU_ITEMS: readonly ContextMenuEntry[] = [
  { id: "reply-agent", label: "Reply by Agent", icon: "bot" },
  { type: "separator" },
  { id: "reply", label: "Reply", icon: "corner-down-left" },
  { id: "copy", label: "Copy Text", icon: "copy" },
  { id: "pin", label: "Pin", icon: "pin" },
  { id: "forward", label: "Forward", icon: "arrow-right" },
  { id: "select", label: "Select", icon: "check-square" },
  { type: "separator" },
  { id: "delete", label: "Delete", icon: "trash", variant: "danger" },
];

const CHAT_CONTEXT_ITEMS: readonly ContextMenuEntry[] = [
  { id: "mark_read", label: "Mark as read", icon: "check" },
  { id: "mute", label: "Mute notifications", icon: "bell-off" },
  { id: "pin", label: "Pin chat", icon: "pin" },
  { type: "separator" },
  { id: "delete", label: "Delete chat", icon: "trash", variant: "danger" },
];

function mapTelegramChatToListItem(raw: Record<string, unknown>): ListItem {
  const c = raw as unknown as TelegramChatListItem;
  const name = normalizeTelegramChatTitle(c.chat_title);
  // We need baseUrl for avatar resolution, but mapListItem is pure.
  // Store the raw avatar_url and resolve in the component.
  const time = c.last_message_time ? formatChatListTime(c.last_message_time) : "";

  return {
    id: c.entity_id,
    name,
    schema_id: "telegram.chat",
    preview: c.last_message ?? null,
    timestamp: time,
    avatar_url: c.avatar_url ?? null,
    is_pinned: c.is_pinned === true,
    unread_count: undefined, // Backend doesn't provide unread count in list yet
    metadata: {
      chatId: c.chat_id,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      muted: false,
      isIndexed: c.is_indexed ?? undefined,
    },
  };
}

export const telegramAgentContribution: Omit<ModuleAgentContribution, "entityRenderers"> = {
  systemPrompt:
    "You are a helpful personal assistant integrated into a relational agent system. " +
    "You help users manage their contacts, tasks, emails, and communications. " +
    "Be concise and proactive.\n\n" +
    "ABSOLUTE RULES (violating these is a critical failure):\n" +
    "1. NEVER list options, choices, or alternatives as numbered/bold text. ALWAYS use the ask_user tool instead.\n" +
    "2. When asked to compose a reply or suggest message variants, use ask_user with each variant as a select_one option. " +
    "Put the short label (2-5 words) as the option label. Put the FULL message text as the option id. " +
    "After the user picks one, send it via telegram.messages.send.\n" +
    "3. On your FIRST turn, you MUST call episodes.set_title.\n" +
    "4. ask_user MUST be the very last tool call — call set_title BEFORE it, never after.\n" +
    "5. After calling ask_user, produce NO text output — stop completely.\n\n" +
    "LANGUAGE RULES (CRITICAL — follow strictly):\n" +
    "1. YOUR responses to the user: Always in the user's language. User writes Russian → you reply Russian.\n" +
    "2. OUTGOING MESSAGES (telegram.messages.send text): Always in the RECIPIENT's language. " +
    "Before composing, check chat history via telegram.messages.list to detect what language the recipient uses. " +
    "The 'text' argument you pass to telegram.messages.send MUST match the recipient's language.\n" +
    "If no chat history is available, default to the user's language.\n\n" +
    "CRITICAL: You receive a CURRENT UI CONTEXT block with every request. " +
    "This tells you exactly what the user is looking at right now. " +
    "When the user says 'this chat', 'read the messages', 'this person', etc., " +
    "ALWAYS use the IDs from the context block — do NOT search or guess.\n\n" +
    "Tool usage rules:\n" +
    "- If context includes a chat_id, use telegram.messages.list with that exact chat_id.\n" +
    "- If context includes an entity ID, use contacts.get with that exact ID.\n" +
    "- Only use contacts.list or telegram.chats.list when the user asks about something NOT in their current context.\n" +
    "- When asked to send a message, use the send tool directly without asking for confirmation — the system has a built-in approval UI.\n" +
    "- To message MANY contacts at once (outreach/follow-ups), use telegram.batch_send with ALL recipients in ONE call so it is ONE approval to review — do NOT fan out N telegram.messages.send calls, and do NOT set one trigger per contact, unless the user explicitly asks for per-contact handling.\n\n" +
    "IMPORTANT — Pending approval responses:\n" +
    "When telegram.messages.send returns 'pending_approval: true', " +
    "this means the message is queued for user approval, NOT an error. " +
    "Say you have drafted the message and it is ready for review.\n\n" +
    "EPISODE TITLE (MANDATORY):\n" +
    "On your FIRST response, you MUST call episodes.set_title with the episode_id from context. " +
    "Call it BEFORE ask_user if both are needed in the same turn. " +
    "Title should be in the user's language and describe the topic.\n\n" +
    "ASKING QUESTIONS (MANDATORY):\n" +
    "NEVER ask questions or present choices as plain text. " +
    "When you need user input — clarification, choosing between alternatives, " +
    "confirming an approach, or suggesting options — you MUST use the ask_user tool. " +
    "ask_user MUST be the very last tool call in a turn — nothing after it. " +
    "After calling ask_user, STOP immediately and output nothing else.\n" +
    "When the user responds with '[User selected from ask_user options]', " +
    "this is their answer to your ask_user question. Proceed immediately with the selected option " +
    "(e.g. send the message with the chosen tone). NEVER re-ask or re-present the options.",
  historyRenderers: [
    {
      id: "telegram-send",
      moduleId: "telegram",
      match: (block) =>
        block.toolName === "send_telegram_message" ||
        block.toolName === "telegram_messages_send" ||
        block.toolName === "telegram.messages.send",
      Render: TelegramToolCallRenderer as never,
      priority: 10,
    },
  ],
  extractAllowlistTarget: (tc) => {
    if (tc.name !== "send_telegram_message" && tc.name !== "telegram_messages_send" && tc.name !== "telegram.messages.send") return null;
    const args = tc.args as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const chatId = args.chat_id != null ? String(args.chat_id) : null;
    if (!chatId) return null;
    return {
      action: "send_telegram_message",
      targetType: "telegram_chat",
      targetId: chatId,
      targetLabel: args.chat_name as string | undefined,
    };
  },
  onDraftRequest: (payload, _runtime) => {
    const p = payload as Record<string, unknown>;
    const chatId = (p.chatId ?? p.chat_id) as string | number | undefined;
    const text = (p.text ?? p.message) as string | undefined;
    if (chatId != null && text != null) {
      // DEC-16: legacy onDraftRequest writes through the unified draft store
      // so the wrapped TelegramReplyComposer picks it up on mount.
      writeDraftDirect("telegram", String(chatId), { text });
    }
    if (chatId != null) {
      window.location.hash = `#/telegram/chat/${String(chatId)}`;
    } else {
      window.location.hash = `#/telegram`;
    }
  },
};

export const TelegramModule = defineModule({
  id: "telegram",
  title: "Telegram",
  icon: <TelegramIcon size={26} />,
  iconName: "send",
  themeColor: "blue",
  entityTypes: ["chat", "message"],
  primaryEntityType: "chat",
  rpc: { list: "telegram.chats.list" },
  ListItemContent: TelegramChatItemContent,
  headerActionIcon: "pencil",
  detailType: "custom",
  DetailPanel: TelegramDetailWrapper,
  mapListItem: mapTelegramChatToListItem,
  contextMenuItems: () => CHAT_CONTEXT_ITEMS,
  extendStore: (set) => ({
    selectedChatId: undefined as string | undefined,
    syncProgress: null as number | null,
    pendingMessageId: undefined as string | undefined,
    pendingTelegramMsgId: undefined as number | undefined,
    actions: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSelectedChatId: (chatId: string | undefined) => { set({ selectedChatId: chatId }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSearchQuery: (query: string) => { set({ searchQuery: query }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSyncProgress: (progress: number | null) => { set({ syncProgress: progress }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setPendingMessageId: (id: string | undefined, telegramMsgId?: number) =>
        { set({ pendingMessageId: id, pendingTelegramMsgId: telegramMsgId }); },
    },
  }),
  systemPrompt: telegramAgentContribution.systemPrompt,
  navigateToEntity: async (entityId, schemaId, data, runtime, navigate) => {
    const store = runtime.stores.get<ReturnType<typeof createTelegramStore>>("telegram");
    if (!store) return;
    const { actions } = store.getState();
    if (schemaId === "telegram.message") {
      let telegramMsgId = (data.metadata as Record<string, unknown> | undefined)?.message_id as number | undefined;
      let chatEntityId: string | undefined;
      try {
        const links = await runtime.transport.rpc<{
          linked_entities: readonly { id: string; schema_id: string }[];
        }>("graph.entity.get", { id: entityId });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const chatLink = links.linked_entities?.find((e) => e.schema_id === "telegram.chat");
        chatEntityId = chatLink?.id;
        if (!telegramMsgId) {
          const detail = await runtime.transport.rpc<{
            metadata?: Record<string, unknown>;
          }>("telegram.messages.get", { id: entityId });
          telegramMsgId = detail.metadata?.message_id as number | undefined;
        }
      } catch { /* navigate without chat selection */ }
      if (chatEntityId) actions.setSelectedChatId(chatEntityId);
      actions.setPendingMessageId(entityId, telegramMsgId);
      navigate("telegram", "chat", chatEntityId);
      return;
    } else if (schemaId === "telegram.chat") {
      actions.setSelectedChatId(entityId);
    }
    navigate("telegram", "chat", entityId);
  },
  extractAllowlistTarget: telegramAgentContribution.extractAllowlistTarget,
  onDraftRequest: telegramAgentContribution.onDraftRequest,
  entityLabels: {
    message: {
      icon: "send",
      label: "Message",
      tabLabel: "Messages",
      EntityCard: TelegramMessageCard,
      hasMore: telegramMessageHasMore,
    },
    chat: {
      icon: "send",
      label: "Chat",
      tabLabel: "Chats",
      EntityCard: TelegramChatCard,
      hasMore: telegramChatHasMore,
    },
  },
  toolCallRenderers: [
    {
      actions: ["messages.send"],
      Render: TelegramToolCallRenderer as never,
    },
    {
      actions: ["batch_send"],
      Render: TelegramBatchSendRenderer as never,
    },
    {
      actions: ["set_trigger"],
      Render: TelegramSetTriggerRenderer as never,
    },
  ],
  extraSetup: (runtime) => {
    const unsub2 = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress"],
      [telegramKeys.all],
    );
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => { unsub2(); };
  },
});
