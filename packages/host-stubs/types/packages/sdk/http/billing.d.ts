import { z } from "zod";
export declare const billingDailyContract: import("./contract.js").HttpContract<"GET", "/api/billing/daily", z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    rows: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>>;
export declare const billingEpisodesContract: import("./contract.js").HttpContract<"GET", "/api/billing/episodes", z.ZodObject<{
    limit: z.ZodNumber;
    offset: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    rows: z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        startedAt: z.ZodString;
        endedAt: z.ZodString;
        totalTokens: z.ZodNumber;
        costMicros: z.ZodNumber;
        callCount: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export declare const billingEpisodeUsageContract: import("./contract.js").HttpContract<"GET", "/api/billing/episodes/:id/usage", z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>;
//# sourceMappingURL=billing.d.ts.map