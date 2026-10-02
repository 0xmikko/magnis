import { z } from "zod";
export declare const sourceContracts: {
    readonly "source.accounts.disconnect": import("../contract.js").RpcContract<"source.accounts.disconnect", z.ZodObject<{
        sourceId: z.ZodString;
        accountId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "source.accounts.provision": import("../contract.js").RpcContract<"source.accounts.provision", z.ZodObject<{
        sourceId: z.ZodString;
        intent: z.ZodDefault<z.ZodEnum<{
            repair: "repair";
            add: "add";
        }>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
        accountId: z.ZodString;
        subject: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "source.auth.exec": import("../contract.js").RpcContract<"source.auth.exec", z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
        op: z.ZodString;
        args: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
        identity: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
        connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, "required">;
    readonly "source.auth.oauth.complete": import("../contract.js").RpcContract<"source.auth.oauth.complete", z.ZodObject<{
        sourceId: z.ZodString;
        code: z.ZodString;
        state: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
        identity: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
        connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, "required">;
    readonly "source.auth.session.cancel": import("../contract.js").RpcContract<"source.auth.session.cancel", z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        cancelled: z.ZodBoolean;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "source.auth.session.open": import("../contract.js").RpcContract<"source.auth.session.open", z.ZodObject<{
        sourceId: z.ZodString;
        intent: z.ZodEnum<{
            repair: "repair";
            add: "add";
        }>;
        presentation: z.ZodEnum<{
            web: "web";
            cli: "cli";
        }>;
        connectionId: z.ZodOptional<z.ZodString>;
        repairAction: z.ZodOptional<z.ZodString>;
        redirectUri: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        sessionId: z.ZodString;
        authType: z.ZodString;
        redirectUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "source.auth.submit": import("../contract.js").RpcContract<"source.auth.submit", z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
        step: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "source.keys.list": import("../contract.js").RpcContract<"source.keys.list", z.ZodObject<{
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        vaultAvailable: z.ZodBoolean;
        sources: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            displayName: z.ZodString;
            keys: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                label: z.ZodString;
                helpUrl: z.ZodNullable<z.ZodString>;
                description: z.ZodNullable<z.ZodString>;
                vaultConfigured: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "source.keys.set": import("../contract.js").RpcContract<"source.keys.set", z.ZodObject<{
        sourceId: z.ZodString;
        key: z.ZodString;
        value: z.ZodString;
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "source.list": import("../contract.js").RpcContract<"source.list", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            displayName: z.ZodString;
            surfaces: z.ZodArray<z.ZodString>;
            authType: z.ZodEnum<{
                none: "none";
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
            }>;
            packageHash: z.ZodString;
            connectable: z.ZodBoolean;
            unavailableReason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "source.status.list": import("../contract.js").RpcContract<"source.status.list", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
                surfaces: z.ZodArray<z.ZodObject<{
                    surface: z.ZodString;
                    sync: z.ZodNullable<z.ZodObject<{
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
    }, z.core.$strict>, "required">;
    readonly "source.sync.bootstrap": import("../contract.js").RpcContract<"source.sync.bootstrap", z.ZodObject<{
        sourceId: z.ZodString;
        surface: z.ZodString;
        params: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
        seeded: z.ZodNumber;
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=source.d.ts.map