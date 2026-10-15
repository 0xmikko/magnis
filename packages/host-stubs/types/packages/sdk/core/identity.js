import { z } from "zod";
import { IdSchema } from "./id.js";
/** A profile's agent-facing identity. UI palette fields intentionally stay out. */
export const IdentityProfileSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    content: z.string(),
    isDefault: z.boolean(),
    groupIds: z.array(IdSchema),
    groupNames: z.array(z.string()),
    updatedAt: z.string(),
    createdAt: z.string(),
});
export const IdentityProfileSummarySchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    contentPreview: z.string(),
});
