export interface RuntimeEvent {
    readonly type: string;
    readonly payload?: unknown;
    readonly timestamp: string;
}
/** Safe, user-displayable failure details returned by selected RPCs. */
export interface RpcErrorData {
    readonly kind: string;
    readonly retryable: boolean;
    readonly display_message: string;
}
/** JSON-RPC failure that preserves the backend status and validated safe data. */
export declare class RpcError extends Error {
    readonly code: number;
    readonly rpcMessage: string;
    readonly data: RpcErrorData | null;
    constructor(code: number, rpcMessage: string, data: RpcErrorData | null);
}
export interface AppTransport {
    readonly baseUrl: string;
    rpc<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    rpcStream(method: string, params: Record<string, unknown>, onChunk: (chunk: unknown) => void): Promise<unknown>;
    onSchemaEvent(schemaIds: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
    onEventType(eventTypes: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
}
