import { z } from "zod";
export declare const billingContracts: {
    readonly "billing.ledger.query": import("../contract.js").RpcContract<"billing.ledger.query", z.ZodObject<{
        from: z.ZodOptional<z.ZodString>;
        to: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        rows: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            turnId: z.ZodNullable<z.ZodString>;
            origin: z.ZodString;
            provider: z.ZodString;
            model: z.ZodString;
            startedAt: z.ZodString;
            finishedAt: z.ZodNullable<z.ZodString>;
            usageStatus: z.ZodEnum<{
                complete: "complete";
                partial: "partial";
                unreported: "unreported";
                legacy: "legacy";
            }>;
            costStatus: z.ZodEnum<{
                complete: "complete";
                partial: "partial";
                unreported: "unreported";
                legacy: "legacy";
            }>;
            billingMode: z.ZodEnum<{
                legacy: "legacy";
                metered: "metered";
                subscription: "subscription";
                local: "local";
            }>;
            cacheWriteOneHourTokens: z.ZodNullable<z.ZodNumber>;
            inputTokens: z.ZodNullable<z.ZodNumber>;
            outputTokens: z.ZodNullable<z.ZodNumber>;
            cacheReadTokens: z.ZodNullable<z.ZodNumber>;
            cacheWriteTokens: z.ZodNullable<z.ZodNumber>;
            reasoningTokens: z.ZodNullable<z.ZodNumber>;
            costMicros: z.ZodNullable<z.ZodNumber>;
            status: z.ZodString;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        from: z.ZodString;
        to: z.ZodString;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
    }, z.core.$strict>, "required">;
    readonly "billing.limits.get": import("../contract.js").RpcContract<"billing.limits.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        userId: z.ZodString;
        creditLimitMicros: z.ZodNullable<z.ZodNumber>;
        spentMicros: z.ZodNumber;
        reservedMicros: z.ZodNumber;
        availableMicros: z.ZodNullable<z.ZodNumber>;
        entitled: z.ZodBoolean;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=billing.d.ts.map