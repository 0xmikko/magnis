import { z } from "zod";
export declare const EpisodeUsageSchema: z.ZodObject<{
    episodeId: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    cacheWriteOneHourTokens: z.ZodNumber;
    reasoningTokens: z.ZodNumber;
    costMicros: z.ZodNumber;
    callCount: z.ZodNumber;
    firstCallAt: z.ZodNullable<z.ZodString>;
    lastCallAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type EpisodeUsage = z.output<typeof EpisodeUsageSchema>;
export declare const EpisodeUsageQuerySchema: z.ZodObject<{
    from: z.ZodISODateTime;
    to: z.ZodISODateTime;
}, z.core.$strict>;
export declare const EpisodeUsageSummarySchema: z.ZodObject<{
    episodeId: z.ZodString;
    episodeTitle: z.ZodNullable<z.ZodString>;
    totalTokens: z.ZodNumber;
    costMicros: z.ZodNumber;
}, z.core.$strip>;
export declare const EpisodeUsageQueryResultSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    episodes: z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        episodeTitle: z.ZodNullable<z.ZodString>;
        totalTokens: z.ZodNumber;
        costMicros: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EpisodeUsageQuery = z.output<typeof EpisodeUsageQuerySchema>;
export type EpisodeUsageSummary = z.output<typeof EpisodeUsageSummarySchema>;
export type EpisodeUsageQueryResult = z.output<typeof EpisodeUsageQueryResultSchema>;
//# sourceMappingURL=episode-usage.d.ts.map