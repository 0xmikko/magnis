import type { AppTransport } from "../contracts/transport.ts";
import type { EpisodeCollectionResource } from "./collection.ts";
import { MagnisEpisodeCollectionResource } from "./collection.ts";
import type { EpisodeResource } from "./resource.ts";
export interface EpisodeRegistry {
    readonly collection: EpisodeCollectionResource;
    forId(episodeId: string): EpisodeResource;
    disposeSession(): void;
    dispose(): void;
}
export declare class MagnisEpisodeRegistry implements EpisodeRegistry {
    private readonly transport;
    readonly collection: MagnisEpisodeCollectionResource;
    private readonly resources;
    private disposed;
    constructor(transport: AppTransport);
    forId(episodeId: string): EpisodeResource;
    disposeSession(): void;
    dispose(): void;
}
export declare function createEpisodeRegistry(transport: AppTransport): EpisodeRegistry;
