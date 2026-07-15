import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { TelegramChat, TelegramChatListItem, TelegramMessageListItem } from "../types";
import type { PaginationParams, PaginatedResponse } from "@magnis/host/runtime";
import { normalizeTelegramChatTitle } from "../chatTitle";
import { useRouterContext } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";
import { initialsFromName } from "../utils/text";
import { CHATS_PAGE_SIZE, PAGE_SIZE } from "../index.tsx";
import { useTelegramStore } from "../store";
import { telegramKeys, useTelegramChatsQuery } from "../queries";
import {
  formatChatListTime,
  pickAvatarColor,
  resolveAvatarUrl,
} from "../helpers";

export interface UseTelegramChatListResult {
  readonly chats: TelegramChat[];
  readonly chatsTotal: number;
  readonly chatsLoading: boolean;
  readonly selectedChatId: string | undefined;
  readonly getSelectedChatId: () => string | undefined;
  readonly setSelectedChatId: (chatId: string | undefined) => void;
  readonly fetchChats: (offset: number, append: boolean) => Promise<void>;
  readonly handleLoadMoreChats: () => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (query: string) => void;
}

function mapChatItems(items: readonly TelegramChatListItem[], baseUrl: string): TelegramChat[] {
  return items.map((c) => {
    const name = normalizeTelegramChatTitle(c.chat_title);
    return {
      id: c.entity_id,
      chatId: c.chat_id,
      name,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      avatarUrl: resolveAvatarUrl(baseUrl, c.avatar_url),
      lastMessage: c.last_message ?? "",
      time: c.last_message_time
        ? formatChatListTime(c.last_message_time)
        : "",
      pinned: c.is_pinned === true,
      isIndexed: c.is_indexed ?? undefined,
    };
  });
}

