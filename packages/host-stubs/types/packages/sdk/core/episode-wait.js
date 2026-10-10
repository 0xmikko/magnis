import { z } from "zod";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
export const episodeWaitKinds = ["tool_approval", "ask_user", "native_approval", "subagent"];
export const EpisodeWaitKindSchema = z.enum(episodeWaitKinds);
export const EpisodeWaitSchema = z.object({
    id: IdSchema,
    executionId: IdSchema,
    kind: EpisodeWaitKindSchema,
    request: JsonValueSchema,
    createdAt: z.string(),
}).strict();
export const EpisodeWaitListSchema = z.strictObject({
    waits: z.array(EpisodeWaitSchema),
});
