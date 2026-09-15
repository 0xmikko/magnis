/**
 * Per-episode usage accumulation shared by every client surface (CLI
 * footer, web Context stats). Moved verbatim from the CLI hook
 * (plan agent-todo-context-panel, DEC-5 / INV-10).
 *
 * Each AI-SDK step emits one `usage` frame with per-STEP tokens (not
 * cumulative per-turn). We sum every step, dedup by `(turn_id, step_index)`
 * to protect against reconnect/replay. `cost_micros === null` means the
 * underlying llm_call row was spooled; we count the tokens but skip the
 * cost and bump `pendingCostCount`.
 */
import type { UsageEvent } from "./AgentChatStore.ts";
export interface UsageTotals {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly cacheWrite1h: number;
    readonly reasoning: number;
    readonly costMicros: number;
    readonly pendingCostCount: number;
}
export declare function emptyTotals(): UsageTotals;
/**
 * Pure reducer — applies one usage event to a running total. `seen` is a
 * mutable set mutated in place; caller owns its lifetime so dedup survives
 * across calls but resets when caller clears it (e.g. on episode change).
 *
 * Returns the same `prev` reference when the event is ignored (wrong episode,
 * duplicate) — callers can use reference equality to avoid redundant renders.
 */
export declare function applyUsage(prev: UsageTotals, seen: Set<string>, activeEpisodeId: string | null, event: UsageEvent): UsageTotals;
