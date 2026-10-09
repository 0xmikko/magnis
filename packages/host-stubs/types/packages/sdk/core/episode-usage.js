import { z } from "zod";
import { IdSchema } from "./id.js";
export const EpisodeUsageSchema = z.strictObject({
    episodeId: z.string(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    cacheWriteOneHourTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    costMicros: z.number().int().nonnegative(),
    callCount: z.number().int().nonnegative(),
    firstCallAt: z.string().nullable(),
    lastCallAt: z.string().nullable(),
});
export const EpisodeUsageQuerySchema = z
    .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
})
    .strict();
export const EpisodeUsageSummarySchema = z.strictObject({
    episodeId: IdSchema,
    episodeTitle: z.string().nullable(),
    totalTokens: z.number().int().nonnegative(),
    costMicros: z.number().int().nonnegative(),
});
export const EpisodeUsageQueryResultSchema = z.strictObject({
    from: z.string(),
    to: z.string(),
    episodes: z.array(EpisodeUsageSummarySchema),
});
