import type { JSX } from "react";
import type { AppRuntime } from "../../runtime/contracts/runtime";
import { type StatsDeps } from "./useContextStats";
export declare function AgentStatsRegion({ runtime, contextKey, episodeId, engineCurrent, deps, primaryEntityId, nameOf, }: {
    readonly runtime: AppRuntime;
    readonly contextKey: string;
    readonly episodeId: string | null;
    readonly engineCurrent: string | null;
    readonly deps?: StatsDeps;
    /** Anchor for the hypotheses region — a hypothesis is about something. */
    readonly primaryEntityId?: string | null;
    readonly nameOf?: (id: string) => string;
}): JSX.Element | null;
/**
 * AgentStatsRegionConnected — self-gating wrapper for hosting the region
 * inside the right Context panel. Resolves the current engine itself (via the
 * cached agent.get_engine query, deduped with AgentPanel's own read) so call
 * sites only pass runtime + contextKey + episodeId.
 */
export declare function AgentStatsRegionConnected({ runtime, contextKey, episodeId, }: {
    readonly runtime: AppRuntime;
    readonly contextKey: string;
    readonly episodeId: string | null;
}): JSX.Element | null;
