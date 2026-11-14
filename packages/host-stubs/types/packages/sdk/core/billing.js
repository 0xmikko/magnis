import { z } from "zod";
import { TokenBreakdownSchema } from "./token-breakdown.js";
export { TokenBreakdownSchema } from "./token-breakdown.js";
export const LiveEntitlementSchema = z.strictObject({
    limitMicros: z.number().int().nonnegative(),
    spentMicros: z.number().int().nonnegative(),
    reservedMicros: z.number().int().nonnegative(),
    availableMicros: z.number().int().nonnegative(),
    entitled: z.boolean(),
});
export const BillingCoverageSchema = z.strictObject({
    completeCalls: z.number().int().nonnegative(),
    partialCalls: z.number().int().nonnegative(),
    unreportedCalls: z.number().int().nonnegative(),
    legacyCalls: z.number().int().nonnegative(),
});
export const EpisodeCostSchema = z.strictObject({
    episodeId: z.string(),
    usageCoverage: BillingCoverageSchema,
    costCoverage: BillingCoverageSchema,
    tokens: TokenBreakdownSchema.nullable(),
    costMicros: z.number().int().nonnegative().nullable(),
});
export const BillingDailyRowSchema = z.strictObject({
    day: z.string(),
    provider: z.string(),
    model: z.string(),
    usageCoverage: BillingCoverageSchema,
    costCoverage: BillingCoverageSchema,
    tokens: TokenBreakdownSchema.nullable(),
    costMicros: z.number().int().nonnegative().nullable(),
    callCount: z.number().int().nonnegative(),
});
export const BillingEpisodeRowSchema = z.strictObject({
    episodeId: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    usageCoverage: BillingCoverageSchema,
    costCoverage: BillingCoverageSchema,
    totalTokens: z.number().int().nonnegative().nullable(),
    costMicros: z.number().int().nonnegative().nullable(),
    callCount: z.number().int().nonnegative(),
});
//# sourceMappingURL=billing.js.map