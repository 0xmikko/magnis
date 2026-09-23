import type { Workspace } from "@magnis/sdk/core/workspace";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { MagnisPlatform, WorkspaceConnectionSource } from "../platform.ts";
import type { ExternalResource, ResourceListener } from "../resource.ts";
export interface WorkspaceConnection {
    readonly id: string;
    readonly url: string;
    readonly source: WorkspaceConnectionSource;
    readonly workspace: Workspace | null;
    readonly status: "idle" | "discovering" | "ready" | "error";
    readonly error: ClientError | null;
}
export interface WorkspaceConnections {
    readonly items: readonly WorkspaceConnection[];
    readonly selectedId: string | null;
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
    add(this: void, url: string): Promise<string>;
    update(this: void, connectionId: string, url: string): Promise<void>;
    remove(this: void, connectionId: string): Promise<void>;
    select(this: void, connectionId: string): Promise<void>;
    refresh(this: void, connectionId: string): Promise<void>;
}
export interface WorkspaceConnectionsResource extends ExternalResource<WorkspaceConnections> {
}
export type SelectedConnectionHandler = (connection: WorkspaceConnection | null) => Promise<void>;
export declare class MagnisWorkspaceConnectionsResource implements WorkspaceConnectionsResource {
    private readonly platform;
    private readonly state;
    private items;
    private selectedId;
    private status;
    private error;
    private generation;
    private lifecycleGeneration;
    private started;
    private selectedConnectionHandler;
    private readonly addAction;
    private readonly updateAction;
    private readonly removeAction;
    private readonly selectAction;
    private readonly refreshAction;
    constructor(platform: MagnisPlatform);
    getSnapshot(): WorkspaceConnections;
    subscribe(listener: ResourceListener): () => void;
    setSelectedConnectionHandler(handler: SelectedConnectionHandler): void;
    selectedConnection(): WorkspaceConnection | null;
    start(): Promise<void>;
    dispose(): Promise<void>;
    private isCurrentLifecycle;
    private add;
    private update;
    private remove;
    private select;
    private refresh;
    private assertConnection;
    private persistConnections;
    private createSnapshot;
    private publish;
}
