import type { EpisodeUsageQuery } from "@magnis/sdk";
import type { AppTransport } from "../contracts/transport.ts";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { ExternalResource } from "../resource.ts";
export interface EpisodeUsage {
    readonly id: string;
    readonly from: string | null;
    readonly to: string | null;
    readonly episodeTitle: string | null;
    readonly totalTokens: number;
    readonly costMicros: number;
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeUsageResource extends ExternalResource<EpisodeUsage> {
    load(range: EpisodeUsageQuery): Promise<void>;
    refresh(): Promise<void>;
}
/** Retained per-Episode projection over the one canonical range query. */
export declare class EpisodeUsageSlice {
    private readonly id;
    private readonly transport;
    readonly resource: EpisodeUsageResource;
    private readonly state;
    private range;
    private summary;
    private status;
    private error;
    private disposed;
    private generation;
    private operation;
    constructor(id: string, transport: AppTransport);
    dispose(): void;
    private load;
    private refresh;
    private read;
    private hydrate;
    private snapshot;
    private publish;
    private assertActive;
    private isCurrent;
}
