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

export function createNotesStore(_runtime: AppRuntime) {
  return createStore<NotesStoreState>((set) => ({
    selectedNoteId: undefined,
    searchQuery: "",
    actions: {
      setSelectedNoteId: (id) => { set({ selectedNoteId: id }); },
      setSearchQuery: (query) => { set({ searchQuery: query }); },
    },
  }));
}

export type NotesStore = ReturnType<typeof createNotesStore>;

export function useNotesStore(): NotesStoreState;
export function useNotesStore<T>(selector: (state: NotesStoreState) => T): T;
export function useNotesStore<T>(selector?: (state: NotesStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<NotesStore>("notes");
  if (!store) throw new Error("Notes store not initialized");
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
