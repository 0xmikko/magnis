import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
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

export function createMeetingsStore(_runtime: AppRuntime): StoreApi<MeetingsStoreState> {
  return createStore<MeetingsStoreState>((set) => ({
    selectedMeetingId: undefined,
    searchQuery: "",
    viewMode: "week",
    dateOffset: 0,
    actions: {
      setSelectedMeetingId: (id): void => { set({ selectedMeetingId: id }); },
      setSearchQuery: (query): void => { set({ searchQuery: query }); },
      setViewMode: (mode): void => { set({ viewMode: mode }); },
      setDateOffset: (offset): void => { set({ dateOffset: offset }); },
    },
  }));
}

export type MeetingsStore = ReturnType<typeof createMeetingsStore>;

export function useMeetingsStore(): MeetingsStoreState;
export function useMeetingsStore<T>(selector: (state: MeetingsStoreState) => T): T;
export function useMeetingsStore<T>(selector?: (state: MeetingsStoreState) => T): MeetingsStoreState | T {
  const runtime = useAppRuntime();
  const store = runtime.stores.get<MeetingsStore>("meetings");
  if (!store) throw new Error("Meetings store not initialized");
  return useStore(store, selector ?? ((s): T => s as unknown as T));
}
