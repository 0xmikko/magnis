import { z } from "zod";
export { TokenBreakdownSchema } from "./token-breakdown.js";
export type { TokenBreakdown } from "./token-breakdown.js";
export declare const LiveEntitlementSchema: z.ZodObject<{
    limitMicros: z.ZodNumber;
    spentMicros: z.ZodNumber;
    reservedMicros: z.ZodNumber;
    availableMicros: z.ZodNumber;
    entitled: z.ZodBoolean;
}, z.core.$strict>;
export type LiveEntitlement = z.output<typeof LiveEntitlementSchema>;
export declare const BillingCoverageSchema: z.ZodObject<{
    completeCalls: z.ZodNumber;
    partialCalls: z.ZodNumber;
    unreportedCalls: z.ZodNumber;
    legacyCalls: z.ZodNumber;
}, z.core.$strict>;
export type BillingCoverage = z.output<typeof BillingCoverageSchema>;
export declare const EpisodeCostSchema: z.ZodObject<{
    episodeId: z.ZodString;
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
    tokens: z.ZodNullable<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheWriteOneHour: z.ZodNumber;
        reasoning: z.ZodNumber;
    }, z.core.$strict>>;
    costMicros: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type EpisodeCost = z.output<typeof EpisodeCostSchema>;
export declare const BillingDailyRowSchema: z.ZodObject<{
    day: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
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
    tokens: z.ZodNullable<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheWriteOneHour: z.ZodNumber;
        reasoning: z.ZodNumber;
    }, z.core.$strict>>;
    costMicros: z.ZodNullable<z.ZodNumber>;
    callCount: z.ZodNumber;
}, z.core.$strict>;
export type BillingDailyRow = z.output<typeof BillingDailyRowSchema>;
export declare const BillingEpisodeRowSchema: z.ZodObject<{
    episodeId: z.ZodString;
    startedAt: z.ZodString;
    endedAt: z.ZodString;
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
    totalTokens: z.ZodNullable<z.ZodNumber>;
    costMicros: z.ZodNullable<z.ZodNumber>;
    callCount: z.ZodNumber;
}, z.core.$strict>;
export type BillingEpisodeRow = z.output<typeof BillingEpisodeRowSchema>;
//# sourceMappingURL=billing.d.ts.map