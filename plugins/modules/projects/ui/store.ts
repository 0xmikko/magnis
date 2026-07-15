import { createStore } from "zustand/vanilla";
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function createProjectsStore(_runtime: AppRuntime) {
  return createStore<ProjectsStoreState>((set) => ({
    selectedProjectId: undefined,
    searchQuery: "",
    actions: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSelectedProjectId: (id) => { set({ selectedProjectId: id }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSearchQuery: (query) => { set({ searchQuery: query }); },
    },
  }));
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;

export function useProjectsStore(): ProjectsStoreState;
export function useProjectsStore<T>(selector: (state: ProjectsStoreState) => T): T;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useProjectsStore<T>(selector?: (state: ProjectsStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<ProjectsStore>("projects");
  if (!store) throw new Error("Projects store not initialized");
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
