import { z } from "zod";
/** Durable working-memory summary returned by episodes.summary.*. */
export declare const EpisodeSummarySchema: z.ZodObject<{
    id: z.ZodString;
    episodeId: z.ZodString;
    objective: z.ZodNullable<z.ZodString>;
    currentState: z.ZodNullable<z.ZodString>;
    recentDecisions: z.ZodArray<z.ZodString>;
    entityRefs: z.ZodArray<z.ZodString>;
    tokenEstimate: z.ZodNumber;
    lastRefreshedAt: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type EpisodeSummary = z.output<typeof EpisodeSummarySchema>;
//# sourceMappingURL=chat.d.ts.map