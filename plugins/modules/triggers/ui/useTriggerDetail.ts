import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AppRuntime } from "@magnis/host/runtime";
import type { TriggerDetailView } from "../types";
import { triggerKeys } from "./queries";

export interface WatchedEntityRef {
  readonly id: string;
  readonly name: string | null;
}

export interface TriggerExecutionRef {
  readonly fired_at: string;
  readonly outcome: string;
}

/**
 * `triggers.get` for one trigger, as a query. ONE cache entry per id: the card
 * and the detail panel are both consumers, and when the panel kept its own key
 * the card's status and the panel's Pause button read from separate entries that
 * only agreed because a prefix invalidation happened to catch both.
 */
export function useTriggerDetailQuery(
  entityId: string | undefined,
  runtime: AppRuntime,
): UseQueryResult<TriggerDetailView> {
  return useQuery<TriggerDetailView>({
    queryKey: triggerKeys.detail(entityId),
    queryFn: () => {
      if (entityId === undefined) throw new Error("triggers.get: missing entityId");
      return runtime.transport.rpc<TriggerDetailView>("triggers.get", { id: entityId });
    },
    enabled: typeof entityId === "string" && entityId.length > 0,
    staleTime: 10_000,
  });
}

/**
 * The same read, as a value. Both the collapsed (subtitle needs watched-entity
 * names) and expanded (needs gate/action/fired count) card renderers consume
 * this, so the RPC fires at most once per trigger id however many times the
 * card (re)mounts.
 */
export function useTriggerDetail(
  entityId: string | undefined,
  runtime: AppRuntime,
): TriggerDetailView | null {
  return useTriggerDetailQuery(entityId, runtime).data ?? null;
}

/**
 * The trigger's own execution history. `@tool("fire_history")` forwards the
 * native indexed read, so the cost does not grow with the trigger's past — the
 * panel asks the module, not the graph.
 */
export function useTriggerHistory(
  entityId: string | undefined,
  runtime: AppRuntime,
): readonly TriggerExecutionRef[] {
  const query = useQuery<readonly TriggerExecutionRef[]>({
    queryKey: triggerKeys.history(entityId),
    queryFn: () => {
      if (entityId === undefined) throw new Error("triggers.fire_history: missing entityId");
      return runtime.transport.rpc<readonly TriggerExecutionRef[]>("triggers.fire_history", {
        trigger_id: entityId,
      });
    },
    enabled: typeof entityId === "string" && entityId.length > 0,
    staleTime: 10_000,
  });
  return query.data ?? [];
}
