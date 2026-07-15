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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function createTelegramStore(_runtime: AppRuntime) {
  return createStore<TelegramStoreState>((set) => ({
    selectedChatId: undefined,
    searchQuery: "",
    syncProgress: null,
    pendingMessageId: undefined,
    pendingTelegramMsgId: undefined,
    actions: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSelectedChatId: (chatId) => { set({ selectedChatId: chatId }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSearchQuery: (query) => { set({ searchQuery: query }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSyncProgress: (progress) => { set({ syncProgress: progress }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setPendingMessageId: (id, telegramMsgId) => { set({ pendingMessageId: id, pendingTelegramMsgId: telegramMsgId }); },
    },
  }));
}

export type TelegramStore = ReturnType<typeof createTelegramStore>;

export function useTelegramStore(): TelegramStoreState;
export function useTelegramStore<T>(selector: (state: TelegramStoreState) => T): T;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useTelegramStore<T>(selector?: (state: TelegramStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<TelegramStore>("telegram");
  if (!store) throw new Error("Telegram store not initialized");
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
