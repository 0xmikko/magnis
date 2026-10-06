import { z } from "zod";
/** The kinds a memory is saved and filtered as. */
export declare const MemoryTypeSchema: z.ZodEnum<{
    user: "user";
    feedback: "feedback";
    project: "project";
    reference: "reference";
}>;
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
}, z.core.$strict>;
export type MemoryRecord = z.output<typeof MemoryRecordSchema>;
export declare const MemorySearchParamsSchema: z.ZodObject<{
    query: z.ZodString;
    memoryType: z.ZodOptional<z.ZodEnum<{
        user: "user";
        feedback: "feedback";
        project: "project";
        reference: "reference";
    }>>;
    limit: z.ZodDefault<z.ZodInt>;
}, z.core.$strip>;
export type MemorySearchParams = z.input<typeof MemorySearchParamsSchema>;
//# sourceMappingURL=memory.d.ts.map