import type { TriggerListItem, TriggerDetailView, TriggerExecution, ResolvedWatch, WatchedEntity } from "./types";
import type { AppRuntime } from "../../runtime/contracts/runtime";
interface UseTriggersResult {
    readonly triggers: readonly TriggerListItem[];
    readonly loading: boolean;
    readonly deleteTrigger: (id: string) => Promise<void>;
    readonly setStatus: (id: string, status: string) => Promise<void>;
    readonly reload: () => Promise<void>;
}
/** Fetch triggers watching ANY of the given entity IDs, deduplicated. */
export declare function useTriggersForEntities(entityIds: readonly string[]): UseTriggersResult;
/** Pure async logic for resolving watched entities — testable without React. */
export declare function resolveWatches(watchedEntities: readonly WatchedEntity[], rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>): Promise<ResolvedWatch[]>;
export declare function useResolvedWatches(watchedEntities: readonly WatchedEntity[] | undefined, runtime: AppRuntime): readonly ResolvedWatch[];
export declare function useTriggerDetail(triggerId: string | undefined): {
    trigger: TriggerDetailView | null;
    loading: boolean;
    history: readonly TriggerExecution[];
    loadHistory: () => Promise<void>;
};
export {};
