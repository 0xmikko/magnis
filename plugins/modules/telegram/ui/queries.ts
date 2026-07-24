/**
 * Telegram TanStack Query hooks for server/cache state.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { TelegramChatListItem, TelegramMessageListItem } from "./types";
import type { PaginatedResponse } from "@magnis/host/runtime";

export const telegramKeys = {
  all: ["telegram"] as const,
  chats: (params?: Record<string, unknown>) => [...telegramKeys.all, "chats", params] as const,
  messages: (chatId: string, params?: Record<string, unknown>) => [...telegramKeys.all, "messages", chatId, params] as const,
  chatDetail: (chatId: string) => [...telegramKeys.all, "chat", chatId] as const,
};

export function useTelegramChatsQuery(
  limit: number,
  offset: number,
  search?: string,
): UseQueryResult<PaginatedResponse<TelegramChatListItem>> {
  const runtime = useAppRuntime();
  const params: Record<string, unknown> = { limit, offset };
  if (search) params.search = search;
  return useQuery({
    queryKey: telegramKeys.chats({ limit, offset, search: search === "" ? undefined : search }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<TelegramChatListItem>>(
      "telegram.chats.list",
      params,
    ),
    staleTime: 30_000,
  });
}

export function useTelegramMessagesQuery(
  chatId: string | undefined,
  limit: number,
  offset: number,
): UseQueryResult<PaginatedResponse<TelegramMessageListItem>> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: telegramKeys.messages(chatId ?? "", { limit, offset }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<TelegramMessageListItem>>(
      "telegram.messages.list",
      { entity_id: chatId, limit, offset },
    ),
    enabled: !!chatId,
    staleTime: 15_000,
  });
}
