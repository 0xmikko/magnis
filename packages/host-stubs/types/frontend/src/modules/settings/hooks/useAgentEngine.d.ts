/** Why an engine cannot be used. Mirrors `services::agents::readiness`. */
export type ReadinessReason = "ok" | "binary_missing" | "not_signed_in" | "node_missing" | "needs_model" | "unknown";
export interface EngineReadiness {
    readonly ready: boolean;
    readonly reason: ReadinessReason;
    /** One sentence a person can act on. */
    readonly detail: string;
}
interface UseAgentEngineResult {
    readonly engines: readonly string[];
    readonly current: string | null;
    readonly loading: boolean;
    /** Per-engine verdict. An engine with no entry is NOT selectable. */
    readonly readiness: Readonly<Record<string, EngineReadiness>>;
    readonly setEngine: (name: string) => Promise<void>;
    /** Why the last `setEngine` was refused, or null. */
    readonly lastError: string | null;
}
export declare function useAgentEngine(): UseAgentEngineResult;
export {};
