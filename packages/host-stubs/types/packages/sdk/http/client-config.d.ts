import { z } from "zod";
export declare const AnalyticsModeSchema: z.ZodEnum<{
    off: "off";
    internal: "internal";
    posthog: "posthog";
}>;
export type AnalyticsMode = z.output<typeof AnalyticsModeSchema>;
export declare const AnalyticsVersionsSchema: z.ZodObject<{
    app: z.ZodString;
    backend: z.ZodString;
    buildSha: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type AnalyticsVersions = z.output<typeof AnalyticsVersionsSchema>;
/** The hosted demo's entitlement, present only while a status is set. */
export declare const HostedDemoEntitlementSchema: z.ZodObject<{
    status: z.ZodEnum<{
        credit_zero_no_invite: "credit_zero_no_invite";
        invite_credits_available: "invite_credits_available";
    }>;
    campaignId: z.ZodOptional<z.ZodString>;
    inviteId: z.ZodOptional<z.ZodString>;
    creditLimitMicros: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type HostedDemoEntitlement = z.output<typeof HostedDemoEntitlementSchema>;
/** The public-safe analytics configuration a browser reads before it has a
 * token. The PostHog fields appear only in `posthog` mode, and the internal
 * event schema version whenever analytics is on. */
export declare const RuntimeAnalyticsConfigSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        off: "off";
        internal: "internal";
        posthog: "posthog";
    }>;
    deploymentId: z.ZodString;
    versions: z.ZodObject<{
        app: z.ZodString;
        backend: z.ZodString;
        buildSha: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    internalEventSchemaVersion: z.ZodOptional<z.ZodNumber>;
    posthogHost: z.ZodOptional<z.ZodString>;
    posthogProjectApiKey: z.ZodOptional<z.ZodString>;
    hostedDemoEntitlement: z.ZodOptional<z.ZodObject<{
        status: z.ZodEnum<{
            credit_zero_no_invite: "credit_zero_no_invite";
            invite_credits_available: "invite_credits_available";
        }>;
        campaignId: z.ZodOptional<z.ZodString>;
        inviteId: z.ZodOptional<z.ZodString>;
        creditLimitMicros: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RuntimeAnalyticsConfig = z.output<typeof RuntimeAnalyticsConfigSchema>;
export declare const clientConfigContract: import("./contract.js").HttpContract<"GET", "/api/client-config", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    analytics: z.ZodObject<{
        mode: z.ZodEnum<{
            off: "off";
            internal: "internal";
            posthog: "posthog";
        }>;
        deploymentId: z.ZodString;
        versions: z.ZodObject<{
            app: z.ZodString;
            backend: z.ZodString;
            buildSha: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        internalEventSchemaVersion: z.ZodOptional<z.ZodNumber>;
        posthogHost: z.ZodOptional<z.ZodString>;
        posthogProjectApiKey: z.ZodOptional<z.ZodString>;
        hostedDemoEntitlement: z.ZodOptional<z.ZodObject<{
            status: z.ZodEnum<{
                credit_zero_no_invite: "credit_zero_no_invite";
                invite_credits_available: "invite_credits_available";
            }>;
            campaignId: z.ZodOptional<z.ZodString>;
            inviteId: z.ZodOptional<z.ZodString>;
            creditLimitMicros: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>>;
//# sourceMappingURL=client-config.d.ts.map