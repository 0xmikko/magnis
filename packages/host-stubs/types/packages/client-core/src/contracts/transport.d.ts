import type { HttpContractLike, HttpInputFor, HttpOutputFor } from "@magnis/sdk";
export interface RuntimeEvent {
    readonly type: string;
    readonly payload?: unknown;
    readonly timestamp: string;
}
/** Safe, user-displayable failure details returned by selected RPCs. */
export interface RpcErrorData {
    readonly kind: string;
    readonly retryable: boolean;
    readonly displayMessage: string;
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
    http<Contract extends HttpContractLike>(contract: Contract, input: HttpInputFor<Contract>): Promise<HttpOutputFor<Contract>>;
    rpc<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    onSchemaEvent(schemaIds: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
    onEventType(eventTypes: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
}
