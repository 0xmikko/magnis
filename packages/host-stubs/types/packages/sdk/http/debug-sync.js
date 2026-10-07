import { z } from "zod";
import { defineHttpContract } from "./contract.js";
/** Pause sync and indexer pacing for every user. Admin only. */
export const pauseDebugSyncContract = defineHttpContract({
    method: "POST",
    path: "/api/debug/sync/pause",
    input: z.object({}),
    output: z.strictObject({ status: z.literal("paused") }),
});
/** Resume sync and indexer pacing for every user. Admin only. */
export const resumeDebugSyncContract = defineHttpContract({
    method: "POST",
    path: "/api/debug/sync/resume",
    input: z.object({}),
    output: z.strictObject({ status: z.literal("resumed") }),
});
export const debugSyncStatusContract = defineHttpContract({
    method: "GET",
    path: "/api/debug/sync/status",
    input: z.object({}),
    output: z.strictObject({ paused: z.boolean() }),
});
