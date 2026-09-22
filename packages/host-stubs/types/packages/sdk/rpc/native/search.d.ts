import { z } from "zod";
export declare const searchIndexingStatusContract: import("../contract.js").RpcContract<"search.indexing_status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>, "required">;
export declare const searchModelStatusContract: import("../contract.js").RpcContract<"search.model_status", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    key: z.ZodString;
    downloaded: z.ZodBoolean;
    downloadSize: z.ZodNullable<z.ZodString>;
    diskUsage: z.ZodNullable<z.ZodString>;
}, z.core.$strip>>, "required">;
//# sourceMappingURL=search.d.ts.map