import { z } from "zod";
export declare const MemoryRecordSchema: z.ZodObject<{
    id: z.ZodString;
    memoryType: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    confidence: z.ZodNumber;
    status: z.ZodString;
    origin: z.ZodString;
    sourceKind: z.ZodString;
    sourceEpisodeId: z.ZodNullable<z.ZodString>;
    sourceMessageIds: z.ZodArray<z.ZodString>;
    subjectEntityId: z.ZodNullable<z.ZodString>;
    projectEntityId: z.ZodNullable<z.ZodString>;
    validFrom: z.ZodString;
    lastVerifiedAt: z.ZodString;
    supersededBy: z.ZodNullable<z.ZodString>;
    archivedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type MemoryRecord = z.output<typeof MemoryRecordSchema>;
export declare const MemorySearchParamsSchema: z.ZodObject<{
    query: z.ZodString;
    memoryType: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type MemorySearchParams = z.input<typeof MemorySearchParamsSchema>;
//# sourceMappingURL=memory.d.ts.map