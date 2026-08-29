import { useCallback, useMemo } from "react";
import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TelegramChatView } from "./TelegramChatView";
import { useTelegramMessages } from "./hooks/useTelegramMessages";
import { useTelegramSync } from "./hooks/useTelegramSync";
import { telegramKeys } from "./queries";
import { INPUT_PLACEHOLDER } from "./index.tsx";
import type { DetailPanelProps } from "@magnis/host/base";
import type { TelegramChat } from "./types";
import { normalizeTelegramChatTitle } from "./chatTitle";
import { initialsFromName } from "./utils/text";
import { pickAvatarColor, resolveAvatarUrl } from "./helpers";
import { useAppRuntime } from "@magnis/host/runtime";

interface EntityResponse {
  readonly id: string;
  readonly properties?: Readonly<Record<string, unknown>> | null;
}

/**
 * Resolve a single Telegram chat from the node's DICTIONARY instead of loading
 * the full chat list. This works for chats on any page.
 */
function useTelegramChatFromDictionary(entityId: string): TelegramChat | undefined {
  const runtime = useAppRuntime();
  const baseUrl = runtime.transport.baseUrl;

  const { data: response } = useQuery({
    queryKey: telegramKeys.chatDetail(entityId),
    queryFn: () => runtime.transport.rpc<EntityResponse>("graph.entity.get", { id: entityId }),
    enabled: !!entityId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const d = response?.properties;
    if (!d) return undefined;
    const chatId =
      typeof d.chat_id === "string" || typeof d.chat_id === "number" ? String(d.chat_id) : undefined;
    if (!chatId) return undefined;
    const rawTitle = (d.chat_title as string | undefined) ?? (d.title as string | undefined);
    const name = normalizeTelegramChatTitle(rawTitle);
    const avatarUrl = d.avatar_url as string | undefined;
    const isIndexed = d.is_indexed as boolean | undefined;
    return {
      id: entityId,
      chatId,
      name,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      avatarUrl: resolveAvatarUrl(baseUrl, avatarUrl ?? null),
      lastMessage: "",
      time: "",
      pinned: (d.is_pinned as boolean | undefined) ?? false,
      isIndexed: isIndexed ?? undefined,
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
      onSendMessage={messages.handleSendMessage}
      onReplyByAgent={messages.handleReplyByAgent}
      isIndexed={selectedChat?.isIndexed}
      onToggleIndexing={() => { void handleToggleIndexing(); }}
    />
  );
}
