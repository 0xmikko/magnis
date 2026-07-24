import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { MessageDetailView } from "./types";

export const emailKeys = {
  all: ["email"] as const,
  list: (params?: Record<string, unknown>) => [...emailKeys.all, "list", params] as const,
  detail: (id: string) => [...emailKeys.all, "detail", id] as const,
  integrations: ["email", "integrations"] as const,
};

export function useEmailDetailQuery(id: string): UseQueryResult<MessageDetailView> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: emailKeys.detail(id),
    queryFn: () => runtime.transport.rpc<MessageDetailView>("email.get", { id }),
    enabled: !!id,
  });
}

interface IntegrationsStatus {
  readonly google: { readonly connected: boolean };
}

export function useIntegrationsStatusQuery(): UseQueryResult<IntegrationsStatus> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: emailKeys.integrations,
    queryFn: () => runtime.transport.rpc<IntegrationsStatus>("integrations.status"),
    staleTime: 60_000,
  });
}
