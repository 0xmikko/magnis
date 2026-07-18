import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface CompaniesStoreState {
  selectedCompanyId: string | undefined;
  searchQuery: string;
  actions: {
    setSelectedCompanyId: (id: string | undefined) => void;
    setSearchQuery: (query: string) => void;
  };
}

export function createCompaniesStore(_runtime: AppRuntime) {
  return createStore<CompaniesStoreState>((set) => ({
    selectedCompanyId: undefined,
    searchQuery: "",
    actions: {
      setSelectedCompanyId: (id) => { set({ selectedCompanyId: id }); },
      setSearchQuery: (query) => { set({ searchQuery: query }); },
    },
  }));
}

export type CompaniesStore = ReturnType<typeof createCompaniesStore>;

export function useCompaniesStore(): CompaniesStoreState;
export function useCompaniesStore<T>(selector: (state: CompaniesStoreState) => T): T;
export function useCompaniesStore<T>(selector?: (state: CompaniesStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<CompaniesStore>("companies");
  if (!store) throw new Error("Companies store not initialized");
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
