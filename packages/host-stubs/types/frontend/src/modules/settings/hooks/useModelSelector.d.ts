import type { AgentImplementationOption } from "@magnis/client-core";
import type { AgentImplementationId, AgentModelOption } from "@magnis/sdk";
import type { EpisodeReasoningSelection, ReasoningCapabilities } from "@magnis/sdk/core/ai-model";
export interface ModelSelectorItem {
    readonly id: string;
    readonly label: string;
    readonly section: "agent" | "model";
    readonly implementationId: AgentImplementationId;
    readonly modelId?: string;
    readonly providerDisplayName?: string | null;
    readonly providerConnectionId?: string | null;
    readonly dataBoundary?: AgentModelOption["dataBoundary"];
    readonly available?: boolean;
    readonly unavailableReason?: string | null;
    readonly reasoning?: ReasoningCapabilities;
}
export interface ChatSelection {
    readonly implementationId: AgentImplementationId;
    readonly modelId: string;
    readonly reasoning: EpisodeReasoningSelection;
}
export interface EpisodeSelectionSource {
    readonly id: string;
    readonly implementationId: AgentImplementationId | null;
    readonly modelId: string | null;
    readonly reasoning: EpisodeReasoningSelection | null;
    readonly models: readonly AgentModelOption[];
    readonly loading: boolean;
    readonly error: string | null;
    readonly active: boolean;
    readonly setModel: (modelId: string, reasoning?: EpisodeReasoningSelection) => Promise<void>;
    readonly refresh: () => Promise<void>;
}
export interface UseModelSelectorResult {
    readonly agents: readonly AgentImplementationOption[];
    readonly items: readonly ModelSelectorItem[];
    readonly current: ModelSelectorItem | null;
    readonly selection: ChatSelection | null;
    readonly reasoning: EpisodeReasoningSelection | null;
    readonly capabilities: ReasoningCapabilities | null;
    readonly catalogAgentId: AgentImplementationId | null;
    readonly isDraft: boolean;
    readonly loading: boolean;
    readonly changing: boolean;
    readonly error: string | null;
    readonly disabledReason: string | null;
    readonly locked: boolean;
    readonly caption: string;
    readonly captionDetail: string;
    readonly browseAgent: (id: AgentImplementationId) => void;
    readonly select: (item: ModelSelectorItem) => Promise<void>;
    readonly setReasoning: (selection: EpisodeReasoningSelection) => Promise<void>;
    readonly refresh: () => Promise<void>;
}
export declare function agentLabel(id: AgentImplementationId | null): string;
export declare function reasoningCaption(reasoning: EpisodeReasoningSelection | null, capabilities?: ReasoningCapabilities | null): string;
/** Draft choice is local state; an existing Episode commits through its retained resource. */
export declare function useModelSelector(episode?: EpisodeSelectionSource): UseModelSelectorResult;
