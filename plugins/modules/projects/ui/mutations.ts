import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import { projectKeys } from "./queries";
import type { ProjectListItem } from "./types";
import type { PaginatedResponse } from "@magnis/plugin-sdk";

interface CreateProjectParams {
  readonly name: string;
  readonly status?: string;
}

interface CreateProjectResult {
  readonly id: string;
}

interface RenameProjectParams {
  readonly id: string;
  readonly name: string;
}

export function useRenameProjectMutation() {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  return useMutation<void, Error, RenameProjectParams>({
    mutationFn: (params) =>
      runtime.transport.rpc<void>("projects.update", { id: params.id, name: params.name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useCreateProjectMutation() {
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();

  return useMutation<CreateProjectResult, Error, CreateProjectParams, { previous: PaginatedResponse<ProjectListItem> | undefined }>({
    mutationFn: (params) =>
      runtime.transport.rpc<CreateProjectResult>("projects.create", { ...params }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });

      const listKey = projectKeys.list({ limit: 100, offset: 0 });
      const previous = queryClient.getQueryData<PaginatedResponse<ProjectListItem>>(listKey);

      const optimistic: ProjectListItem = {
        id: "_pending",
        name: variables.name,
        status: variables.status ?? null,
        avatar_color: "blue",
        initials: variables.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""),
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<PaginatedResponse<ProjectListItem>>(listKey, (old) => ({
        items: [optimistic, ...(old?.items ?? [])],
        total: (old?.total ?? 0) + 1,
        limit: old?.limit ?? 100,
        offset: old?.offset ?? 0,
      }));

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        const listKey = projectKeys.list({ limit: 100, offset: 0 });
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
