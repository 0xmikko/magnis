import { z } from "zod";
/** Pause sync and indexer pacing for every user. Admin only. */
export declare const pauseDebugSyncContract: import("./contract.js").HttpContract<"POST", "/api/debug/sync/pause", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"paused">;
}, z.core.$strict>>;
/** Resume sync and indexer pacing for every user. Admin only. */
export declare const resumeDebugSyncContract: import("./contract.js").HttpContract<"POST", "/api/debug/sync/resume", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"resumed">;
}, z.core.$strict>>;
export declare const debugSyncStatusContract: import("./contract.js").HttpContract<"GET", "/api/debug/sync/status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    paused: z.ZodBoolean;
}, z.core.$strict>>;
//# sourceMappingURL=debug-sync.d.ts.map