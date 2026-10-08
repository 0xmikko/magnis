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
    surfaces: z.ZodArray<z.ZodObject<{
        surface: z.ZodString;
        sync: z.ZodNullable<z.ZodObject<{
            syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"pending">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"applied">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"failed">;
                message: z.ZodString;
            }, z.core.$strict>], "kind">>;
            appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
            status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"bootstrap">;
                estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"reconcile">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"backfill">;
                estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"catchingUp">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"live">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"polling">;
                nextAt: z.ZodISODateTime;
            }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"rateLimited">;
                retryAt: z.ZodISODateTime;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"interrupted">;
                retryAt: z.ZodISODateTime;
                message: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"signInRequired">;
            }, z.core.$strict>], "kind">]>;
            progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                name: z.ZodString;
                synced: z.ZodNumber;
                estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                    total: z.ZodNumber;
                    skipped: z.ZodNumber;
                }, z.core.$strict>]>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>, ...z.ZodObject<{
    lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
    repair: z.ZodNull;
    accountId: z.ZodString;
    displayName: z.ZodString;
    providerAccountId: z.ZodNullable<z.ZodString>;
    authKind: z.ZodEnum<{
        oauth2: "oauth2";
        phoneCode: "phoneCode";
        apiKey: "apiKey";
        sharedProvider: "sharedProvider";
        none: "none";
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
    surfaces: z.ZodArray<z.ZodObject<{
        surface: z.ZodString;
        sync: z.ZodNullable<z.ZodObject<{
            syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"pending">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"applied">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"failed">;
                message: z.ZodString;
            }, z.core.$strict>], "kind">>;
            appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
            status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"bootstrap">;
                estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"reconcile">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"backfill">;
                estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"catchingUp">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"live">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"polling">;
                nextAt: z.ZodISODateTime;
            }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"rateLimited">;
                retryAt: z.ZodISODateTime;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"interrupted">;
                retryAt: z.ZodISODateTime;
                message: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"signInRequired">;
            }, z.core.$strict>], "kind">]>;
            progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                name: z.ZodString;
                synced: z.ZodNumber;
                estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                    total: z.ZodNumber;
                    skipped: z.ZodNumber;
                }, z.core.$strict>]>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
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
        surfaces: z.ZodArray<z.ZodObject<{
            surface: z.ZodString;
            sync: z.ZodNullable<z.ZodObject<{
                syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"pending">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"applied">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"failed">;
                    message: z.ZodString;
                }, z.core.$strict>], "kind">>;
                appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
                status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"bootstrap">;
                    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"reconcile">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"backfill">;
                    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"catchingUp">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"live">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"polling">;
                    nextAt: z.ZodISODateTime;
                }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"rateLimited">;
                    retryAt: z.ZodISODateTime;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"interrupted">;
                    retryAt: z.ZodISODateTime;
                    message: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"signInRequired">;
                }, z.core.$strict>], "kind">]>;
                progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                    name: z.ZodString;
                    synced: z.ZodNumber;
                    estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                        total: z.ZodNumber;
                        skipped: z.ZodNumber;
                    }, z.core.$strict>]>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, ...z.ZodObject<{
        lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
        repair: z.ZodNull;
        accountId: z.ZodString;
        displayName: z.ZodString;
        providerAccountId: z.ZodNullable<z.ZodString>;
        authKind: z.ZodEnum<{
            oauth2: "oauth2";
            phoneCode: "phoneCode";
            apiKey: "apiKey";
            sharedProvider: "sharedProvider";
            none: "none";
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
        surfaces: z.ZodArray<z.ZodObject<{
            surface: z.ZodString;
            sync: z.ZodNullable<z.ZodObject<{
                syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"pending">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"applied">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"failed">;
                    message: z.ZodString;
                }, z.core.$strict>], "kind">>;
                appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
                status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"bootstrap">;
                    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"reconcile">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"backfill">;
                    estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"catchingUp">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"live">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"polling">;
                    nextAt: z.ZodISODateTime;
                }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"rateLimited">;
                    retryAt: z.ZodISODateTime;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"interrupted">;
                    retryAt: z.ZodISODateTime;
                    message: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"signInRequired">;
                }, z.core.$strict>], "kind">]>;
                progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                    name: z.ZodString;
                    synced: z.ZodNumber;
                    estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                        total: z.ZodNumber;
                        skipped: z.ZodNumber;
                    }, z.core.$strict>]>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
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
            surfaces: z.ZodArray<z.ZodObject<{
                surface: z.ZodString;
                sync: z.ZodNullable<z.ZodObject<{
                    syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"pending">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"applied">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"failed">;
                        message: z.ZodString;
                    }, z.core.$strict>], "kind">>;
                    appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
                    status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"bootstrap">;
                        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"reconcile">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"backfill">;
                        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"catchingUp">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"live">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"polling">;
                        nextAt: z.ZodISODateTime;
                    }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"rateLimited">;
                        retryAt: z.ZodISODateTime;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"interrupted">;
                        retryAt: z.ZodISODateTime;
                        message: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"signInRequired">;
                    }, z.core.$strict>], "kind">]>;
                    progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                        name: z.ZodString;
                        synced: z.ZodNumber;
                        estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                            total: z.ZodNumber;
                            skipped: z.ZodNumber;
                        }, z.core.$strict>]>;
                    }, z.core.$strict>>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>, ...z.ZodObject<{
            lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
            repair: z.ZodNull;
            accountId: z.ZodString;
            displayName: z.ZodString;
            providerAccountId: z.ZodNullable<z.ZodString>;
            authKind: z.ZodEnum<{
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
                none: "none";
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
            surfaces: z.ZodArray<z.ZodObject<{
                surface: z.ZodString;
                sync: z.ZodNullable<z.ZodObject<{
                    syncApplication: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"pending">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"applied">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"failed">;
                        message: z.ZodString;
                    }, z.core.$strict>], "kind">>;
                    appliedSyncRevisions: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
                    status: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"bootstrap">;
                        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"reconcile">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"backfill">;
                        estimatedAt: z.ZodUnion<readonly [z.ZodISODateTime, z.ZodLiteral<"unknown">]>;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"catchingUp">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"live">;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"polling">;
                        nextAt: z.ZodISODateTime;
                    }, z.core.$strict>], "kind">, z.ZodDiscriminatedUnion<[z.ZodObject<{
                        kind: z.ZodLiteral<"rateLimited">;
                        retryAt: z.ZodISODateTime;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"interrupted">;
                        retryAt: z.ZodISODateTime;
                        message: z.ZodString;
                    }, z.core.$strict>, z.ZodObject<{
                        kind: z.ZodLiteral<"signInRequired">;
                    }, z.core.$strict>], "kind">]>;
                    progress: z.ZodRecord<z.ZodString, z.ZodObject<{
                        name: z.ZodString;
                        synced: z.ZodNumber;
                        estimation: z.ZodUnion<readonly [z.ZodLiteral<"unplanned">, z.ZodObject<{
                            total: z.ZodNumber;
                            skipped: z.ZodNumber;
                        }, z.core.$strict>]>;
                    }, z.core.$strict>>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>[]], "lifecycle">>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SourceStatusListResponse = z.output<typeof SourceStatusListResponseSchema>;
//# sourceMappingURL=source-status.d.ts.map