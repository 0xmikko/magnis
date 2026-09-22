import type { EpisodeReasoningSelection } from "@magnis/sdk/core/ai-model";
import type { AgentImplementationId, AgentModelOption } from "@magnis/sdk";
import type { AppTransport } from "../contracts/transport.ts";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { ExternalResource } from "../resource.ts";
import type { ChatMessageAttachment, EpisodeState, PendingPrompt, UIContext } from "../types/episode.ts";
import type { EpisodeContextResource } from "./context.ts";
import type { AgentImplementationOption } from "./collection.ts";
import type { EpisodeTodoResource } from "./todo.ts";
import type { ToolCardModel } from "./tools.ts";
import type { EpisodeUsageResource } from "./usage.ts";
export interface EpisodeMetadata {
    readonly rootEpisodeId: string | null;
    readonly parentEpisodeId: string | null;
    readonly openDelegations: number | null;
    readonly hasUnfinishedDescendants: boolean | null;
    readonly id: string;
    readonly title: string | null;
    readonly implementationId: AgentImplementationId | null;
    readonly profileId: string | null;
    readonly modelId: string | null;
    readonly bindingRevision: number | null;
    readonly reasoning: EpisodeReasoningSelection | null;
    readonly implementations: readonly AgentImplementationOption[];
    readonly models: readonly AgentModelOption[];
    readonly agentOptionsStatus: ResourceStatus;
    readonly agentOptionsError: ClientError | null;
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeSendInput {
    readonly text: string;
    readonly context?: UIContext;
    readonly contextEntityId?: string;
    readonly attachments?: readonly ChatMessageAttachment[];
    readonly displayContent?: string;
    readonly episodeTitle?: string;
    readonly fileAttachmentIds?: readonly string[];
}
export interface EpisodeMessaging {
    readonly id: string;
    readonly state: EpisodeState;
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeTools {
    readonly id: string;
    readonly cards: readonly ToolCardModel[];
    readonly prompts: readonly PendingPrompt[];
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeMetadataResource extends ExternalResource<EpisodeMetadata> {
    load(): Promise<void>;
    refresh(): Promise<void>;
    setTitle(title: string): Promise<void>;
    setModel(modelId: string, reasoning?: EpisodeReasoningSelection): Promise<void>;
    refreshSummary(): Promise<void>;
    loadAgentOptions(): Promise<void>;
}
export interface EpisodeMessagingResource extends ExternalResource<EpisodeMessaging> {
    load(): Promise<void>;
    refresh(): Promise<void>;
    send(input: EpisodeSendInput): Promise<void>;
    stop(): Promise<void>;
}
export interface EpisodeToolsResource extends ExternalResource<EpisodeTools> {
    load(): Promise<void>;
    approve(toolCallId: string, argumentsOverride?: unknown): Promise<void>;
    deny(toolCallId: string): Promise<void>;
    answer(toolCallId: string, answer: string): Promise<void>;
    markDone(toolCallId: string): void;
}
export interface EpisodeResource {
    readonly id: string;
    readonly metadata: EpisodeMetadataResource;
    readonly messaging: EpisodeMessagingResource;
    readonly tools: EpisodeToolsResource;
    readonly context: EpisodeContextResource;
    readonly todo: EpisodeTodoResource;
    readonly usage: EpisodeUsageResource;
    load(): Promise<void>;
    dispose(): void;
}
export declare class MagnisEpisodeResource implements EpisodeResource {
    readonly id: string;
    private readonly transport;
    readonly metadata: EpisodeMetadataResource;
    readonly messaging: EpisodeMessagingResource;
    readonly tools: EpisodeToolsResource;
    readonly context: EpisodeContextResource;
    readonly todo: EpisodeTodoResource;
    readonly usage: EpisodeUsageResource;
    private readonly store;
    private readonly metadataState;
    private readonly messagingState;
    private readonly toolsState;
    private readonly contextSlice;
    private readonly todoSlice;
    private readonly usageSlice;
    private episodeState;
    private status;
    private error;
    private implementations;
    private models;
    private agentOptionsStatus;
    private agentOptionsError;
    private loadPromise;
    private pendingModelChange;
    private hydrated;
    private disposed;
    private lifecycleGeneration;
    private readonly detachStore;
    constructor(id: string, transport: AppTransport);
    load(): Promise<void>;
    dispose(): void;
    private hydrate;
    private createMetadataResource;
    private createMessagingResource;
    private createToolsResource;
    private send;
    private refresh;
    private refreshFromEvent;
    private stop;
    private approve;
    private deny;
    private answer;
    private markDone;
    private setTitle;
    private setModel;
    private changeModel;
    private refreshSummary;
    private loadAgentOptions;
    private loadModels;
    private createMetadataSnapshot;
    private createMessagingSnapshot;
    private createToolsSnapshot;
    private publish;
    private assertActive;
    private beginOperation;
    private isCurrent;
    private assertCurrent;
}
