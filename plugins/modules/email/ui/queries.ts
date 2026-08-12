import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";

import { googleSourceConnected } from "./sourceStatus";

import type { SourceStatusListResponse } from "@magnis/client-core";
import type { MessageDetailView } from "./types";

export const emailKeys = {
  all: ["email"] as const,
  list: (params?: Record<string, unknown>) => [...emailKeys.all, "list", params] as const,
  detail: (id: string) => [...emailKeys.all, "detail", id] as const,
  sourceStatus: ["email", "source-status"] as const,
};

export function useEmailDetailQuery(id: string): UseQueryResult<MessageDetailView> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: emailKeys.detail(id),
    queryFn: () => runtime.transport.rpc<MessageDetailView>("email.get", { id }),
    enabled: !!id,
  });
}

export function useGoogleSourceConnectedQuery(): UseQueryResult<boolean> {
  const runtime = useAppRuntime();
  return useQuery<SourceStatusListResponse, Error, boolean>({
    queryKey: emailKeys.sourceStatus,
    queryFn: () => runtime.transport.rpc<SourceStatusListResponse>("source.status.list"),
    select: googleSourceConnected,
    staleTime: 60_000,
  });
}
