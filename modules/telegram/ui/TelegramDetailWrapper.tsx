import { useCallback, useMemo, useRef, useState } from "react";
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
import type { SetSyncEnabledResult } from "@magnis/plugin-sdk";

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
      isIndexed: response.indexed,
      syncEnabled: response.syncEnabled,
    };
  }, [response, entityId, baseUrl]);
}

export function TelegramDetailWrapper({
  entityId,
}: Pick<DetailPanelProps, "entityId">): JSX.Element {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  const selectedChat = useTelegramChatFromDictionary(entityId);
  const saving = useRef(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string>();
  const [settingsError, setSettingsError] = useState<string>();

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

  const changeSetting = useCallback(async (setting: "syncEnabled" | "indexed") => {
    if (!selectedChat || saving.current) return;
    saving.current = true;
    setSavingSettings(true);
    setSettingsError(undefined);
    setSettingsStatus("Saving…");
    try {
      if (setting === "syncEnabled") {
        const response = await runtime.transport.rpc<SetSyncEnabledResult>("telegram.chat.setSyncEnabled", {
          id: entityId,
          syncEnabled: !selectedChat.syncEnabled,
        });
        const result = response.results.find((item) => item.identityId === entityId);
        if (!result) throw new Error("The synchronization change returned no result.");
        if (result.kind === "failed") throw new Error(result.message);
        setSettingsStatus(result.application.kind === "pending"
          ? "Synchronization setting saved. Applying…"
          : `Synchronization setting saved, but could not be applied: ${result.application.message}`);
      } else {
        await runtime.transport.rpc("graph.entity.update", { entity_id: entityId, indexed: !selectedChat.isIndexed });
        setSettingsStatus("Indexing setting saved.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: telegramKeys.chats() }),
        queryClient.invalidateQueries({ queryKey: telegramKeys.chatDetail(entityId) }),
      ]);
    } catch (error) {
      setSettingsStatus(undefined);
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      saving.current = false;
      setSavingSettings(false);
    }
  }, [entityId, selectedChat, runtime, queryClient]);

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
      onToggleIndexing={() => { void changeSetting("indexed"); }}
      syncEnabled={selectedChat?.syncEnabled}
      onToggleSync={() => { void changeSetting("syncEnabled"); }}
      savingSettings={savingSettings}
      settingsStatus={settingsStatus}
      settingsError={settingsError}
    />
  );
}
