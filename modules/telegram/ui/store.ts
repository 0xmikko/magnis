/**
 * Telegram module-local Zustand store for UI/live state.
 * Server/cache state lives in TanStack Query hooks.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
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

export function createTelegramStore(_runtime: AppRuntime): StoreApi<TelegramStoreState> {
  return createStore<TelegramStoreState>((set) => ({
    selectedChatId: undefined,
    searchQuery: "",
    syncProgress: null,
    pendingMessageId: undefined,
    pendingTelegramMsgId: undefined,
    actions: {
      setSelectedChatId: (chatId): void => { set({ selectedChatId: chatId }); },
      setSearchQuery: (query): void => { set({ searchQuery: query }); },
      setSyncProgress: (progress): void => { set({ syncProgress: progress }); },
      setPendingMessageId: (id, telegramMsgId): void => { set({ pendingMessageId: id, pendingTelegramMsgId: telegramMsgId }); },
    },
  }));
}

export type TelegramStore = ReturnType<typeof createTelegramStore>;

export function useTelegramStore(): TelegramStoreState;
export function useTelegramStore<T>(selector: (state: TelegramStoreState) => T): T;
export function useTelegramStore<T>(selector?: (state: TelegramStoreState) => T): TelegramStoreState | T {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<TelegramStore>("telegram");
  if (!store) throw new Error("Telegram store not initialized");
  return useStore(store, selector ?? ((s): T => s as unknown as T));
}
