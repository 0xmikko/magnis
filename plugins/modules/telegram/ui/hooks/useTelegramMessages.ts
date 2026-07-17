import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelegramChat, TelegramConversation, TelegramMessage } from "../types";
import type { PaginatedResponse } from "@magnis/host/runtime";
import type { TelegramMessageListItem } from "../types";
import { normalizeTelegramChatTitle } from "../chatTitle";
import { useAppRuntime } from "@magnis/host/runtime";
import { telegramKeys, useTelegramMessagesQuery } from "../queries";
import { formatMessageTime } from "../utils/time";
import { PAGE_SIZE } from "../index.tsx";
import { initialsFromName } from "../utils/text";
import { mediaLabel, pickAvatarColor } from "../helpers";

export interface UseTelegramMessagesResult {
  readonly conversation: TelegramConversation | undefined;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly backfilling: boolean;
  readonly hasMoreOnServer: boolean;
  readonly fetchMessages: (chatId: string, offset: number, append: boolean) => Promise<void>;
  readonly handleLoadMore: () => void;
  readonly handleBackfill: () => void;
  readonly handleSendMessage: (text: string) => void;
  readonly handleReplyByAgent: (message: TelegramMessage) => void;
}

function mapMessages(items: readonly TelegramMessageListItem[], baseUrl: string): TelegramMessage[] {
  return items
    .map((m) => {
      const mMediaUrl = m.metadata?.media_url as string | undefined;
      const mMediaType = m.metadata?.media_type as string | undefined;
      const prefixedMediaUrl = mMediaUrl?.startsWith("/")
        ? `${baseUrl}${mMediaUrl}`
        : mMediaUrl;
      const mSenderAvatarUrl = m.metadata?.sender_avatar_url as string | undefined;
      const prefixedSenderAvatarUrl = mSenderAvatarUrl?.startsWith("/")
        ? `${baseUrl}${mSenderAvatarUrl}`
        : mSenderAvatarUrl;
      return {
        id: m.id,
        direction: (m.metadata?.is_outgoing === true || m.metadata?.is_outgoing === 1)
          ? ("out" as const)
          : ("in" as const),
        senderName: (m.metadata?.sender_name as string | undefined) ?? m.sender ?? undefined,
        senderAvatarUrl: prefixedSenderAvatarUrl,
        text: m.preview
          ?? (m.metadata?.text as string | undefined)
          ?? mediaLabel(mMediaType),
        time: formatMessageTime(m.timestamp),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        date: m.timestamp?.slice(0, 10),
        mediaType: mMediaType,
        mediaUrl: prefixedMediaUrl,
        telegramMsgId: m.metadata?.message_id as number | undefined,
        replyToMsgId: m.metadata?.reply_to_msg_id as number | undefined,
      };
    })
    .filter((m) => m.text !== "" || m.mediaUrl);
}

