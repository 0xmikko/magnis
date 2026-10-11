import { z } from "zod";
import { IdSchema } from "./id.js";
export const episodeTodoStatuses = [
    "pending",
    "in_progress",
    "completed",
    "cancelled",
];
export const EpisodeTodoStatusSchema = z.enum(episodeTodoStatuses);
export const EpisodeTodoItemSchema = z.strictObject({
    content: z.string(),
    status: EpisodeTodoStatusSchema,
    externalId: IdSchema.nullable().default(null),
});
export const EpisodeTodoListResultSchema = z.strictObject({
    items: z.array(EpisodeTodoItemSchema),
});
export const EpisodeWorkspaceTodoListRequestSchema = z.strictObject({});
export const EpisodeWorkspaceTodoAddRequestSchema = z.strictObject({ content: z.string().trim().min(1) });
export const EpisodeWorkspaceTodoRemoveRequestSchema = z.strictObject({ id: z.uuid() });
export const EpisodeWorkspaceTodoUpdateRequestSchema = z.strictObject({
    id: z.uuid(), content: z.string().trim().min(1).optional(), status: EpisodeTodoStatusSchema.optional(),
}).refine(args => args.content !== undefined || args.status !== undefined, "content or status is required");
export const EpisodeWorkspaceTodoListResultSchema = z.strictObject({
    items: z.array(EpisodeTodoItemSchema.extend({ id: z.uuid() })),
});
