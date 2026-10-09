import { z } from "zod";
import { defineHttpContract } from "./contract.js";
export const AnalyticsModeSchema = z.enum(["off", "internal", "posthog"]);
export const AnalyticsVersionsSchema = z.strictObject({
    app: z.string(),
    backend: z.string(),
    buildSha: z.string().optional(),
});
/** The hosted demo's entitlement, present only while a status is set. */
export const HostedDemoEntitlementSchema = z.strictObject({
    status: z.enum(["credit_zero_no_invite", "invite_credits_available"]),
    campaignId: z.string().optional(),
    inviteId: z.string().optional(),
    creditLimitMicros: z.number().int().optional(),
});
/** The public-safe analytics configuration a browser reads before it has a
 * token. The PostHog fields appear only in `posthog` mode, and the internal
 * event schema version whenever analytics is on. */
export const RuntimeAnalyticsConfigSchema = z.strictObject({
    mode: AnalyticsModeSchema,
    deploymentId: z.string(),
    versions: AnalyticsVersionsSchema,
    internalEventSchemaVersion: z.number().int().optional(),
    posthogHost: z.string().optional(),
    posthogProjectApiKey: z.string().optional(),
    hostedDemoEntitlement: HostedDemoEntitlementSchema.optional(),
});
export const clientConfigContract = defineHttpContract({
    method: "GET",
    path: "/api/client-config",
    input: z.object({}),
    output: z.strictObject({ analytics: RuntimeAnalyticsConfigSchema }),
});
