import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { NoteListItem, NoteDetailView } from "./types";
import type { PaginatedResponse } from "@magnis/host/runtime";

export const noteKeys = {
  all: ["notes"] as const,
  list: (params?: Record<string, unknown>) => [...noteKeys.all, "list", params] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
};

export function useNotesListQuery(limit = 200, offset = 0): UseQueryResult<PaginatedResponse<NoteListItem>> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: noteKeys.list({ limit, offset }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<NoteListItem>>(
      "notes.list",
      { limit, offset },
    ),
    staleTime: 30_000,
  });
}

export function useNoteDetailQuery(id: string): UseQueryResult<NoteDetailView> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => runtime.transport.rpc<NoteDetailView>("notes.get", { id }),
    enabled: !!id,
    staleTime: 5_000,
  });
}
