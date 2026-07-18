import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { PaginatedResponse } from "@magnis/host/runtime";
import { noteKeys } from "./queries";
import type { NoteDetailView, NoteListItem } from "./types";

interface CreateNoteParams {
  readonly title: string;
  readonly body: string;
}

interface CreateNoteResult {
  readonly id: string;
}

interface UpdateNoteParams {
  readonly id: string;
  readonly title?: string;
  readonly body?: string;
}

interface DeleteNoteParams {
  readonly id: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useCreateNoteMutation() {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  return useMutation<CreateNoteResult, Error, CreateNoteParams>({
    mutationFn: (params) =>
      runtime.transport.rpc<CreateNoteResult>("notes.create", { ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useUpdateNoteMutation() {
  const runtime = useAppRuntime();
  // The plugin UI runs on its OWN react-query client (the detail panel reads
  // from it). The sidebar list, however, is the HOST's `useModuleList` query,
  // which reads from `runtime.queryClient`. So list cache writes/invalidations
  // MUST target the host client, or the rename only shows after a full reload.
  const queryClient = useQueryClient();
  const hostQueryClient = runtime.queryClient;

  return useMutation<
    unknown,
    Error,
    UpdateNoteParams,
    {
      previous: NoteDetailView | undefined;
      id: string;
      previousLists: [readonly unknown[], unknown][];
    }
  >({
    mutationFn: (params) =>
      runtime.transport.rpc("notes.update", { ...params }),
    onMutate: async (variables) => {
      // Cancel any in-flight refetches so they can't overwrite our optimistic update
      await queryClient.cancelQueries({
        queryKey: noteKeys.detail(variables.id),
      });
      const previous = queryClient.getQueryData<NoteDetailView>(
        noteKeys.detail(variables.id),
      );
      queryClient.setQueryData<NoteDetailView>(
        noteKeys.detail(variables.id),
        (old) => (old ? { ...old, ...variables } : old),
      );

      // Optimistically patch the renamed title into every cached notes list so
      // the left panel updates at the SAME time as the detail (previously the
      // list only caught up on the next refetch — a visible lag on rename).
      let previousLists: [readonly unknown[], unknown][] = [];
      if (variables.title !== undefined) {
        const newTitle = variables.title;
        const listKey = [...noteKeys.all, "list"];
        // The host renders the SELECTED row from a separate `selected-list-item`
        // query (BaseModuleComponent), which is disabled once the note is in the
        // list — so invalidation won't refetch it. Patch its cache directly, or
        // the renamed selected note keeps its old title in the sidebar.
        const selectedKey = [
          ...noteKeys.detail(variables.id),
          "selected-list-item",
        ];
        await hostQueryClient.cancelQueries({ queryKey: listKey });
        await hostQueryClient.cancelQueries({ queryKey: selectedKey });
        previousLists = [
          ...hostQueryClient.getQueriesData({ queryKey: listKey }),
          ...hostQueryClient.getQueriesData({ queryKey: selectedKey }),
        ];
        hostQueryClient.setQueriesData<PaginatedResponse<NoteListItem>>(
          { queryKey: listKey },
          (old) =>
            old && Array.isArray(old.items)
              ? {
                  ...old,
                  items: old.items.map((it) =>
                    it.id === variables.id ? { ...it, title: newTitle } : it,
                  ),
                }
              : old,
        );
        hostQueryClient.setQueryData<Record<string, unknown>>(
          selectedKey,
          (old) => (old ? { ...old, title: newTitle } : old),
        );
      }

      return { previous, id: variables.id, previousLists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          noteKeys.detail(context.id),
          context.previous,
        );
      }
      for (const [key, data] of context?.previousLists ?? []) {
        hostQueryClient.setQueryData(key, data);
      }
    },
    onSettled: (_data, _err, variables) => {
      // Sidebar list lives on the host client; detail on the plugin client.
      void hostQueryClient.invalidateQueries({ queryKey: noteKeys.all });
      void queryClient.invalidateQueries({ queryKey: noteKeys.all });
      void queryClient.invalidateQueries({
        queryKey: noteKeys.detail(variables.id),
      });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useDeleteNoteMutation() {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, DeleteNoteParams>({
    mutationFn: (params) =>
      runtime.transport.rpc("notes.delete", { ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
