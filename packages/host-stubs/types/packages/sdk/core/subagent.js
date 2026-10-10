import { z } from "zod";
import { IdSchema } from "./id.js";
/** A stored subagent as the host answers it: a missing description or system
 * prompt is omitted, and the stored avatar colour is a presentation preference
 * the answer does not carry. */
export const SubagentSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    description: z.string().optional(),
    systemPrompt: z.string().optional(),
    status: z.string(),
    createdAt: z.string(),
});
export const NewSubagentSchema = z.object({
    name: z.string(),
    description: z.string().nullable().optional(),
    systemPrompt: z.string().nullable().optional(),
});
export const UpdateSubagentSchema = NewSubagentSchema.extend({
    status: z.string().optional(),
}).partial();
