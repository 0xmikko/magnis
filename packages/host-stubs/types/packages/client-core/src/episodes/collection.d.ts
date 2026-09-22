import type { EpisodeReasoningSelection } from "@magnis/sdk/core/ai-model";
import type { AgentImplementationId, EpisodeListItem } from "@magnis/sdk/core/episode";
import type { AppTransport } from "../contracts/transport.ts";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { ExternalResource, ResourceListener } from "../resource.ts";
export interface CreateEpisodeInput {
    readonly title: string;
    readonly requestId?: string;
    readonly implementationId?: AgentImplementationId;
    readonly modelId?: string;
    readonly reasoning?: EpisodeReasoningSelection;
    readonly profileId?: string;
}
export interface AgentImplementationOption {
    readonly id: AgentImplementationId;
    readonly displayName: string;
    readonly nativeSession: boolean;
    readonly usesLlmRuntime: boolean;
    readonly available?: boolean;
    readonly unavailableReason?: string | null;
}
export interface AgentImplementationOptions {
    readonly defaultImplementationId: AgentImplementationId;
    readonly implementations: readonly AgentImplementationOption[];
}
export interface EpisodeCollection {
    readonly items: readonly EpisodeListItem[];
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeCollectionResource extends ExternalResource<EpisodeCollection> {
    refresh(): Promise<void>;
    create(input: CreateEpisodeInput): Promise<string>;
    archive(episodeId: string): Promise<void>;
    unarchive(episodeId: string): Promise<void>;
    getImplementationOptions(): Promise<AgentImplementationOptions>;
    setDefaultImplementation(implementationId: AgentImplementationId): Promise<void>;
    reset(): void;
}
export declare class MagnisEpisodeCollectionResource implements EpisodeCollectionResource {
    private readonly transport;
    private readonly state;
    private items;
    private status;
    private error;
    private refreshPromise;
    private generation;
    constructor(transport: AppTransport);
    getSnapshot(): EpisodeCollection;
    subscribe(listener: ResourceListener): () => void;
    refresh(): Promise<void>;
    create(input: CreateEpisodeInput): Promise<string>;
    archive(episodeId: string): Promise<void>;
    unarchive(episodeId: string): Promise<void>;
    getImplementationOptions(): Promise<AgentImplementationOptions>;
    setDefaultImplementation(implementationId: AgentImplementationId): Promise<void>;
    reset(): void;
    private loadAll;
    private setArchived;
    private createSnapshot;
    private publish;
    private assertGeneration;
}
