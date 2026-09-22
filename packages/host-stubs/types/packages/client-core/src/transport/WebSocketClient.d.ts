/**
 * WebSocketClient — standalone WebSocket transport for the gateway's RPC
 * and event frames.
 *
 * Pure TypeScript, no React dependency. Owns:
 *   - socket lifecycle (connect / auth frame / reconnect / backoff)
 *   - rpc request tracking (rpc → rpc.result / rpc.error)
 *   - server-push event dispatch (onSchemaEvent / onEventType)
 *   - connection status with external listeners (subscribeStatus)
 */
import type { HttpContractLike, HttpInputFor, HttpOutputFor } from "@magnis/sdk";
import type { FetchImplementation, WebSocketFactory, WebSocketLike } from "../platform.ts";
export declare function adaptWebSocket(socket: WebSocket): WebSocketLike;
export interface Rpc {
    http<Contract extends HttpContractLike>(contract: Contract, input: HttpInputFor<Contract>): Promise<HttpOutputFor<Contract>>;
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    readonly baseUrl: string;
}
export interface StreamEvent {
    readonly type: string;
    readonly payload?: unknown;
    readonly timestamp: string;
}
export interface ConnectionStatus {
    readonly connected: boolean;
    readonly label: string;
}
export interface WebSocketClientOptions {
    readonly fetch: FetchImplementation;
    readonly createWebSocket: WebSocketFactory;
}
type VoidHandler = () => void;
type StatusListener = (status: ConnectionStatus) => void;
export declare class WebSocketClient {
    readonly baseUrl: string;
    private ws;
    private reconnectTimer;
    private backoff;
    private intentionalClose;
    /** True between scheduling a reconnect and the next successful auth. While
     *  set, `onopen` keeps the steady "disconnected … reconnecting…" label
     *  instead of re-flashing the transient "Authenticating…" each cycle. */
    private reconnecting;
    /** Set when THIS connection attempt got no auth token (bootstrap returned
     *  null while the socket was open) — so the close reads as "Not signed in"
     *  rather than a generic dropped-connection. Reset each attempt. */
    private noTokenThisAttempt;
    private counter;
    private authed;
    /** Set when THIS attempt sent a NON-empty token. If the server then rejects
     *  it (auth-fail close), the token is stale — we clear it via `onAuthReject`
     *  so the owning login gate can return to authentication instead of wedging
     *  forever re-sending a dead token. */
    private tokenPresentedThisAttempt;
    /** Reason captured from the last upgrade error / close, surfaced in the
     *  status label so the UI can show *why* a connection dropped. */
    private lastErrorReason;
    /**
     * Supplier for the current auth token. Called on each WS open
     * to fetch a fresh JWT so the token can be rotated without the
     * client caching stale values. Returning `null` aborts the
     * connection attempt (review item B3 / D1).
     */
    private readonly getAuthToken;
    /** Called when a presented token is REJECTED by the server (stale/invalid).
     *  The integration clears the stored pair token and returns to login.
     *  Without this a bad token wedges the app in "Connecting…". */
    private readonly onAuthReject;
    private readonly fetchImplementation;
    private readonly createWebSocket;
    private readonly pending;
    private readonly messageHandlers;
    private readonly connectHandlers;
    private readonly disconnectHandlers;
    private readonly statusListeners;
    private currentStatus;
    constructor(baseUrl: string, getAuthToken: (() => string | null | Promise<string | null>) | undefined, onAuthReject: (() => void) | undefined, options: WebSocketClientOptions);
    connect(): void;
    disconnect(): void;
    http<Contract extends HttpContractLike>(contract: Contract, input: HttpInputFor<Contract>): Promise<HttpOutputFor<Contract>>;
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    onSchemaEvent(schemaIds: readonly string[], handler: (e: StreamEvent) => void): () => void;
    onEventType(types: readonly string[], handler: (e: StreamEvent) => void): () => void;
    getStatus(): ConnectionStatus;
    subscribeStatus(listener: StatusListener): () => void;
    onConnect(h: VoidHandler): () => void;
    onDisconnect(h: VoidHandler): () => void;
    private onMessage;
    private setStatus;
    private rejectAllPending;
    private handleMessage;
    /** Remove and return the pending call an rpc.result or rpc.error answers. */
    private takePending;
    private cleanup;
    private createConnection;
    private performAuthHandshake;
    private waitForConnection;
    private parseEvent;
}
export {};
