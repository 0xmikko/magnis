import type { AppTransport } from "./contracts/transport.ts";
import type { ConnectionResource } from "./connection/resource.ts";
import type { EpisodeRegistry } from "./episodes/registry.ts";
import type { MagnisPlatform } from "./platform.ts";
import type { SessionResource } from "./session/resource.ts";
import type { WorkspaceConnectionsResource } from "./workspaces/resource.ts";
export interface MagnisClientOptions {
    readonly platform: MagnisPlatform;
}
export interface MagnisClient {
    readonly workspaces: WorkspaceConnectionsResource;
    readonly session: SessionResource;
    readonly connection: ConnectionResource;
    readonly episodes: EpisodeRegistry;
    readonly transport: AppTransport;
    start(): Promise<void>;
    dispose(): Promise<void>;
}
export declare function createMagnisClient(options: MagnisClientOptions): MagnisClient;
