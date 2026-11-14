import { z } from "zod";
import { BillingCoverageSchema } from "./billing.js";
import { IdSchema } from "./id.js";
export const EpisodeUsageSchema = z.strictObject({
    usageCoverage: BillingCoverageSchema,
    costCoverage: BillingCoverageSchema,
    episodeId: z.string(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cacheReadTokens: z.number().int().nonnegative().nullable(),
    cacheWriteTokens: z.number().int().nonnegative().nullable(),
    cacheWriteOneHourTokens: z.number().int().nonnegative().nullable(),
    reasoningTokens: z.number().int().nonnegative().nullable(),
    costMicros: z.number().int().nonnegative().nullable(),
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
    usageCoverage: BillingCoverageSchema,
    costCoverage: BillingCoverageSchema,
    episodeId: IdSchema,
    episodeTitle: z.string().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    costMicros: z.number().int().nonnegative().nullable(),
});
export const EpisodeUsageQueryResultSchema = z.strictObject({
    from: z.string(),
    to: z.string(),
    episodes: z.array(EpisodeUsageSummarySchema),
});
//# sourceMappingURL=episode-usage.js.map