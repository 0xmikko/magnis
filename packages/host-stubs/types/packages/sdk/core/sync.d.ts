import { z } from "zod";
export declare const SyncProgressScopeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"orderedRange">;
    scopeId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"snapshot">;
    scopeId: z.ZodString;
    snapshotGeneration: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"timeWindow">;
    scopeId: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"trackedIdentities">;
    scopeId: z.ZodString;
    identities: z.ZodArray<z.ZodString>;
}, z.core.$strict>], "kind">;
export type SyncProgressScope = z.output<typeof SyncProgressScopeSchema>;
export declare const SyncTargetSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"forward">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"gap">;
    start: z.ZodNumber;
    end: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"olderHistory">;
    before: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"seededInitialHistory">;
    params: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"snapshot">;
    generation: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"timeWindow">;
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"trackedIdentities">;
    identities: z.ZodArray<z.ZodString>;
}, z.core.$strict>], "kind">;
export type SyncTarget = z.output<typeof SyncTargetSchema>;
export declare const ActiveSyncWorkSchema: z.ZodObject<{
    target: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"forward">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"gap">;
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"olderHistory">;
        before: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"seededInitialHistory">;
        params: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"snapshot">;
        generation: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"timeWindow">;
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"trackedIdentities">;
        identities: z.ZodArray<z.ZodString>;
    }, z.core.$strict>], "kind">;
    continuationToken: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    targetGeneration: z.ZodNumber;
}, z.core.$strict>;
export type ActiveSyncWork = z.output<typeof ActiveSyncWorkSchema>;
export declare const SyncOwnershipFenceSchema: z.ZodObject<{
    syncRowId: z.ZodString;
    accountGeneration: z.ZodNumber;
    leaseGeneration: z.ZodNumber;
}, z.core.$strict>;
export type SyncOwnershipFence = z.output<typeof SyncOwnershipFenceSchema>;
export declare const SyncLiveFenceSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
    boundary: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    acknowledgedAt: z.ZodString;
}, z.core.$strict>;
export type SyncLiveFence = z.output<typeof SyncLiveFenceSchema>;
export declare const SyncProgressSchema: z.ZodObject<{
    scope: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"orderedRange">;
        scopeId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"snapshot">;
        scopeId: z.ZodString;
        snapshotGeneration: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"timeWindow">;
        scopeId: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"trackedIdentities">;
        scopeId: z.ZodString;
        identities: z.ZodArray<z.ZodString>;
    }, z.core.$strict>], "kind">>;
    forwardCheckpoint: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    activeWork: z.ZodNullable<z.ZodObject<{
        target: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"forward">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"gap">;
            start: z.ZodNumber;
            end: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"olderHistory">;
            before: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"seededInitialHistory">;
            params: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"snapshot">;
            generation: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"timeWindow">;
            from: z.ZodString;
            to: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"trackedIdentities">;
            identities: z.ZodArray<z.ZodString>;
        }, z.core.$strict>], "kind">;
        continuationToken: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        targetGeneration: z.ZodNumber;
    }, z.core.$strict>>;
    liveFence: z.ZodNullable<z.ZodObject<{
        subscriptionId: z.ZodString;
        boundary: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        acknowledgedAt: z.ZodString;
    }, z.core.$strict>>;
    historyComplete: z.ZodBoolean;
}, z.core.$strict>;
export type SyncProgress = z.output<typeof SyncProgressSchema>;
export declare const ForwardCheckpointEffectSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"retain">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"replace">;
    value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"clear">;
}, z.core.$strict>], "kind">;
export type ForwardCheckpointEffect = z.output<typeof ForwardCheckpointEffectSchema>;
export declare const SyncProgressReceiptSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"continueTarget">;
    continuationToken: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"completeTarget">;
    forwardCheckpoint: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"retain">;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"replace">;
        value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"clear">;
    }, z.core.$strict>], "kind">;
}, z.core.$strict>], "kind">;
export type SyncProgressReceipt = z.output<typeof SyncProgressReceiptSchema>;
//# sourceMappingURL=sync.d.ts.map