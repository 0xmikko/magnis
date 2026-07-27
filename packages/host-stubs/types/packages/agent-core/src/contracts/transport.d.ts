export interface RuntimeEvent {
    readonly type: string;
    readonly payload?: unknown;
    readonly timestamp: string;
}
export interface AppTransport {
    readonly baseUrl: string;
    rpc<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    rpcStream(method: string, params: Record<string, unknown>, onChunk: (chunk: unknown) => void): Promise<unknown>;
    onSchemaEvent(schemaIds: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
    onEventType(eventTypes: readonly string[], handler: (event: RuntimeEvent) => void): () => void;
}
