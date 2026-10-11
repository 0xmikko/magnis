import { z } from "zod";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
export const ToolCallEventSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    args: JsonValueSchema,
});
export const ToolResultEventSchema = z.strictObject({
    id: IdSchema,
    name: z.string().optional(),
    result: JsonValueSchema,
});
export const ContentBlockSchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("thinking"), text: z.string() }),
    z.strictObject({ type: z.literal("toolCall"), toolCallId: IdSchema }),
    z.strictObject({ type: z.literal("text"), text: z.string() }),
    z.strictObject({ type: z.literal("userMessage"), text: z.string() }),
]);