export function useTelegramMessages(
  selectedChatId: string | undefined,
  chats: readonly TelegramChat[],
): UseTelegramMessagesResult {
  const runtime = useAppRuntime();
  const baseUrl = runtime.transport.baseUrl;

  // Resolve native telegram chat_id from entity UUID (for send/backfill RPCs)
  const nativeChatId = useMemo(() => {
    if (!selectedChatId) return undefined;
    const chat = chats.find((c) => c.id === selectedChatId);
    return chat?.chatId;
  }, [selectedChatId, chats]);

  // TanStack Query for initial message fetch
  const { data: queryData, isLoading: queryLoading } = useTelegramMessagesQuery(
    selectedChatId,
    PAGE_SIZE,
    0,
  );

  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [hasMoreOnServer, setHasMoreOnServer] = useState(true);
  const [extraMessages, setExtraMessages] = useState<TelegramMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<TelegramMessage[]>([]);
  // Newest `total` reported by a load-more/backfill page for THIS chat.
  // Keyed by chatId so a chat switch can never surface a stale total.
  const [fetchedTotal, setFetchedTotal] = useState<{ chatId: string; total: number } | null>(null);
  const offsetRef = useRef(0);

  // Derive initial messages from query
  const initialMessages = useMemo(() => {
    if (!queryData) return null;
    const mapped = mapMessages(queryData.items, baseUrl);
    mapped.reverse(); // API returns newest first → chronological
    return mapped;
  }, [queryData, baseUrl]);

  // Merge: extra (older, prepended) + initial + optimistic
  const allMessages = useMemo(() => {
    const base = initialMessages ?? [];
    return [...extraMessages, ...base, ...optimisticMessages];
  }, [extraMessages, initialMessages, optimisticMessages]);

  // Derive conversation as a single useMemo — no state, no effects
  const conversation = useMemo<TelegramConversation | undefined>(() => {
    if (!selectedChatId) return undefined;
    if (!queryData) return undefined;

    const chatData = chats.find((c) => c.id === selectedChatId);
    const chatName = normalizeTelegramChatTitle(
      (queryData.items[0]?.metadata?.chat_title as string | undefined) ??
      chatData?.name ??
      queryData.items[0]?.sender,
    );

    // The chat's graph message total: the initial page's `total`, advanced by
    // any newer load-more/backfill page that reported a LARGER one (backfill
    // ingest grows the graph between query-cache refreshes). Both numbers are
    // real `telegram.messages.list` totals for this chat — never a page length.
    const grownTotal =
      fetchedTotal !== null && fetchedTotal.chatId === selectedChatId
        ? fetchedTotal.total
        : 0;

    return {
      chatId: selectedChatId,
      contactName: chatName,
      contactInitials: initialsFromName(chatName),
      contactAvatarColor: pickAvatarColor(chatName),
      contactAvatarUrl: chatData?.avatarUrl,
      messageTotal: Math.max(queryData.total, grownTotal),
      messages: allMessages,
    };
  }, [selectedChatId, queryData, chats, allMessages, fetchedTotal]);

  // Update hasMore when query data arrives
  useEffect(() => {
    if (queryData) {
      setHasMore(queryData.items.length < queryData.total);
    }
  }, [queryData]);

  // Reset on chat change
  useEffect(() => {
    if (!selectedChatId) return;
    offsetRef.current = 0;
    setExtraMessages([]);
    setOptimisticMessages([]);
    setHasMore(false);
    setHasMoreOnServer(true);
    setFetchedTotal(null);
  }, [selectedChatId]);

  // Invalidate messages query when live sync arrives for this chat
  useEffect(() => {
    if (!selectedChatId) return;
    const chatId = selectedChatId;
    return runtime.transport.onEventType(["sync.progress"], (event) => {
      const raw = (event.payload ?? {}) as Record<string, unknown>;
      if (raw.module_id !== "telegram" && raw.source_id !== "telegram") return;
      if (raw.phase !== "live") return;
      void runtime.queryClient.invalidateQueries({
        queryKey: telegramKeys.messages(chatId),
      });
    });
  }, [selectedChatId, runtime]);

  // Fetch older messages (load-more)
  const fetchMessages = useCallback(
    async (chatId: string, offset: number, append: boolean) => {
      if (offset === 0 && !append) {
        // Refresh: invalidate the TanStack Query cache so it refetches
        setExtraMessages([]);
        setOptimisticMessages([]);
        offsetRef.current = 0;
        void runtime.queryClient.invalidateQueries({
          queryKey: telegramKeys.messages(chatId),
        });
        return;
      }
      setLoading(true);
      try {
        const result = await runtime.transport.rpc<PaginatedResponse<TelegramMessageListItem>>(
          "telegram.messages.list",
          { entity_id: chatId, limit: PAGE_SIZE, offset },
        );

        const newMessages = mapMessages(result.items, baseUrl);
        newMessages.reverse();

        if (append) {
          setExtraMessages((prev) => [...newMessages, ...prev]);
        } else {
          setExtraMessages(newMessages);
        }
        setHasMore(offset + result.items.length < result.total);
        // Advance the chat's displayed total from the newest page's report.
        setFetchedTotal({ chatId, total: result.total });
      } catch {
        // Keep current conversation on error
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, runtime.transport],
  );

  const handleLoadMore = useCallback(() => {
    if (!selectedChatId || loading || queryLoading || !hasMore) return;
    const newOffset = offsetRef.current + PAGE_SIZE;
    offsetRef.current = newOffset;
    void fetchMessages(selectedChatId, newOffset, true);
  }, [selectedChatId, loading, queryLoading, hasMore, fetchMessages]);

  // Backfill: fetch older history from the Telegram server for the current chat.
  // FIRE-AND-FORGET (see telegram/module/service.ts::messagesBackfill): the host
  // runs the slow, network-bound fetch + ingest as a DETACHED task so the plugin
  // worker channel stays free for reads. We just request it here, show the
  // spinner, and reload when the host emits `sync.backfill` for this chat (effect
  // below). A fallback timer clears the spinner if no event ever arrives.
  const backfillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True only while THE USER's own scroll-to-backfill request is in flight. The
  // scheduler's auto-backfill emits `sync.backfill` for the current chat too;
  // without this guard those unrequested events would each prepend a page and
  // overshoot the scroll (jumping the user far above where they were). We consume
  // exactly ONE matching event per user request — exactly one reload, like the
  // old synchronous flow.
  const awaitingBackfillRef = useRef(false);
  const clearBackfillWait = useCallback(() => {
    awaitingBackfillRef.current = false;
    setBackfilling(false);
    if (backfillTimerRef.current) {
      clearTimeout(backfillTimerRef.current);
      backfillTimerRef.current = null;
    }
  }, []);
  const handleBackfill = useCallback(() => {
    if (!selectedChatId || backfilling || !hasMoreOnServer) return;

    // Find oldest telegramMsgId in current messages (the "before" cursor)
    let oldestMsgId: number | undefined;
    for (const m of allMessages) {
      if (m.telegramMsgId != null && (oldestMsgId == null || m.telegramMsgId < oldestMsgId)) {
        oldestMsgId = m.telegramMsgId;
      }
    }
    // Can't backfill without a known anchor message_id
    if (!oldestMsgId) return;

    awaitingBackfillRef.current = true;
    setBackfilling(true);
    if (backfillTimerRef.current) clearTimeout(backfillTimerRef.current);
    backfillTimerRef.current = setTimeout(clearBackfillWait, 60000);

    // Returns immediately ({pending}); the page lands via the sync.backfill event.
    void runtime.transport
      .rpc<{ pending?: boolean; count?: number }>("telegram.messages.backfill", {
        chat_id: Number(nativeChatId),
        before_message_id: oldestMsgId,
        limit: PAGE_SIZE,
      })
      .catch((err) => {
        console.error("Backfill request failed:", err);
        clearBackfillWait();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId, backfilling, hasMoreOnServer, allMessages, runtime, nativeChatId, clearBackfillWait]);

  // The detached host backfill emits `sync.backfill` when a page lands. Only act
  // on the event for OUR in-flight request (awaitingBackfillRef) — ignore the
  // scheduler's auto-backfill events for this chat. Pull the freshly-ingested
  // page into view (ingested>0), or stop offering backfill (ingested===0 → no
  // older history on the server). Exactly one reload per user request.
  useEffect(() => {
    const off = runtime.transport.onEventType(["sync.backfill"], (event) => {
      if (!awaitingBackfillRef.current) return;
      const raw = (event.payload ?? {}) as Record<string, unknown>;
      if (nativeChatId == null || String(raw.chat_id) !== String(nativeChatId)) return;
      const ingested = typeof raw.ingested === "number" ? raw.ingested : 0;
      clearBackfillWait(); // consume: one reload per request
      if (ingested === 0) {
        setHasMoreOnServer(false);
      } else if (selectedChatId) {
        const newOffset = offsetRef.current + PAGE_SIZE;
        offsetRef.current = newOffset;
        void fetchMessages(selectedChatId, newOffset, true);
      }
    });
    return off;
  }, [runtime, nativeChatId, selectedChatId, fetchMessages, clearBackfillWait]);

  // Operational sync: opening a chat eagerly walks a few pages of its older
  // history (prioritising the chat the user clicked over the background full
  // download), so it fills well past the bootstrap's 50 without the user having
  // to scroll. The rest still arrives via scroll + the background backfill.
  const OP_SYNC_PAGES = 4;
  const opSyncChatRef = useRef<string | undefined>(undefined);
  const opSyncPagesRef = useRef(0);
  useEffect(() => {
    if (opSyncChatRef.current !== selectedChatId) {
      opSyncChatRef.current = selectedChatId;
      opSyncPagesRef.current = 0;
    }
    if (!selectedChatId || backfilling || !hasMoreOnServer) return;
    if (allMessages.length === 0) return; // wait for the initial page to load
    if (opSyncPagesRef.current >= OP_SYNC_PAGES) return;
    opSyncPagesRef.current += 1;
    handleBackfill();
  }, [selectedChatId, backfilling, hasMoreOnServer, allMessages, handleBackfill]);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!selectedChatId) return;
      const chatId = selectedChatId;
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const pendingId = `_pending_${Date.now()}`;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const dateStr = now.toISOString().slice(0, 10);

      const optimistic: TelegramMessage = {
        id: pendingId,
        direction: "out",
        text,
        time: timeStr,
        date: dateStr,
        sendStatus: "sending",
      };

      setOptimisticMessages((prev) => [...prev, optimistic]);

      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      void (async () => {
        try {
          await runtime.transport.rpc("telegram.messages.send", {
            chat_id: Number(nativeChatId),
            text,
            reply_to_message_id: null,
          });

          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === pendingId ? { ...m, sendStatus: "sent" as const } : m,
            ),
          );

          setTimeout(() => {
            offsetRef.current = 0;
            setExtraMessages([]);
            setOptimisticMessages([]);
            void runtime.queryClient.invalidateQueries({
              queryKey: telegramKeys.messages(chatId),
            });
          }, 1500);
        } catch (err) {
          console.error("Failed to send message:", err);
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === pendingId ? { ...m, sendStatus: "failed" as const } : m,
            ),
          );
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedChatId, runtime],
  );

  const handleReplyByAgent = useCallback(
    (message: TelegramMessage) => {
      if (!selectedChatId) return;
      runtime.agent.setReplyTo({
        entityId: message.id,
        schemaId: "telegram.message",
        name: message.senderName ?? "Message",
        data: {
          sender: message.senderName ?? "Unknown",
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          preview: message.text?.slice(0, 100),
          timestamp: message.time,
          metadata: {
            message_id: message.telegramMsgId,
            chat_id: nativeChatId,
            sender_name: message.senderName,
          },
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime, selectedChatId],
  );

  return {
    conversation,
    loading: loading || queryLoading,
    hasMore,
    backfilling,
    hasMoreOnServer,
    fetchMessages,
    handleLoadMore,
    handleBackfill,
    handleSendMessage,
    handleReplyByAgent,
  };
}
