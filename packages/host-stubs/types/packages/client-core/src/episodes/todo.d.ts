import { type EpisodeTodoItem } from "@magnis/sdk";
import type { AgentChatStore } from "../agent/AgentChatStore.ts";
import type { AppTransport } from "../contracts/transport.ts";
import type { ClientError, ResourceStatus } from "../errors.ts";
import type { ExternalResource } from "../resource.ts";
export interface EpisodeTodo {
    readonly id: string;
    readonly items: readonly EpisodeTodoItem[];
    readonly status: ResourceStatus;
    readonly error: ClientError | null;
}
export interface EpisodeTodoResource extends ExternalResource<EpisodeTodo> {
    load(): Promise<void>;
}
export declare class EpisodeTodoSlice {
    private readonly id;
    private readonly transport;
    readonly resource: EpisodeTodoResource;
    private readonly state;
    private items;
    private status;
    private error;
    private hydrated;
    private disposed;
    private generation;
    private liveVersion;
    private operation;
    private readonly detachTodo;
    constructor(id: string, transport: AppTransport, store: AgentChatStore);
    dispose(): void;
    private load;
    private hydrate;
    private onLive;
    private snapshot;
    private publish;
    private assertActive;
    private isCurrent;
}
