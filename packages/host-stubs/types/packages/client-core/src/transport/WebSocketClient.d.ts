/**
 * WebSocketClient — standalone WebSocket transport with JSON-RPC
 * and event subscription support.
 *
 * Pure TypeScript, no React dependency. Owns:
 *   - socket lifecycle (connect / reconnect / backoff / heartbeat)
 *   - JSON-RPC request/response tracking (rpc / rpcStream)
 *   - server-push event dispatch (onSchemaEvent / onEventType)
 *   - connection status with external listeners (subscribeStatus)
 */
export interface Rpc {
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    rpcStream(method: string, params: Record<string, unknown>, onChunk: (data: unknown) => void): Promise<unknown>;
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
type VoidHandler = () => void;
type StatusListener = (status: ConnectionStatus) => void;
export declare class WebSocketClient {
    readonly baseUrl: string;
    private ws;
    private reconnectTimer;
    private heartbeatTimer;
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
     *  so the next attempt goes token-less (Open-mode backends admit that as the
     *  default user, instead of wedging forever re-sending a dead token). */
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
     *  The integration clears the stored token so the retry reconnects
     *  token-less. Without this a bad token wedges the app in "Connecting…". */
    private readonly onAuthReject;
    private readonly pending;
    private readonly messageHandlers;
    private readonly connectHandlers;
    private readonly disconnectHandlers;
    private readonly statusListeners;
    private currentStatus;
    constructor(baseUrl: string, getAuthToken?: () => string | null | Promise<string | null>, onAuthReject?: () => void);
    connect(): void;
    disconnect(): void;
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    rpcStream(method: string, params: Record<string, unknown>, onChunk: (d: unknown) => void): Promise<unknown>;
    onSchemaEvent(schemaIds: readonly string[], handler: (e: StreamEvent) => void): () => void;
    onEventType(types: readonly string[], handler: (e: StreamEvent) => void): () => void;
    getStatus(): ConnectionStatus;
    subscribeStatus(listener: StatusListener): () => void;
    onConnect(h: VoidHandler): () => void;
    onDisconnect(h: VoidHandler): () => void;
    private onMessage;
    private setStatus;
    private send;
    private stopHeartbeat;
    private startHeartbeat;
    private rejectAllPending;
    private handleMessage;
    private cleanup;
    /**
     * Origin to present on the `/ws` upgrade in a non-browser runtime.
     * `MAGNIS_CLI_ORIGIN` overrides; otherwise the origin is derived from
     * `baseUrl`. Browsers never call this — they set Origin themselves.
     * `process` is read defensively so the shared browser bundle (no node
     * types) still type-checks.
     */
    private cliOrigin;
    private createConnection;
    private performAuthHandshake;
    private waitForConnection;
    private parseEvent;
}
export {};
