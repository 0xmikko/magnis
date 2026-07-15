/**
 * Query invalidation helpers — connect WebSocket events to TanStack Query cache.
 *
 * Modules call setupQueryInvalidation() in their setup() to automatically
 * invalidate queries when the backend pushes schema events.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { AppTransport } from "../contracts/transport";
export interface InvalidationRule {
    readonly schemaIds: readonly string[];
    readonly queryKeys: readonly (readonly unknown[])[];
}
export declare function setupQueryInvalidation(transport: AppTransport, queryClient: QueryClient, rules: readonly InvalidationRule[]): () => void;
export declare function setupEventInvalidation(transport: AppTransport, queryClient: QueryClient, eventTypes: readonly string[], queryKeys: readonly (readonly unknown[])[]): () => void;
