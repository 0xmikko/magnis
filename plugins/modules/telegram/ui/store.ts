/**
 * Telegram module-local Zustand store for UI/live state.
 * Server/cache state lives in TanStack Query hooks.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface TelegramStoreState {
  selectedChatId: string | undefined;
  searchQuery: string;
  syncProgress: number | null;
  pendingMessageId: string | undefined;
  pendingTelegramMsgId: number | undefined;
  actions: {
    setSelectedChatId: (chatId: string | undefined) => void;
    setSearchQuery: (query: string) => void;
    setSyncProgress: (progress: number | null) => void;
    setPendingMessageId: (id: string | undefined, telegramMsgId?: number) => void;
  };
}

export function createTelegramStore(_runtime: AppRuntime) {
  return createStore<TelegramStoreState>((set) => ({
    selectedChatId: undefined,
    searchQuery: "",
    syncProgress: null,
    pendingMessageId: undefined,
    pendingTelegramMsgId: undefined,
    actions: {
      setSelectedChatId: (chatId) => { set({ selectedChatId: chatId }); },
      setSearchQuery: (query) => { set({ searchQuery: query }); },
      setSyncProgress: (progress) => { set({ syncProgress: progress }); },
      setPendingMessageId: (id, telegramMsgId) => { set({ pendingMessageId: id, pendingTelegramMsgId: telegramMsgId }); },
    },
  }));
}

export type TelegramStore = ReturnType<typeof createTelegramStore>;

export function useTelegramStore(): TelegramStoreState;
export function useTelegramStore<T>(selector: (state: TelegramStoreState) => T): T;
export function useTelegramStore<T>(selector?: (state: TelegramStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<TelegramStore>("telegram");
  if (!store) throw new Error("Telegram store not initialized");
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
