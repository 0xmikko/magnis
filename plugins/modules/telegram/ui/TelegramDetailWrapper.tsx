import { useCallback, useMemo } from "react";
import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TelegramChatView } from "./TelegramChatView";
import { useTelegramMessages } from "./hooks/useTelegramMessages";
import { useTelegramSync } from "./hooks/useTelegramSync";
import { telegramKeys } from "./queries";
import { INPUT_PLACEHOLDER } from "./index.tsx";
import type { DetailPanelProps } from "@magnis/host/base";
import type { TelegramChat, TelegramChatListItem } from "./types";
import { normalizeTelegramChatTitle } from "./chatTitle";
import { initialsFromName } from "./utils/text";
import { pickAvatarColor, resolveAvatarUrl } from "./helpers";
import { useAppRuntime } from "@magnis/host/runtime";

/**
 * Resolve a single Telegram chat with the Source account attached to the
 * operator's observed-in edge. This works for chats on any page and keeps
 * write commands bound to the same account that made the row visible.
 */
function useTelegramChatFromDictionary(entityId: string): TelegramChat | undefined {
  const runtime = useAppRuntime();
  const baseUrl = runtime.transport.baseUrl;

  const { data: response } = useQuery({
    queryKey: telegramKeys.chatDetail(entityId),
    queryFn: () => runtime.transport.rpc<TelegramChatListItem>("telegram.chats.get", {
      entity_id: entityId,
    }),
    enabled: !!entityId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    if (!response) return undefined;
    const name = normalizeTelegramChatTitle(response.chat_title);
    return {
      id: entityId,
      chatId: response.chat_id,
      accountId: response.account_id,
      name,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      avatarUrl: resolveAvatarUrl(baseUrl, response.avatar_url),
      lastMessage: response.last_message ?? "",
      time: response.last_message_time ?? "",
      pinned: response.is_pinned ?? false,
      isIndexed: response.is_indexed ?? undefined,
    };
  }, [response, entityId, baseUrl]);
}

export function TelegramDetailWrapper({
  entityId,
}: DetailPanelProps): JSX.Element {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  const selectedChat = useTelegramChatFromDictionary(entityId);

  // Build a single-element chats array for useTelegramMessages
  const chats = useMemo<readonly TelegramChat[]>(
    () => (selectedChat ? [selectedChat] : []),
    [selectedChat],
  );

  const messages = useTelegramMessages(entityId, chats);

  const refreshChats = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: telegramKeys.chats() });
  }, [queryClient]);

  useTelegramSync(refreshChats);

  const handleToggleIndexing = useCallback(async () => {
    if (!entityId) return;
    const newValue = !(selectedChat?.isIndexed ?? true);
    await runtime.transport.rpc("telegram.chats.set_indexed", {
      chat_id: selectedChat?.chatId ?? entityId,
      is_indexed: newValue,
    });
    void queryClient.invalidateQueries({ queryKey: telegramKeys.chats() });
    void queryClient.invalidateQueries({ queryKey: telegramKeys.chatDetail(entityId) });
  }, [entityId, selectedChat?.isIndexed, selectedChat?.chatId, runtime, queryClient]);

  return (
    <TelegramChatView
      conversation={messages.conversation}
      inputPlaceholder={INPUT_PLACEHOLDER}
      loading={messages.loading}
      hasMore={messages.hasMore}
      onLoadMore={messages.handleLoadMore}
      backfilling={messages.backfilling}
      hasMoreOnServer={messages.hasMoreOnServer}
      onBackfill={messages.handleBackfill}
      onSendMessage={messages.canSend ? messages.handleSendMessage : undefined}
      onReplyByAgent={messages.handleReplyByAgent}
      isIndexed={selectedChat?.isIndexed}
      onToggleIndexing={() => { void handleToggleIndexing(); }}
    />
  );
}
