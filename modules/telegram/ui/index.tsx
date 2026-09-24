import { toolNamesEquivalent } from "@magnis/host/agent";
import type { ContextMenuEntry } from "@magnis/host/ui";
import type { AgentHistoryBlock, ModuleAgentContribution } from "@magnis/host/runtime";
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
    avatarUrl: c.avatar_url ?? null,
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
  systemPrompt: "Read the conversation before composing. Use the recipient's language. Use create(\"telegram.message\", {messages:[...]}) for multiple recipients in ONE approval; do not fan out individual calls. Single messages and replies use the same create operation. A pending approval is a draft awaiting review.",
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
    const bound = tc.toolBinding;
    if (bound !== undefined && (bound.entity !== "telegram.message" || bound.operation !== "create")) return null;
    if (bound === undefined && tc.name !== "send_telegram_message" && !toolNamesEquivalent(tc.name, "telegram.messages.send") && !toolNamesEquivalent(tc.name, "telegram.messages.reply")) return null;
    const args = tc.args as Record<string, unknown>;
    const chatId =
      typeof args.chat_id === "string" || typeof args.chat_id === "number" ? String(args.chat_id) : null;
    if (!chatId) return null;
    return {
      action: bound === undefined ? "send_telegram_message" : "telegram.message.create",
      targetType: "telegram_chat",
      targetId: chatId,
      targetLabel: args.chat_name as string | undefined,
    };
  },
  onDraftRequest: (payload, _runtime) => {
    const p = payload as Record<string, unknown>;
    const chatId = (p.chatId ?? p.chat_id) as string | number | undefined;
    const text = (p.text ?? p.message) as string | undefined;
    if (chatId !== undefined && text !== undefined) {
      // Legacy onDraftRequest writes through the unified draft store
      // so the wrapped TelegramReplyComposer picks it up on mount.
      writeDraftDirect("telegram", String(chatId), { text });
    }
    if (chatId !== undefined) {
      window.location.hash = `#/telegram/chat/${String(chatId)}`;
    } else {
      window.location.hash = `#/telegram`;
    }
  },
};

const telegramModule = defineModule({
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
      setSelectedChatId: (chatId: string | undefined): void => { set({ selectedChatId: chatId }); },
      setSearchQuery: (query: string): void => { set({ searchQuery: query }); },
      setSyncProgress: (progress: number | null): void => { set({ syncProgress: progress }); },
      setPendingMessageId: (id: string | undefined, telegramMsgId?: number): void =>
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
        // P4: one call, to the module that owns the message. It answers with
        // its links and its metadata, so the generic `graph.entity.get` read
        // that used to stand in for the module's own answer is gone.
        const detail = await runtime.transport.rpc<{
          metadata?: Record<string, unknown>;
          linked_entities?: readonly { id: string; schema_id: string }[];
        }>("telegram.messages.get", { id: entityId });
        const chatLink = detail.linked_entities?.find((e) => e.schema_id === "telegram.chat");
        chatEntityId = chatLink?.id;
        // `??=`, so a message id already on the card data wins. Telegram ids
        // start at 1, so treating 0 as present rather than missing is moot.
        telegramMsgId ??= detail.metadata?.message_id as number | undefined;
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
  toolCallRenderers: [{ entity: "telegram.message", actions: ["create"], Render: TelegramToolCallRenderer as never }],
  extraSetup: (runtime) => {
    const unsub2 = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress"],
      [telegramKeys.all],
    );
    return (): void => { unsub2(); };
  },
});

export const TelegramModule = {
  ...telegramModule,
  agent: {
    ...telegramModule.agent,
    historyRenderers: [
      ...(telegramModule.agent?.historyRenderers ?? []),
      { id: "telegram-send-history", moduleId: "telegram", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["telegram.messages.send", "telegram.messages.reply", "send_telegram_message"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: TelegramToolCallRenderer as never },
      { id: "telegram-batch-history", moduleId: "telegram", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["telegram.batch_send"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: TelegramBatchSendRenderer as never },
      { id: "telegram-trigger-history", moduleId: "telegram", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["telegram.set_trigger"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: TelegramSetTriggerRenderer as never },
    ],
  },
};
