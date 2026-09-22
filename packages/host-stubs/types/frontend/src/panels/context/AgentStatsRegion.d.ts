/** Episode-owned Todo, hypotheses and memory rendered inside the frontend host. */
import type { JSX } from "react";
import type { AgentImplementationId } from "@magnis/sdk";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export declare function AgentStatsRegion({ runtime, episodeId, implementationId, }: {
    readonly runtime: AppRuntime;
    readonly episodeId: string | null;
    readonly implementationId: AgentImplementationId | null;
    readonly primaryEntityId?: string | null;
    readonly nameOf?: (id: string) => string;
}): JSX.Element | null;
export declare function AgentStatsRegionConnected({ runtime, episodeId, implementationId, }: {
    readonly runtime: AppRuntime;
    readonly episodeId: string | null;
    readonly implementationId: AgentImplementationId | null;
}): JSX.Element | null;
