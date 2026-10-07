import { z } from "zod";
import { IdSchema } from "./id.js";
import { EntityOperationBindingSchema } from "./approval.js";
export const EpisodeMessageSchema = z.strictObject({
    id: IdSchema,
    episodeId: IdSchema,
    ordinal: z.int().nonnegative(),
    role: z.string(),
    content: z.string().nullable().optional(),
    toolName: z.string().nullable().optional(),
    // @tested-by: tst_bts_tools_wire_004
    toolBinding: EntityOperationBindingSchema.nullable().optional(),
    toolCallId: IdSchema.nullable().optional(),
    toolArgs: z.string().nullable().optional(),
    toolResult: z.string().nullable().optional(),
    status: z.string(),
    createdAt: z.string(),
    attachments: z.array(IdSchema).default([]),
});
export const NewEpisodeMessageSchema = EpisodeMessageSchema.pick({
    role: true,
    content: true,
    toolName: true,
    toolBinding: true,
    toolCallId: true,
    toolArgs: true,
    toolResult: true,
    status: true,
});
