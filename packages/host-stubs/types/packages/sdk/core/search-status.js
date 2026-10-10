import { z } from "zod";
/** Search worker states exposed to clients. */
export const searchIndexingStates = ["idle", "indexing"];
export const searchIndexLifecycleStates = [
    "unconfigured",
    "ready",
    "catching_up",
    "reconfiguring",
    "failed",
];
export const SearchIndexingStateSchema = z.enum(searchIndexingStates);
export const SearchIndexLifecycleStateSchema = z.enum(searchIndexLifecycleStates);
/** Progress snapshot shared by the search status HTTP and RPC boundaries. */
export const SearchStatusSchema = z.strictObject({
    indexed: z.int().min(0),
    total: z.int().min(0),
    pending: z.int().min(0),
    percent: z.int().min(0).max(100),
    model: z.string(),
    status: SearchIndexingStateSchema,
    activeModelId: z.string().nullable(),
    lifecycleState: SearchIndexLifecycleStateSchema,
    generation: z.int().min(0),
    lastFailure: z.string().nullable(),
});
