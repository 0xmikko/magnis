import { createStore } from "zustand/vanilla";
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function createContactsStore(_runtime: AppRuntime) {
  return createStore<ContactsStoreState>((set) => ({
    selectedContactId: undefined,
    searchQuery: "",
    activeTab: "overview",
    actions: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSelectedContactId: (id) => { set({ selectedContactId: id }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSearchQuery: (query) => { set({ searchQuery: query }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setActiveTab: (tab) => { set({ activeTab: tab }); },
    },
  }));
}

export type ContactsStore = ReturnType<typeof createContactsStore>;

export function useContactsStore(): ContactsStoreState;
export function useContactsStore<T>(selector: (state: ContactsStoreState) => T): T;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useContactsStore<T>(selector?: (state: ContactsStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<ContactsStore>("contacts");
  if (!store) throw new Error("Contacts store not initialized");
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
