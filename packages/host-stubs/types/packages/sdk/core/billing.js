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
export const EpisodeCostSchema = z.strictObject({
    episodeId: z.string(),
    tokens: TokenBreakdownSchema,
    costMicros: z.number().int().nonnegative(),
});
export const BillingDailyRowSchema = z.strictObject({
    day: z.string(),
    provider: z.string(),
    model: z.string(),
    tokens: TokenBreakdownSchema,
    costMicros: z.number().int().nonnegative(),
    callCount: z.number().int().nonnegative(),
});
export const BillingEpisodeRowSchema = z.strictObject({
    episodeId: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    totalTokens: z.number().int().nonnegative(),
    costMicros: z.number().int().nonnegative(),
    callCount: z.number().int().nonnegative(),
});
