import { useQuery } from "@tanstack/react-query";
import type { AppRuntime } from "@magnis/host/runtime";

export interface WatchedEntityRef {
  readonly id: string;
  readonly name: string | null;
}

export interface TriggerDetail {
  readonly name: string;
  readonly gate_prompt: string;
  readonly action_prompt: string;
  readonly status: string;
  readonly watched_entities: readonly WatchedEntityRef[];
  readonly firing_count: number;
}

/**
 * Shared React-Query wrapper around `triggers.get`. Both the collapsed
 * (subtitle needs watched-entity names) and expanded (needs gate/action/
 * fired count) renderers consume this hook so the RPC fires at most once
 * per trigger id regardless of how many times the card (re)mounts.
 */
export function useTriggerDetail(
  entityId: string | undefined,
  runtime: AppRuntime,
): TriggerDetail | null {
  const query = useQuery<TriggerDetail>({
    queryKey: ["triggers", entityId],
    queryFn: () => {
      if (entityId === undefined) throw new Error("triggers.get: missing entityId");
      return runtime.transport.rpc<TriggerDetail>("triggers.get", { id: entityId });
    },
    enabled: typeof entityId === "string" && entityId.length > 0,
    staleTime: 30_000,
  });
  return query.data ?? null;
}
