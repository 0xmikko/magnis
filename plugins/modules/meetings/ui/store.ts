import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppRuntime } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface MeetingsStoreState {
  selectedMeetingId: string | undefined;
  searchQuery: string;
  viewMode: "day" | "week" | "month";
  dateOffset: number;
  actions: {
    setSelectedMeetingId: (id: string | undefined) => void;
    setSearchQuery: (query: string) => void;
    setViewMode: (mode: MeetingsStoreState["viewMode"]) => void;
    setDateOffset: (offset: number) => void;
  };
}

export function createMeetingsStore(_runtime: AppRuntime) {
  return createStore<MeetingsStoreState>((set) => ({
    selectedMeetingId: undefined,
    searchQuery: "",
    viewMode: "week",
    dateOffset: 0,
    actions: {
      setSelectedMeetingId: (id) => { set({ selectedMeetingId: id }); },
      setSearchQuery: (query) => { set({ searchQuery: query }); },
      setViewMode: (mode) => { set({ viewMode: mode }); },
      setDateOffset: (offset) => { set({ dateOffset: offset }); },
    },
  }));
}

export type MeetingsStore = ReturnType<typeof createMeetingsStore>;

export function useMeetingsStore(): MeetingsStoreState;
export function useMeetingsStore<T>(selector: (state: MeetingsStoreState) => T): T;
export function useMeetingsStore<T>(selector?: (state: MeetingsStoreState) => T) {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<MeetingsStore>("meetings");
  if (!store) throw new Error("Meetings store not initialized");
  return useStore(store, selector ?? ((s) => s as unknown as T));
}
