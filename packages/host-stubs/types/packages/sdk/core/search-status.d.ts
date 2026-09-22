import { z } from "zod";
/** Search worker states exposed to clients. */
export declare const searchIndexingStates: readonly ["idle", "indexing"];
export declare const searchIndexLifecycleStates: readonly ["unconfigured", "ready", "catching_up", "reconfiguring", "failed"];
export declare const SearchIndexingStateSchema: z.ZodEnum<{
    idle: "idle";
    indexing: "indexing";
}>;
export type SearchIndexingState = z.output<typeof SearchIndexingStateSchema>;
export declare const SearchIndexLifecycleStateSchema: z.ZodEnum<{
    ready: "ready";
    failed: "failed";
    unconfigured: "unconfigured";
    catching_up: "catching_up";
    reconfiguring: "reconfiguring";
}>;
export type SearchIndexLifecycleState = z.output<typeof SearchIndexLifecycleStateSchema>;
/** Progress snapshot shared by the search status HTTP and RPC boundaries. */
export declare const SearchStatusSchema: z.ZodObject<{
    indexed: z.ZodInt;
    total: z.ZodInt;
    pending: z.ZodInt;
    percent: z.ZodInt;
    model: z.ZodString;
    status: z.ZodEnum<{
        idle: "idle";
        indexing: "indexing";
    }>;
    activeModelId: z.ZodNullable<z.ZodString>;
    lifecycleState: z.ZodEnum<{
        ready: "ready";
        failed: "failed";
        unconfigured: "unconfigured";
        catching_up: "catching_up";
        reconfiguring: "reconfiguring";
    }>;
    generation: z.ZodInt;
    lastFailure: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type SearchStatus = z.output<typeof SearchStatusSchema>;
//# sourceMappingURL=search-status.d.ts.map