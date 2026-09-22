export interface ClientError {
    readonly kind: string;
    readonly message: string;
    readonly retryable: boolean;
}
export declare function toClientError(error: unknown): ClientError;
export type ResourceStatus = "idle" | "loading" | "ready" | "error";
