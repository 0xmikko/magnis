import { z } from "zod";
export { TokenBreakdownSchema } from "./token-breakdown.js";
export type { TokenBreakdown } from "./token-breakdown.js";
export declare const LiveEntitlementSchema: z.ZodObject<{
    limitMicros: z.ZodNumber;
    spentMicros: z.ZodNumber;
    reservedMicros: z.ZodNumber;
    availableMicros: z.ZodNumber;
    entitled: z.ZodBoolean;
}, z.core.$strip>;
export type LiveEntitlement = z.output<typeof LiveEntitlementSchema>;
export declare const EpisodeCostSchema: z.ZodObject<{
    episodeId: z.ZodString;
    tokens: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheWriteOneHour: z.ZodNumber;
        reasoning: z.ZodNumber;
    }, z.core.$strip>;
    costMicros: z.ZodNumber;
}, z.core.$strip>;
export type EpisodeCost = z.output<typeof EpisodeCostSchema>;
export declare const BillingDailyRowSchema: z.ZodObject<{
    day: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
    tokens: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheWriteOneHour: z.ZodNumber;
        reasoning: z.ZodNumber;
    }, z.core.$strip>;
    costMicros: z.ZodNumber;
    callCount: z.ZodNumber;
}, z.core.$strip>;
export type BillingDailyRow = z.output<typeof BillingDailyRowSchema>;
export declare const BillingEpisodeRowSchema: z.ZodObject<{
    episodeId: z.ZodString;
    startedAt: z.ZodString;
    endedAt: z.ZodString;
    totalTokens: z.ZodNumber;
    costMicros: z.ZodNumber;
    callCount: z.ZodNumber;
}, z.core.$strip>;
export type BillingEpisodeRow = z.output<typeof BillingEpisodeRowSchema>;
//# sourceMappingURL=billing.d.ts.map