export function useTelegramChatList(): UseTelegramChatListResult {
  const router = useRouterContext();
  const runtime = useAppRuntime();
  const baseUrl = runtime.transport.baseUrl;

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery.trim());

  // TanStack Query for initial page (with optional search)
  const { data: queryData, isLoading: queryLoading } = useTelegramChatsQuery(
    CHATS_PAGE_SIZE, 0, deferredSearch || undefined,
  );

  // Derive initial chats from query data
  const initialChats = useMemo(() => {
    if (!queryData) return null;
    return mapChatItems(queryData.items, baseUrl);
  }, [queryData, baseUrl]);

  // Seed TanStack Query cache from inline messages in chat items.
  // Backend includes messages for top 10 chats — clicking shows instantly.
  useEffect(() => {
    if (!queryData?.items) return;
    let seeded = 0;
    for (const item of queryData.items) {
      const raw = item as unknown as Record<string, unknown>;
      if (raw.messages) {
        runtime.queryClient.setQueryData(
          telegramKeys.messages(item.chat_id, { limit: PAGE_SIZE, offset: 0 }),
          raw.messages,
        );
        seeded++;
      }
    }
    if (seeded > 0) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(`[prefetch] seeded ${seeded} chats from inline messages`);
    }
  }, [queryData, runtime.queryClient]);

  // ── Chat list state — seeded from query, extended by load-more ──
  const [extraChats, setExtraChats] = useState<TelegramChat[]>([]);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const chatsOffsetRef = useRef(0);

  // Merge initial query data with paginated extras (skip extras during search)
  const isSearching = deferredSearch.length > 0;
  const chats = useMemo(() => {
    if (isSearching) return initialChats ?? [];
    const base = initialChats ?? [];
    if (extraChats.length === 0) return base;
    const seen = new Set(base.map((c) => c.id));
    return [...base, ...extraChats.filter((c) => !seen.has(c.id))];
  }, [initialChats, extraChats, isSearching]);

  // Update total when query data arrives (skip caching search results)
  useEffect(() => {
    if (queryData && !isSearching) {
      setChatsTotal(queryData.total);
    }
  }, [queryData, isSearching]);

  // ── Selected chat state ──
  const [selectedChatId, setSelectedChatIdRaw] = useState<string | undefined>(() => {
    return router.entityId;
  });
  const selectedChatIdRef = useRef(selectedChatId);
  selectedChatIdRef.current = selectedChatId;

  const getSelectedChatId = useCallback(() => selectedChatIdRef.current, []);

  const setSelectedChatId = useCallback((chatId: string | undefined) => {
    setSelectedChatIdRaw(chatId);
    router.setSelection("chat", chatId);
  }, [router]);

  // Sync from URL hash changes (back/forward navigation)
  useEffect(() => {
    if (router.entityId !== undefined && router.entityId !== selectedChatIdRef.current) {
      setSelectedChatIdRaw(router.entityId);
    }
  }, [router.entityId]);

  // Sync from zustand store (navigateToEntity, onDraftRequest)
  const storeSelectedChatId = useTelegramStore((s) => s.selectedChatId);
  useEffect(() => {
    if (storeSelectedChatId && storeSelectedChatId !== selectedChatIdRef.current) {
      setSelectedChatId(storeSelectedChatId);
    }
  }, [storeSelectedChatId, setSelectedChatId]);

  // ── Fetch chats (for load-more only) ──
  const fetchChats = useCallback(
    async (offset: number, append: boolean) => {
      if (offset === 0 && !append) {
        // Refresh: invalidate the TanStack Query cache so it refetches
        setExtraChats([]);
        chatsOffsetRef.current = 0;
        void runtime.queryClient.invalidateQueries({
          queryKey: telegramKeys.chats(),
        });
        return;
      }
      setLoadMoreLoading(true);
      try {
        const result = await runtime.transport.rpc<PaginatedResponse<TelegramChatListItem>>(
          "telegram.chats.list",
          { limit: CHATS_PAGE_SIZE, offset } satisfies PaginationParams,
        );
        setChatsTotal(result.total);
        const mapped = mapChatItems(result.items, baseUrl);

        if (append) {
          setExtraChats((prev) => {
            const seen = new Set(prev.map((c) => c.id));
            return [...prev, ...mapped.filter((c) => !seen.has(c.id))];
          });
        } else {
          setExtraChats(mapped);
        }
      } catch {
        // Keep existing chats on error
      } finally {
        setLoadMoreLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, runtime.transport],
  );

  // If the selected chat isn't in the loaded list (e.g. opened via URL/search),
  // fetch its latest message and build a sidebar entry from metadata.
  useEffect(() => {
    if (!selectedChatId || isSearching) return;
    if (chats.some((c) => c.id === selectedChatId)) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    void (async () => {
      try {
        const result = await runtime.transport.rpc<PaginatedResponse<TelegramMessageListItem>>(
          "telegram.messages.list",
          { entity_id: selectedChatId, limit: 1, offset: 0 },
        );
        const msg = result.items[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cancelled || !msg) return;
        const title = (msg.metadata?.chat_title as string | undefined) ?? msg.sender ?? selectedChatId;
        const name = normalizeTelegramChatTitle(title);
        const entry: TelegramChat = {
          id: selectedChatId,
          chatId: selectedChatId, // fallback — may not have native chat_id
          name,
          initials: initialsFromName(name),
          avatarColor: pickAvatarColor(name),
          lastMessage: msg.preview ?? "",
          time: msg.timestamp ? formatChatListTime(msg.timestamp) : "",
          pinned: false,
        };
        setExtraChats((prev) => {
          if (prev.some((c) => c.id === selectedChatId)) return prev;
          return [...prev, entry];
        });
      } catch {
        // Not critical — messages still load via query
      }
    })();
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => { cancelled = true; };
  }, [selectedChatId, chats, isSearching, runtime.transport, baseUrl]);

  // Auto-select first chat when list loads and nothing is selected
  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      setSelectedChatId(chats[0]!.id);
    }
  }, [chats, selectedChatId, setSelectedChatId]);

  // Push agent context whenever selected chat changes
  useEffect(() => {
    if (!selectedChatId) {
      runtime.agent.setActiveContext(null);
      return;
    }
    const chat = chats.find((c) => c.id === selectedChatId);
    runtime.agent.setActiveContext({
      moduleId: "telegram",
      chatId: selectedChatId,
      chatTitle: normalizeTelegramChatTitle(chat?.name),
    });
  }, [selectedChatId, chats, runtime]);

  const chatsLoading = queryLoading || loadMoreLoading;

  const handleLoadMoreChats = useCallback(() => {
    if (chatsLoading || chats.length >= chatsTotal) return;
    const newOffset = chatsOffsetRef.current + CHATS_PAGE_SIZE;
    chatsOffsetRef.current = newOffset;
    void fetchChats(newOffset, true);
  }, [chatsLoading, chats.length, chatsTotal, fetchChats]);

  return {
    chats,
    chatsTotal,
    chatsLoading,
    selectedChatId,
    getSelectedChatId,
    setSelectedChatId,
    fetchChats,
    handleLoadMoreChats,
    searchQuery,
    setSearchQuery,
  };
}
