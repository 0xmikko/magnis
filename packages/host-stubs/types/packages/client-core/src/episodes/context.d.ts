import type { LinkedEntitySummary } from "@magnis/sdk";
import type { AppTransport } from "../contracts/transport.ts";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { ExternalResource } from "../resource.ts";
export type EpisodeContextEntity = LinkedEntitySummary;
export interface EpisodeContext {
    readonly id: string;
    readonly entities: readonly EpisodeContextEntity[];
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeContextResource extends ExternalResource<EpisodeContext> {
    load(): Promise<void>;
    refresh(): Promise<void>;
}
interface EpisodeContextSliceOptions {
    readonly id: string;
    readonly transport: AppTransport;
    readonly loadEpisode: () => Promise<void>;
    readonly refreshEpisode: () => Promise<void>;
}
export declare function deduplicateEpisodeContext(entities: readonly EpisodeContextEntity[]): readonly EpisodeContextEntity[];
export declare class EpisodeContextSlice {
    private readonly options;
    readonly resource: EpisodeContextResource;
    private readonly state;
    private sourceEntities;
    private entities;
    private status;
    private error;
    private disposed;
    private operation;
    constructor(options: EpisodeContextSliceOptions);
    update(entities: readonly EpisodeContextEntity[]): void;
    dispose(): void;
    private run;
    private snapshot;
    private publish;
}
export {};
