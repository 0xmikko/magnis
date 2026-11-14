import { z } from "zod";
export declare const EpisodeUsageSchema: z.ZodObject<{
    usageCoverage: z.ZodObject<{
        completeCalls: z.ZodNumber;
        partialCalls: z.ZodNumber;
        unreportedCalls: z.ZodNumber;
        legacyCalls: z.ZodNumber;
    }, z.core.$strict>;
    costCoverage: z.ZodObject<{
        completeCalls: z.ZodNumber;
        partialCalls: z.ZodNumber;
        unreportedCalls: z.ZodNumber;
        legacyCalls: z.ZodNumber;
    }, z.core.$strict>;
    episodeId: z.ZodString;
    inputTokens: z.ZodNullable<z.ZodNumber>;
    outputTokens: z.ZodNullable<z.ZodNumber>;
    cacheReadTokens: z.ZodNullable<z.ZodNumber>;
    cacheWriteTokens: z.ZodNullable<z.ZodNumber>;
    cacheWriteOneHourTokens: z.ZodNullable<z.ZodNumber>;
    reasoningTokens: z.ZodNullable<z.ZodNumber>;
    costMicros: z.ZodNullable<z.ZodNumber>;
    callCount: z.ZodNumber;
    firstCallAt: z.ZodNullable<z.ZodString>;
    lastCallAt: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type EpisodeUsage = z.output<typeof EpisodeUsageSchema>;
export declare const EpisodeUsageQuerySchema: z.ZodObject<{
    from: z.ZodISODateTime;
    to: z.ZodISODateTime;
}, z.core.$strict>;
export declare const EpisodeUsageSummarySchema: z.ZodObject<{
    usageCoverage: z.ZodObject<{
        completeCalls: z.ZodNumber;
        partialCalls: z.ZodNumber;
        unreportedCalls: z.ZodNumber;
        legacyCalls: z.ZodNumber;
    }, z.core.$strict>;
    costCoverage: z.ZodObject<{
        completeCalls: z.ZodNumber;
        partialCalls: z.ZodNumber;
        unreportedCalls: z.ZodNumber;
        legacyCalls: z.ZodNumber;
    }, z.core.$strict>;
    episodeId: z.ZodString;
    episodeTitle: z.ZodNullable<z.ZodString>;
    totalTokens: z.ZodNullable<z.ZodNumber>;
    costMicros: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const EpisodeUsageQueryResultSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    episodes: z.ZodArray<z.ZodObject<{
        usageCoverage: z.ZodObject<{
            completeCalls: z.ZodNumber;
            partialCalls: z.ZodNumber;
            unreportedCalls: z.ZodNumber;
            legacyCalls: z.ZodNumber;
        }, z.core.$strict>;
        costCoverage: z.ZodObject<{
            completeCalls: z.ZodNumber;
            partialCalls: z.ZodNumber;
            unreportedCalls: z.ZodNumber;
            legacyCalls: z.ZodNumber;
        }, z.core.$strict>;
        episodeId: z.ZodString;
        episodeTitle: z.ZodNullable<z.ZodString>;
        totalTokens: z.ZodNullable<z.ZodNumber>;
        costMicros: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EpisodeUsageQuery = z.output<typeof EpisodeUsageQuerySchema>;
export type EpisodeUsageSummary = z.output<typeof EpisodeUsageSummarySchema>;
export type EpisodeUsageQueryResult = z.output<typeof EpisodeUsageQueryResultSchema>;
//# sourceMappingURL=episode-usage.d.ts.map