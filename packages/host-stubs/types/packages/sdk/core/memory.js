import { z } from "zod";
import { IdSchema } from "./id.js";
import { PageLimitSchema } from "./pagination.js";
/** The kinds a memory is saved and filtered as. */
export const MemoryTypeSchema = z.enum(["user", "feedback", "project", "reference"]);
export const MemoryRecordSchema = z.strictObject({
    id: IdSchema,
    memoryType: z.string(),
    title: z.string(),
    body: z.string(),
    confidence: z.number(),
    status: z.string(),
    origin: z.string(),
    sourceKind: z.string(),
    sourceEpisodeId: IdSchema.nullable(),
    sourceMessageIds: z.array(IdSchema),
    subjectEntityId: IdSchema.nullable(),
    projectEntityId: IdSchema.nullable(),
    validFrom: z.string(),
    lastVerifiedAt: z.string(),
    supersededBy: IdSchema.nullable(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
});
export const MemorySearchParamsSchema = z.object({
    query: z.string().min(1),
    memoryType: MemoryTypeSchema.optional(),
    limit: PageLimitSchema,
});
