import type { AgentImplementationId } from "@magnis/sdk";
import type { AgentImplementationOption } from "@magnis/client-core";
/** Global default used only when a new Episode omits an Agent selection. */
export declare function useAgentImplementation(options?: {
    readonly enabled?: boolean;
}): {
    readonly implementations: readonly AgentImplementationOption[];
    readonly current: AgentImplementationId | null;
    readonly loading: boolean;
    readonly setDefault: (implementationId: AgentImplementationId) => Promise<void>;
    readonly lastError: string | null;
};
