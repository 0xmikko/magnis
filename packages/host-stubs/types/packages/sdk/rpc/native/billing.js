import { z } from "zod";
import { BillingLimitInfoSchema } from "../../http/system-settings.js";
import { defineRpcContract } from "../contract.js";
export const billingContracts = {
    "billing.ledger.query": defineRpcContract({
        method: "billing.ledger.query",
        input: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            limit: z.number().int().positive().optional(),
            offset: z.number().int().nonnegative().optional(),
        }),
        output: z.strictObject({
            rows: z.array(z.strictObject({
                id: z.string(),
                turnId: z.string().nullable(),
                origin: z.string(),
                provider: z.string(),
                model: z.string(),
                startedAt: z.string(),
                finishedAt: z.string().nullable(),
                inputTokens: z.number().int(),
                outputTokens: z.number().int(),
                cacheReadTokens: z.number().int(),
                cacheWriteTokens: z.number().int(),
                reasoningTokens: z.number().int(),
                costMicros: z.number().int().nullable(),
                status: z.string(),
                error: z.string().nullable(),
            })),
            from: z.string(),
            to: z.string(),
            limit: z.number().int(),
            offset: z.number().int(),
        }),
    }),
    "billing.limits.get": defineRpcContract({
        method: "billing.limits.get",
        input: z.object({}),
        output: BillingLimitInfoSchema,
    }),
};
