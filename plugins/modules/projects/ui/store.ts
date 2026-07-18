import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface ProjectsStoreState {
  selectedProjectId: string | undefined;
  searchQuery: string;
  actions: {
    setSelectedProjectId: (id: string | undefined) => void;
    setSearchQuery: (query: string) => void;
  };
}

export function createProjectsStore(_runtime: AppRuntime): StoreApi<ProjectsStoreState> {
  return createStore<ProjectsStoreState>((set) => ({
    selectedProjectId: undefined,
    searchQuery: "",
    actions: {
      setSelectedProjectId: (id): void => { set({ selectedProjectId: id }); },
      setSearchQuery: (query): void => { set({ searchQuery: query }); },
    },
  }));
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;

export function useProjectsStore(): ProjectsStoreState;
export function useProjectsStore<T>(selector: (state: ProjectsStoreState) => T): T;
export function useProjectsStore<T>(selector?: (state: ProjectsStoreState) => T): ProjectsStoreState | T {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<ProjectsStore>("projects");
  if (!store) throw new Error("Projects store not initialized");
  return useStore(store, selector ?? ((s): T => s as unknown as T));
}
