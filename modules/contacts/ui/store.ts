import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface ContactsStoreState {
  selectedContactId: string | undefined;
  searchQuery: string;
  activeTab: string;
  actions: {
    setSelectedContactId: (id: string | undefined) => void;
    setSearchQuery: (query: string) => void;
    setActiveTab: (tab: string) => void;
  };
}

export function createContactsStore(_runtime: AppRuntime): StoreApi<ContactsStoreState> {
  return createStore<ContactsStoreState>((set) => ({
    selectedContactId: undefined,
    searchQuery: "",
    activeTab: "overview",
    actions: {
      setSelectedContactId: (id): void => { set({ selectedContactId: id }); },
      setSearchQuery: (query): void => { set({ searchQuery: query }); },
      setActiveTab: (tab): void => { set({ activeTab: tab }); },
    },
  }));
}

export type ContactsStore = ReturnType<typeof createContactsStore>;

export function useContactsStore(): ContactsStoreState;
export function useContactsStore<T>(selector: (state: ContactsStoreState) => T): T;
export function useContactsStore<T>(
  selector?: (state: ContactsStoreState) => T,
): ContactsStoreState | T {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<ContactsStore>("contacts");
  if (!store) throw new Error("Contacts store not initialized");
  return useStore(store, selector ?? ((s): T => s as unknown as T));
}
