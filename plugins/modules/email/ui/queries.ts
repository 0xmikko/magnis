import { useQuery } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { MessageDetailView } from "./types";

export const emailKeys = {
  all: ["email"] as const,
  list: (params?: Record<string, unknown>) => [...emailKeys.all, "list", params] as const,
  detail: (id: string) => [...emailKeys.all, "detail", id] as const,
  integrations: ["email", "integrations"] as const,
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useEmailDetailQuery(id: string) {
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useIntegrationsStatusQuery() {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: emailKeys.integrations,
    queryFn: () => runtime.transport.rpc<IntegrationsStatus>("integrations.status"),
    staleTime: 60_000,
  });
}
