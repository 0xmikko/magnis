import { useQuery } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { ProjectListItem, ProjectDetailView } from "./types";
import type { PaginatedResponse } from "@magnis/plugin-sdk";

export const projectKeys = {
  all: ["projects"] as const,
  list: (params?: Record<string, unknown>) => [...projectKeys.all, "list", params] as const,
  detail: (id: string) => [...projectKeys.all, "detail", id] as const,
  forEntity: (entityId: string) => [...projectKeys.all, "forEntity", entityId] as const,
};

export function useProjectsListQuery(limit = 100, offset = 0) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: projectKeys.list({ limit, offset }),
    queryFn: () =>
      runtime.transport.rpc<PaginatedResponse<ProjectListItem>>(
        "projects.list",
        { limit, offset },
      ),
    staleTime: 30_000,
  });
}

export function useProjectsForEntityQuery(entityId: string) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: projectKeys.forEntity(entityId),
    queryFn: () =>
      runtime.transport.rpc<readonly ProjectListItem[]>(
        "projects.list_for_entity",
        { entity_id: entityId },
      ),
    enabled: !!entityId,
  });
}

export function useProjectDetailQuery(id: string) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => runtime.transport.rpc<ProjectDetailView>("projects.get", { id }),
    enabled: !!id,
  });
}
