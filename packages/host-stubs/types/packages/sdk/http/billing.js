import { z } from "zod";
import { BillingDailyRowSchema, BillingEpisodeRowSchema, } from "../core/billing.js";
import { EpisodeUsageSchema } from "../core/episode-usage.js";
import { defineHttpContract } from "./contract.js";
/** The server answers its default window when both bounds are absent. */
export const billingDailyContract = defineHttpContract({
    method: "GET",
    path: "/api/billing/daily",
    input: z.object({ from: z.string().optional(), to: z.string().optional() }),
    output: z.strictObject({ rows: z.array(BillingDailyRowSchema) }),
});
export const billingEpisodesContract = defineHttpContract({
    method: "GET",
    path: "/api/billing/episodes",
    input: z.object({ limit: z.number().int().nonnegative(), offset: z.number().int().nonnegative() }),
    output: z.strictObject({ rows: z.array(BillingEpisodeRowSchema) }),
});
export const billingEpisodeUsageContract = defineHttpContract({
    method: "GET",
    path: "/api/billing/episodes/:id/usage",
    input: z.object({ id: z.string() }),
    output: EpisodeUsageSchema,
});
