import type { HttpContractLike, HttpInputFor, HttpOutputFor } from "@magnis/sdk";
import type { AppTransport, RuntimeEvent } from "../contracts/transport.ts";
import type { ClientError } from "../errors.ts";
import type { MagnisPlatform } from "../platform.ts";
import type { ExternalResource, ResourceListener } from "../resource.ts";
import type { MagnisSession } from "../session/resource.ts";
import { MagnisSessionResource } from "../session/resource.ts";
export interface MagnisConnection {
    readonly status: "idle" | "connecting" | "connected" | "disconnected" | "error";
    readonly label: string;
    readonly error: ClientError | null;
    reconnect(this: void): void;
}
export interface ConnectionResource extends ExternalResource<MagnisConnection>, AppTransport {
}
export declare class MagnisConnectionResource implements ConnectionResource {
    private readonly platform;
    private readonly session;
    private readonly state;
    private readonly schemaSubscriptions;
    private readonly typeSubscriptions;
    private client;
    private clientPairKey;
    private detachStatus;
    private status;
    private label;
    private error;
    private readonly reconnectAction;
    constructor(platform: MagnisPlatform, session: MagnisSessionResource);
    get baseUrl(): string;
    getSnapshot(): MagnisConnection;
    subscribe(listener: ResourceListener): () => void;
    syncSession(snapshot: MagnisSession): void;
    dispose(): void;
    http<Contract extends HttpContractLike>(contract: Contract, input: HttpInputFor<Contract>): Promise<HttpOutputFor<Contract>>;
    rpc<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    onSchemaEvent(schemaIds: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
    onEventType(eventTypes: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
    private reconnect;
    private tokenForPair;
    private activeClient;
    private applyConnectionStatus;
    private bindSubscriptions;
    private disposeClient;
    private createSnapshot;
    private publish;
}
