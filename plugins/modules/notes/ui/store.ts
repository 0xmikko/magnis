import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface NotesStoreState {
  selectedNoteId: string | undefined;
  searchQuery: string;
  actions: {
    setSelectedNoteId: (id: string | undefined) => void;
    setSearchQuery: (query: string) => void;
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function createNotesStore(_runtime: AppRuntime) {
  return createStore<NotesStoreState>((set) => ({
    selectedNoteId: undefined,
    searchQuery: "",
    actions: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSelectedNoteId: (id) => { set({ selectedNoteId: id }); },
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      setSearchQuery: (query) => { set({ searchQuery: query }); },
    },
  }));
}

export type NotesStore = ReturnType<typeof createNotesStore>;

export function useNotesStore(): NotesStoreState;
export function useNotesStore<T>(selector: (state: NotesStoreState) => T): T;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useNotesStore<T>(selector?: (state: NotesStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<NotesStore>("notes");
  if (!store) throw new Error("Notes store not initialized");
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
