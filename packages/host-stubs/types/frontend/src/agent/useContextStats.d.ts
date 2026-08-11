import type { AppRuntime } from "../runtime/contracts/runtime";
export interface StatsDeps {
    /** Episode-cumulative cost in micros; null when the episode has none. */
    readonly fetchEpisodeCostMicros: (episodeId: string) => Promise<number | null>;
    /** models.dev context window for a model; null when unknown (CON-3). */
    readonly fetchContextLimit: (provider: string, model: string) => Promise<number | null>;
}
export declare function defaultStatsDeps(runtime: AppRuntime): StatsDeps;
export interface ContextStats {
    readonly tokens: number | null;
    readonly percent: number | null;
    readonly costMicros: number | null;
}
export declare function useContextStats(runtime: AppRuntime, episodeId: string | null, enabled: boolean, deps: StatsDeps): ContextStats;
