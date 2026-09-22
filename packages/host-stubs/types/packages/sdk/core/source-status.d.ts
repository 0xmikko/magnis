import { z } from "zod";
export declare const SourceAvailabilitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"installedDisabled">;
    packageHash: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"active">;
    packageHash: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"unavailable">;
    packageHash: z.ZodString;
    reason: z.ZodString;
}, z.core.$strict>], "state">;
export type SourceAvailability = z.output<typeof SourceAvailabilitySchema>;
export declare const SourceCredentialStatusSchema: z.ZodUnion<readonly [z.ZodObject<{
    state: z.ZodLiteral<"unconfigured">;
}, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    kind: z.ZodLiteral<"minted">;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    kind: z.ZodLiteral<"userKey">;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    kind: z.ZodLiteral<"deploymentKey">;
    revision: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    kind: z.ZodLiteral<"fixture">;
    revision: z.ZodNull;
}, z.core.$strict>], "kind">, z.ZodObject<{
    state: z.ZodLiteral<"unavailable">;
    kind: z.ZodEnum<{
        minted: "minted";
        userKey: "userKey";
        deploymentKey: "deploymentKey";
        fixture: "fixture";
    }>;
    reason: z.ZodString;
}, z.core.$strict>]>;
export type SourceCredentialStatus = z.output<typeof SourceCredentialStatusSchema>;
export declare const SourceRuntimeStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"absent">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"starting">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"stopping">;
    reason: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"failed">;
    reason: z.ZodString;
}, z.core.$strict>], "state">;
export type SourceRuntimeStatus = z.output<typeof SourceRuntimeStatusSchema>;
export declare const SyncStatusSchema: z.ZodEnum<{
    error: "error";
    idle: "idle";
    authRequired: "authRequired";
    syncing: "syncing";
    rateLimited: "rateLimited";
}>;
export type SyncStatus = z.output<typeof SyncStatusSchema>;
export declare const SyncPhaseSchema: z.ZodEnum<{
    stopping: "stopping";
    protectLive: "protectLive";
    bootstrap: "bootstrap";
    reconcile: "reconcile";
    catchUp: "catchUp";
    live: "live";
    pollWait: "pollWait";
    backfill: "backfill";
    recoveryWait: "recoveryWait";
}>;
export type SyncPhase = z.output<typeof SyncPhaseSchema>;
export declare const SurfaceSyncSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"notStarted">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"current">;
    status: z.ZodEnum<{
        error: "error";
        idle: "idle";
        authRequired: "authRequired";
        syncing: "syncing";
        rateLimited: "rateLimited";
    }>;
    phase: z.ZodEnum<{
        stopping: "stopping";
        protectLive: "protectLive";
        bootstrap: "bootstrap";
        reconcile: "reconcile";
        catchUp: "catchUp";
        live: "live";
        pollWait: "pollWait";
        backfill: "backfill";
        recoveryWait: "recoveryWait";
    }>;
    mode: z.ZodEnum<{
        push: "push";
        poll: "poll";
    }>;
    progress: z.ZodObject<{
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
    lastAttemptAt: z.ZodNullable<z.ZodString>;
    lastSuccessAt: z.ZodNullable<z.ZodString>;
    nextRetryAt: z.ZodNullable<z.ZodString>;
    error: z.ZodNullable<z.ZodObject<{
        kind: z.ZodString;
        message: z.ZodString;
        attempts: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>], "state">;
export type SurfaceSync = z.output<typeof SurfaceSyncSchema>;
export declare const SourceSurfaceEnrollmentSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"notEnrolled">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"enabled">;
    generation: z.ZodNumber;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"paused">;
    generation: z.ZodNumber;
}, z.core.$strict>], "state">;
export declare const SourceAccountStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    authKind: z.ZodEnum<{
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
    }>;
    lifecycle: z.ZodLiteral<"authRequired">;
    repair: z.ZodEnum<{
        reconnectOauth: "reconnectOauth";
        reloginPhone: "reloginPhone";
        enterKey: "enterKey";
        replaceKey: "replaceKey";
    }>;
    accountId: z.ZodString;
    displayName: z.ZodString;
    providerAccountId: z.ZodNullable<z.ZodString>;
    generation: z.ZodNumber;
    invalidReason: z.ZodNullable<z.ZodString>;
    credential: z.ZodUnion<readonly [z.ZodObject<{
        state: z.ZodLiteral<"unconfigured">;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"minted">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"userKey">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"deploymentKey">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"fixture">;
        revision: z.ZodNull;
    }, z.core.$strict>], "kind">, z.ZodObject<{
        state: z.ZodLiteral<"unavailable">;
        kind: z.ZodEnum<{
            minted: "minted";
            userKey: "userKey";
            deploymentKey: "deploymentKey";
            fixture: "fixture";
        }>;
        reason: z.ZodString;
    }, z.core.$strict>]>;
    runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"absent">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"starting">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"stopping">;
        reason: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"failed">;
        reason: z.ZodString;
    }, z.core.$strict>], "state">;
    messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        saved: z.ZodNumber;
        plan: z.ZodNullable<z.ZodObject<{
            unit: z.ZodString;
            planned: z.ZodNumber;
            excludedScopes: z.ZodNumber;
            excludedItems: z.ZodNumber;
            uncountedScopes: z.ZodNumber;
            measuredAt: z.ZodISODateTime;
        }, z.core.$strict>>;
        measuredAt: z.ZodISODateTime;
    }, z.core.$strict>>>;
    surfaces: z.ZodArray<z.ZodObject<{
        surface: z.ZodString;
        enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"notEnrolled">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"enabled">;
            generation: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"paused">;
            generation: z.ZodNumber;
        }, z.core.$strict>], "state">;
        sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"notStarted">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"current">;
            status: z.ZodEnum<{
                error: "error";
                idle: "idle";
                authRequired: "authRequired";
                syncing: "syncing";
                rateLimited: "rateLimited";
            }>;
            phase: z.ZodEnum<{
                stopping: "stopping";
                protectLive: "protectLive";
                bootstrap: "bootstrap";
                reconcile: "reconcile";
                catchUp: "catchUp";
                live: "live";
                pollWait: "pollWait";
                backfill: "backfill";
                recoveryWait: "recoveryWait";
            }>;
            mode: z.ZodEnum<{
                push: "push";
                poll: "poll";
            }>;
            progress: z.ZodObject<{
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
            lastAttemptAt: z.ZodNullable<z.ZodString>;
            lastSuccessAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            error: z.ZodNullable<z.ZodObject<{
                kind: z.ZodString;
                message: z.ZodString;
                attempts: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>], "state">;
    }, z.core.$strict>>;
}, z.core.$strict>, ...z.ZodObject<{
    lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
    repair: z.ZodNull;
    accountId: z.ZodString;
    displayName: z.ZodString;
    providerAccountId: z.ZodNullable<z.ZodString>;
    authKind: z.ZodEnum<{
        none: "none";
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
    }>;
    generation: z.ZodNumber;
    invalidReason: z.ZodNullable<z.ZodString>;
    credential: z.ZodUnion<readonly [z.ZodObject<{
        state: z.ZodLiteral<"unconfigured">;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"minted">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"userKey">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"deploymentKey">;
        revision: z.ZodNumber;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        kind: z.ZodLiteral<"fixture">;
        revision: z.ZodNull;
    }, z.core.$strict>], "kind">, z.ZodObject<{
        state: z.ZodLiteral<"unavailable">;
        kind: z.ZodEnum<{
            minted: "minted";
            userKey: "userKey";
            deploymentKey: "deploymentKey";
            fixture: "fixture";
        }>;
        reason: z.ZodString;
    }, z.core.$strict>]>;
    runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"absent">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"starting">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"stopping">;
        reason: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"failed">;
        reason: z.ZodString;
    }, z.core.$strict>], "state">;
    messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        saved: z.ZodNumber;
        plan: z.ZodNullable<z.ZodObject<{
            unit: z.ZodString;
            planned: z.ZodNumber;
            excludedScopes: z.ZodNumber;
            excludedItems: z.ZodNumber;
            uncountedScopes: z.ZodNumber;
            measuredAt: z.ZodISODateTime;
        }, z.core.$strict>>;
        measuredAt: z.ZodISODateTime;
    }, z.core.$strict>>>;
    surfaces: z.ZodArray<z.ZodObject<{
        surface: z.ZodString;
        enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"notEnrolled">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"enabled">;
            generation: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"paused">;
            generation: z.ZodNumber;
        }, z.core.$strict>], "state">;
        sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"notStarted">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"current">;
            status: z.ZodEnum<{
                error: "error";
                idle: "idle";
                authRequired: "authRequired";
                syncing: "syncing";
                rateLimited: "rateLimited";
            }>;
            phase: z.ZodEnum<{
                stopping: "stopping";
                protectLive: "protectLive";
                bootstrap: "bootstrap";
                reconcile: "reconcile";
                catchUp: "catchUp";
                live: "live";
                pollWait: "pollWait";
                backfill: "backfill";
                recoveryWait: "recoveryWait";
            }>;
            mode: z.ZodEnum<{
                push: "push";
                poll: "poll";
            }>;
            progress: z.ZodObject<{
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
            lastAttemptAt: z.ZodNullable<z.ZodString>;
            lastSuccessAt: z.ZodNullable<z.ZodString>;
            nextRetryAt: z.ZodNullable<z.ZodString>;
            error: z.ZodNullable<z.ZodObject<{
                kind: z.ZodString;
                message: z.ZodString;
                attempts: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>], "state">;
    }, z.core.$strict>>;
}, z.core.$strict>[]], "lifecycle">;
export type SourceAccountStatus = z.output<typeof SourceAccountStatusSchema>;
export declare const SourceStatusSchema: z.ZodObject<{
    sourceId: z.ZodString;
    displayName: z.ZodString;
    availability: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"installedDisabled">;
        packageHash: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"active">;
        packageHash: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"unavailable">;
        packageHash: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>], "state">;
    accounts: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        authKind: z.ZodEnum<{
            oauth2: "oauth2";
            phoneCode: "phoneCode";
            apiKey: "apiKey";
            sharedProvider: "sharedProvider";
        }>;
        lifecycle: z.ZodLiteral<"authRequired">;
        repair: z.ZodEnum<{
            reconnectOauth: "reconnectOauth";
            reloginPhone: "reloginPhone";
            enterKey: "enterKey";
            replaceKey: "replaceKey";
        }>;
        accountId: z.ZodString;
        displayName: z.ZodString;
        providerAccountId: z.ZodNullable<z.ZodString>;
        generation: z.ZodNumber;
        invalidReason: z.ZodNullable<z.ZodString>;
        credential: z.ZodUnion<readonly [z.ZodObject<{
            state: z.ZodLiteral<"unconfigured">;
        }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"minted">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"userKey">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"deploymentKey">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"fixture">;
            revision: z.ZodNull;
        }, z.core.$strict>], "kind">, z.ZodObject<{
            state: z.ZodLiteral<"unavailable">;
            kind: z.ZodEnum<{
                minted: "minted";
                userKey: "userKey";
                deploymentKey: "deploymentKey";
                fixture: "fixture";
            }>;
            reason: z.ZodString;
        }, z.core.$strict>]>;
        runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"absent">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"starting">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"stopping">;
            reason: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"failed">;
            reason: z.ZodString;
        }, z.core.$strict>], "state">;
        messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            saved: z.ZodNumber;
            plan: z.ZodNullable<z.ZodObject<{
                unit: z.ZodString;
                planned: z.ZodNumber;
                excludedScopes: z.ZodNumber;
                excludedItems: z.ZodNumber;
                uncountedScopes: z.ZodNumber;
                measuredAt: z.ZodISODateTime;
            }, z.core.$strict>>;
            measuredAt: z.ZodISODateTime;
        }, z.core.$strict>>>;
        surfaces: z.ZodArray<z.ZodObject<{
            surface: z.ZodString;
            enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"notEnrolled">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"enabled">;
                generation: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"paused">;
                generation: z.ZodNumber;
            }, z.core.$strict>], "state">;
            sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"notStarted">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"current">;
                status: z.ZodEnum<{
                    error: "error";
                    idle: "idle";
                    authRequired: "authRequired";
                    syncing: "syncing";
                    rateLimited: "rateLimited";
                }>;
                phase: z.ZodEnum<{
                    stopping: "stopping";
                    protectLive: "protectLive";
                    bootstrap: "bootstrap";
                    reconcile: "reconcile";
                    catchUp: "catchUp";
                    live: "live";
                    pollWait: "pollWait";
                    backfill: "backfill";
                    recoveryWait: "recoveryWait";
                }>;
                mode: z.ZodEnum<{
                    push: "push";
                    poll: "poll";
                }>;
                progress: z.ZodObject<{
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
                lastAttemptAt: z.ZodNullable<z.ZodString>;
                lastSuccessAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                error: z.ZodNullable<z.ZodObject<{
                    kind: z.ZodString;
                    message: z.ZodString;
                    attempts: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>], "state">;
        }, z.core.$strict>>;
    }, z.core.$strict>, ...z.ZodObject<{
        lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
        repair: z.ZodNull;
        accountId: z.ZodString;
        displayName: z.ZodString;
        providerAccountId: z.ZodNullable<z.ZodString>;
        authKind: z.ZodEnum<{
            none: "none";
            oauth2: "oauth2";
            phoneCode: "phoneCode";
            apiKey: "apiKey";
            sharedProvider: "sharedProvider";
        }>;
        generation: z.ZodNumber;
        invalidReason: z.ZodNullable<z.ZodString>;
        credential: z.ZodUnion<readonly [z.ZodObject<{
            state: z.ZodLiteral<"unconfigured">;
        }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"minted">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"userKey">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"deploymentKey">;
            revision: z.ZodNumber;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            kind: z.ZodLiteral<"fixture">;
            revision: z.ZodNull;
        }, z.core.$strict>], "kind">, z.ZodObject<{
            state: z.ZodLiteral<"unavailable">;
            kind: z.ZodEnum<{
                minted: "minted";
                userKey: "userKey";
                deploymentKey: "deploymentKey";
                fixture: "fixture";
            }>;
            reason: z.ZodString;
        }, z.core.$strict>]>;
        runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"absent">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"starting">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"stopping">;
            reason: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"failed">;
            reason: z.ZodString;
        }, z.core.$strict>], "state">;
        messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            saved: z.ZodNumber;
            plan: z.ZodNullable<z.ZodObject<{
                unit: z.ZodString;
                planned: z.ZodNumber;
                excludedScopes: z.ZodNumber;
                excludedItems: z.ZodNumber;
                uncountedScopes: z.ZodNumber;
                measuredAt: z.ZodISODateTime;
            }, z.core.$strict>>;
            measuredAt: z.ZodISODateTime;
        }, z.core.$strict>>>;
        surfaces: z.ZodArray<z.ZodObject<{
            surface: z.ZodString;
            enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"notEnrolled">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"enabled">;
                generation: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"paused">;
                generation: z.ZodNumber;
            }, z.core.$strict>], "state">;
            sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"notStarted">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"current">;
                status: z.ZodEnum<{
                    error: "error";
                    idle: "idle";
                    authRequired: "authRequired";
                    syncing: "syncing";
                    rateLimited: "rateLimited";
                }>;
                phase: z.ZodEnum<{
                    stopping: "stopping";
                    protectLive: "protectLive";
                    bootstrap: "bootstrap";
                    reconcile: "reconcile";
                    catchUp: "catchUp";
                    live: "live";
                    pollWait: "pollWait";
                    backfill: "backfill";
                    recoveryWait: "recoveryWait";
                }>;
                mode: z.ZodEnum<{
                    push: "push";
                    poll: "poll";
                }>;
                progress: z.ZodObject<{
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
                lastAttemptAt: z.ZodNullable<z.ZodString>;
                lastSuccessAt: z.ZodNullable<z.ZodString>;
                nextRetryAt: z.ZodNullable<z.ZodString>;
                error: z.ZodNullable<z.ZodObject<{
                    kind: z.ZodString;
                    message: z.ZodString;
                    attempts: z.ZodNumber;
                }, z.core.$strict>>;
            }, z.core.$strict>], "state">;
        }, z.core.$strict>>;
    }, z.core.$strict>[]], "lifecycle">>;
}, z.core.$strict>;
export type SourceStatus = z.output<typeof SourceStatusSchema>;
export declare const SourceStatusListResponseSchema: z.ZodObject<{
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        availability: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"installedDisabled">;
            packageHash: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"active">;
            packageHash: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"unavailable">;
            packageHash: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strict>], "state">;
        accounts: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            authKind: z.ZodEnum<{
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
            }>;
            lifecycle: z.ZodLiteral<"authRequired">;
            repair: z.ZodEnum<{
                reconnectOauth: "reconnectOauth";
                reloginPhone: "reloginPhone";
                enterKey: "enterKey";
                replaceKey: "replaceKey";
            }>;
            accountId: z.ZodString;
            displayName: z.ZodString;
            providerAccountId: z.ZodNullable<z.ZodString>;
            generation: z.ZodNumber;
            invalidReason: z.ZodNullable<z.ZodString>;
            credential: z.ZodUnion<readonly [z.ZodObject<{
                state: z.ZodLiteral<"unconfigured">;
            }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"minted">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"userKey">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"deploymentKey">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"fixture">;
                revision: z.ZodNull;
            }, z.core.$strict>], "kind">, z.ZodObject<{
                state: z.ZodLiteral<"unavailable">;
                kind: z.ZodEnum<{
                    minted: "minted";
                    userKey: "userKey";
                    deploymentKey: "deploymentKey";
                    fixture: "fixture";
                }>;
                reason: z.ZodString;
            }, z.core.$strict>]>;
            runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"absent">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"starting">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"stopping">;
                reason: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"failed">;
                reason: z.ZodString;
            }, z.core.$strict>], "state">;
            messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                saved: z.ZodNumber;
                plan: z.ZodNullable<z.ZodObject<{
                    unit: z.ZodString;
                    planned: z.ZodNumber;
                    excludedScopes: z.ZodNumber;
                    excludedItems: z.ZodNumber;
                    uncountedScopes: z.ZodNumber;
                    measuredAt: z.ZodISODateTime;
                }, z.core.$strict>>;
                measuredAt: z.ZodISODateTime;
            }, z.core.$strict>>>;
            surfaces: z.ZodArray<z.ZodObject<{
                surface: z.ZodString;
                enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"notEnrolled">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"enabled">;
                    generation: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"paused">;
                    generation: z.ZodNumber;
                }, z.core.$strict>], "state">;
                sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"notStarted">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"current">;
                    status: z.ZodEnum<{
                        error: "error";
                        idle: "idle";
                        authRequired: "authRequired";
                        syncing: "syncing";
                        rateLimited: "rateLimited";
                    }>;
                    phase: z.ZodEnum<{
                        stopping: "stopping";
                        protectLive: "protectLive";
                        bootstrap: "bootstrap";
                        reconcile: "reconcile";
                        catchUp: "catchUp";
                        live: "live";
                        pollWait: "pollWait";
                        backfill: "backfill";
                        recoveryWait: "recoveryWait";
                    }>;
                    mode: z.ZodEnum<{
                        push: "push";
                        poll: "poll";
                    }>;
                    progress: z.ZodObject<{
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
                    lastAttemptAt: z.ZodNullable<z.ZodString>;
                    lastSuccessAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    error: z.ZodNullable<z.ZodObject<{
                        kind: z.ZodString;
                        message: z.ZodString;
                        attempts: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>], "state">;
            }, z.core.$strict>>;
        }, z.core.$strict>, ...z.ZodObject<{
            lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
            repair: z.ZodNull;
            accountId: z.ZodString;
            displayName: z.ZodString;
            providerAccountId: z.ZodNullable<z.ZodString>;
            authKind: z.ZodEnum<{
                none: "none";
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
            }>;
            generation: z.ZodNumber;
            invalidReason: z.ZodNullable<z.ZodString>;
            credential: z.ZodUnion<readonly [z.ZodObject<{
                state: z.ZodLiteral<"unconfigured">;
            }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"minted">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"userKey">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"deploymentKey">;
                revision: z.ZodNumber;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
                kind: z.ZodLiteral<"fixture">;
                revision: z.ZodNull;
            }, z.core.$strict>], "kind">, z.ZodObject<{
                state: z.ZodLiteral<"unavailable">;
                kind: z.ZodEnum<{
                    minted: "minted";
                    userKey: "userKey";
                    deploymentKey: "deploymentKey";
                    fixture: "fixture";
                }>;
                reason: z.ZodString;
            }, z.core.$strict>]>;
            runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"absent">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"starting">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"ready">;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"stopping">;
                reason: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"failed">;
                reason: z.ZodString;
            }, z.core.$strict>], "state">;
            messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                saved: z.ZodNumber;
                plan: z.ZodNullable<z.ZodObject<{
                    unit: z.ZodString;
                    planned: z.ZodNumber;
                    excludedScopes: z.ZodNumber;
                    excludedItems: z.ZodNumber;
                    uncountedScopes: z.ZodNumber;
                    measuredAt: z.ZodISODateTime;
                }, z.core.$strict>>;
                measuredAt: z.ZodISODateTime;
            }, z.core.$strict>>>;
            surfaces: z.ZodArray<z.ZodObject<{
                surface: z.ZodString;
                enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"notEnrolled">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"enabled">;
                    generation: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"paused">;
                    generation: z.ZodNumber;
                }, z.core.$strict>], "state">;
                sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"notStarted">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"current">;
                    status: z.ZodEnum<{
                        error: "error";
                        idle: "idle";
                        authRequired: "authRequired";
                        syncing: "syncing";
                        rateLimited: "rateLimited";
                    }>;
                    phase: z.ZodEnum<{
                        stopping: "stopping";
                        protectLive: "protectLive";
                        bootstrap: "bootstrap";
                        reconcile: "reconcile";
                        catchUp: "catchUp";
                        live: "live";
                        pollWait: "pollWait";
                        backfill: "backfill";
                        recoveryWait: "recoveryWait";
                    }>;
                    mode: z.ZodEnum<{
                        push: "push";
                        poll: "poll";
                    }>;
                    progress: z.ZodObject<{
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
                    lastAttemptAt: z.ZodNullable<z.ZodString>;
                    lastSuccessAt: z.ZodNullable<z.ZodString>;
                    nextRetryAt: z.ZodNullable<z.ZodString>;
                    error: z.ZodNullable<z.ZodObject<{
                        kind: z.ZodString;
                        message: z.ZodString;
                        attempts: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>], "state">;
            }, z.core.$strict>>;
        }, z.core.$strict>[]], "lifecycle">>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SourceStatusListResponse = z.output<typeof SourceStatusListResponseSchema>;
//# sourceMappingURL=source-status.d.ts.map