/**
 * TanStack Query hook for native RPC calls.
 *
 * useRpcQuery reads a native method through `rpcWithContract`, so the answer
 * is parsed once and strictly against its SDK contract.
 */
import type { MagnisRpcMethod, RpcArgsFor, rpcContracts } from "@magnis/sdk";
import type { RpcOutputFor } from "@magnis/sdk/rpc/contract";
import { type UseQueryOptions } from "@tanstack/react-query";
export declare function useRpcQuery<Method extends MagnisRpcMethod>(queryKey: readonly unknown[], method: Method, args: RpcArgsFor<(typeof rpcContracts)[Method]>, options?: Omit<UseQueryOptions<RpcOutputFor<(typeof rpcContracts)[Method]>>, "queryKey" | "queryFn">): import("@tanstack/react-query").UseQueryResult<import("@tanstack/query-core").NoInfer<RpcOutputFor<{
    readonly "web.capabilities": import("@magnis/sdk").RpcContract<"web.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "web.link.get": import("@magnis/sdk").RpcContract<"web.link.get", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        url: import("zod").ZodString;
        domain: import("zod").ZodString;
        title: import("zod").ZodNullable<import("zod").ZodString>;
        description: import("zod").ZodNullable<import("zod").ZodString>;
        faviconUrl: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        ogImageUrl: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        createdAt: import("zod").ZodString;
        hasContent: import("zod").ZodBoolean;
        contentExtractedAt: import("zod").ZodNullable<import("zod").ZodString>;
        linkedEntities: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            linkKind: import("zod").ZodString;
            direction: import("zod").ZodEnum<{
                in: "in";
                out: "out";
            }>;
            createdAt: import("zod").ZodString;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "web.link.open": import("@magnis/sdk").RpcContract<"web.link.open", import("zod").ZodObject<{
        id: import("zod").ZodOptional<import("zod").ZodGUID>;
        url: import("zod").ZodOptional<import("zod").ZodString>;
        forceRefresh: import("zod").ZodDefault<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        url: import("zod").ZodString;
        title: import("zod").ZodNullable<import("zod").ZodString>;
        contentMarkdown: import("zod").ZodString;
        contentLength: import("zod").ZodNumber;
        extractedAt: import("zod").ZodString;
        fromCache: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "web.search": import("@magnis/sdk").RpcContract<"web.search", import("zod").ZodObject<{
        query: import("zod").ZodString;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        query: import("zod").ZodString;
        results: import("zod").ZodArray<import("zod").ZodObject<{
            title: import("zod").ZodString;
            url: import("zod").ZodString;
            snippet: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "web.page.search": {
        readonly method: "web.page.search";
        readonly input: import("zod").ZodObject<{
            query: import("zod").ZodString;
            limit: import("zod").ZodDefault<import("zod").ZodInt>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            query: import("zod").ZodString;
            results: import("zod").ZodArray<import("zod").ZodObject<{
                title: import("zod").ZodString;
                url: import("zod").ZodString;
                snippet: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "user_events.track": import("@magnis/sdk").RpcContract<"user_events.track", import("zod").ZodObject<{
        eventName: import("zod").ZodString;
        source: import("zod").ZodString;
        properties: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.capabilities": import("@magnis/sdk").RpcContract<"triggers.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.fire_history": import("@magnis/sdk").RpcContract<"triggers.fire_history", import("zod").ZodObject<{
        triggerId: import("zod").ZodGUID;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        firedAt: import("zod").ZodString;
        eventEntityId: import("zod").ZodString;
        gateResult: import("zod").ZodExactOptional<import("zod").ZodString>;
        episodeId: import("zod").ZodExactOptional<import("zod").ZodString>;
        outcome: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "triggers.fire_now": import("@magnis/sdk").RpcContract<"triggers.fire_now", import("zod").ZodObject<{
        triggerId: import("zod").ZodGUID;
        eventEntityId: import("zod").ZodDefault<import("zod").ZodGUID>;
        context: import("zod").ZodDefault<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        fired: import("zod").ZodLiteral<true>;
        episodeId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.invalidate_cache": import("@magnis/sdk").RpcContract<"triggers.invalidate_cache", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        invalidated: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.resolve_watchable": import("@magnis/sdk").RpcContract<"triggers.resolve_watchable", import("zod").ZodObject<{
        entityId: import("zod").ZodGUID;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        watchable: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            linkKind: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.validate_schedule": import("@magnis/sdk").RpcContract<"triggers.validate_schedule", import("zod").ZodObject<{
        cron: import("zod").ZodString;
        timezone: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        cron: import("zod").ZodString;
        timezone: import("zod").ZodString;
        activatedAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "triggers.validate_watch": import("@magnis/sdk").RpcContract<"triggers.validate_watch", import("zod").ZodObject<{
        watchEntityIds: import("zod").ZodArray<import("zod").ZodGUID>;
    }, import("zod/v4/core").$strip>, import("zod").ZodNullable<import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"clarification_needed">;
        message: import("zod").ZodString;
        nonTriggerableEntities: import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodNullable<import("zod").ZodString>;
                schemaId: import("zod").ZodString;
            }, import("zod/v4/core").$strict>;
            linkedWatchableEntities: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodNullable<import("zod").ZodString>;
                schemaId: import("zod").ZodString;
                linkKind: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "subagents.create": import("@magnis/sdk").RpcContract<"subagents.create", import("zod").ZodObject<{
        name: import("zod").ZodString;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        systemPrompt: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        systemPrompt: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "subagents.delete": import("@magnis/sdk").RpcContract<"subagents.delete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "subagents.list": import("@magnis/sdk").RpcContract<"subagents.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        systemPrompt: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "subagents.update": import("@magnis/sdk").RpcContract<"subagents.update", import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        systemPrompt: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        systemPrompt: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "subagents.roster": import("@magnis/sdk").RpcContract<"subagents.roster", import("zod").ZodObject<{}, import("zod/v4/core").$strict>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "subagents.profile.list": {
        readonly method: "subagents.profile.list";
        readonly input: import("zod").ZodObject<{}, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            description: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "source.accounts.disconnect": import("@magnis/sdk").RpcContract<"source.accounts.disconnect", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        accountId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.accounts.provision": import("@magnis/sdk").RpcContract<"source.accounts.provision", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        intent: import("zod").ZodDefault<import("zod").ZodEnum<{
            repair: "repair";
            add: "add";
        }>>;
        connectionId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
        accountId: import("zod").ZodString;
        subject: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.auth.exec": import("@magnis/sdk").RpcContract<"source.auth.exec", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        sessionId: import("zod").ZodString;
        op: import("zod").ZodString;
        args: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
        identity: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        connectionId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.auth.oauth.complete": import("@magnis/sdk").RpcContract<"source.auth.oauth.complete", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        code: import("zod").ZodString;
        state: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
        identity: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        connectionId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.auth.session.cancel": import("@magnis/sdk").RpcContract<"source.auth.session.cancel", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        sessionId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        cancelled: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.auth.session.open": import("@magnis/sdk").RpcContract<"source.auth.session.open", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        intent: import("zod").ZodEnum<{
            repair: "repair";
            add: "add";
        }>;
        presentation: import("zod").ZodEnum<{
            web: "web";
            cli: "cli";
        }>;
        connectionId: import("zod").ZodOptional<import("zod").ZodString>;
        repairAction: import("zod").ZodOptional<import("zod").ZodEnum<{
            reconnectOauth: "reconnectOauth";
            reloginPhone: "reloginPhone";
            enterKey: "enterKey";
            replaceKey: "replaceKey";
        }>>;
        redirectUri: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        sessionId: import("zod").ZodString;
        authType: import("zod").ZodEnum<{
            oauth2: "oauth2";
            phoneCode: "phoneCode";
            apiKey: "apiKey";
            sharedProvider: "sharedProvider";
        }>;
        redirectUrl: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.auth.submit": import("@magnis/sdk").RpcContract<"source.auth.submit", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        sessionId: import("zod").ZodString;
        step: import("zod").ZodString;
        value: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.keys.list": import("@magnis/sdk").RpcContract<"source.keys.list", import("zod").ZodObject<{
        accountId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        vaultAvailable: import("zod").ZodBoolean;
        sources: import("zod").ZodArray<import("zod").ZodObject<{
            sourceId: import("zod").ZodString;
            displayName: import("zod").ZodString;
            keys: import("zod").ZodArray<import("zod").ZodObject<{
                key: import("zod").ZodString;
                label: import("zod").ZodString;
                helpUrl: import("zod").ZodNullable<import("zod").ZodString>;
                description: import("zod").ZodNullable<import("zod").ZodString>;
                vaultConfigured: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.keys.set": import("@magnis/sdk").RpcContract<"source.keys.set", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        key: import("zod").ZodString;
        value: import("zod").ZodString;
        accountId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.list": import("@magnis/sdk").RpcContract<"source.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        sources: import("zod").ZodArray<import("zod").ZodObject<{
            sourceId: import("zod").ZodString;
            displayName: import("zod").ZodString;
            surfaces: import("zod").ZodArray<import("zod").ZodString>;
            authType: import("zod").ZodEnum<{
                none: "none";
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
            }>;
            packageHash: import("zod").ZodString;
            connectable: import("zod").ZodBoolean;
            unavailableReason: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.status.list": import("@magnis/sdk").RpcContract<"source.status.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        sources: import("zod").ZodArray<import("zod").ZodObject<{
            sourceId: import("zod").ZodString;
            displayName: import("zod").ZodString;
            availability: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"installedDisabled">;
                packageHash: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"active">;
                packageHash: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"unavailable">;
                packageHash: import("zod").ZodString;
                reason: import("zod").ZodString;
            }, import("zod/v4/core").$strict>], "state">;
            accounts: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                authKind: import("zod").ZodEnum<{
                    oauth2: "oauth2";
                    phoneCode: "phoneCode";
                    apiKey: "apiKey";
                    sharedProvider: "sharedProvider";
                }>;
                lifecycle: import("zod").ZodLiteral<"authRequired">;
                repair: import("zod").ZodEnum<{
                    reconnectOauth: "reconnectOauth";
                    reloginPhone: "reloginPhone";
                    enterKey: "enterKey";
                    replaceKey: "replaceKey";
                }>;
                accountId: import("zod").ZodString;
                displayName: import("zod").ZodString;
                providerAccountId: import("zod").ZodNullable<import("zod").ZodString>;
                generation: import("zod").ZodNumber;
                invalidReason: import("zod").ZodNullable<import("zod").ZodString>;
                credential: import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"unconfigured">;
                }, import("zod/v4/core").$strict>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"minted">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"userKey">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"deploymentKey">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"fixture">;
                    revision: import("zod").ZodNull;
                }, import("zod/v4/core").$strict>], "kind">, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"unavailable">;
                    kind: import("zod").ZodEnum<{
                        minted: "minted";
                        userKey: "userKey";
                        deploymentKey: "deploymentKey";
                        fixture: "fixture";
                    }>;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>]>;
                runtime: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"absent">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"starting">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"stopping">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"failed">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>], "state">;
                surfaces: import("zod").ZodArray<import("zod").ZodObject<{
                    surface: import("zod").ZodString;
                    sync: import("zod").ZodNullable<import("zod").ZodObject<{
                        syncApplication: import("zod").ZodNullable<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"pending">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"applied">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"failed">;
                            message: import("zod").ZodString;
                        }, import("zod/v4/core").$strict>], "kind">>;
                        appliedSyncRevisions: import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
                        status: import("zod").ZodUnion<readonly [import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"bootstrap">;
                            estimatedAt: import("zod").ZodUnion<readonly [import("zod").ZodISODateTime, import("zod").ZodLiteral<"unknown">]>;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"reconcile">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"backfill">;
                            estimatedAt: import("zod").ZodUnion<readonly [import("zod").ZodISODateTime, import("zod").ZodLiteral<"unknown">]>;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"catchingUp">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"live">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"polling">;
                            nextAt: import("zod").ZodISODateTime;
                        }, import("zod/v4/core").$strict>], "kind">, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"rateLimited">;
                            retryAt: import("zod").ZodISODateTime;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"interrupted">;
                            retryAt: import("zod").ZodISODateTime;
                            message: import("zod").ZodString;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"signInRequired">;
                        }, import("zod/v4/core").$strict>], "kind">]>;
                        progress: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                            name: import("zod").ZodString;
                            synced: import("zod").ZodNumber;
                            estimation: import("zod").ZodUnion<readonly [import("zod").ZodLiteral<"unplanned">, import("zod").ZodObject<{
                                total: import("zod").ZodNumber;
                                skipped: import("zod").ZodNumber;
                            }, import("zod/v4/core").$strict>]>;
                        }, import("zod/v4/core").$strict>>;
                    }, import("zod/v4/core").$strict>>;
                }, import("zod/v4/core").$strict>>;
            }, import("zod/v4/core").$strict>, ...import("zod").ZodObject<{
                lifecycle: import("zod").ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
                repair: import("zod").ZodNull;
                accountId: import("zod").ZodString;
                displayName: import("zod").ZodString;
                providerAccountId: import("zod").ZodNullable<import("zod").ZodString>;
                authKind: import("zod").ZodEnum<{
                    none: "none";
                    oauth2: "oauth2";
                    phoneCode: "phoneCode";
                    apiKey: "apiKey";
                    sharedProvider: "sharedProvider";
                }>;
                generation: import("zod").ZodNumber;
                invalidReason: import("zod").ZodNullable<import("zod").ZodString>;
                credential: import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"unconfigured">;
                }, import("zod/v4/core").$strict>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"minted">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"userKey">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"deploymentKey">;
                    revision: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                    kind: import("zod").ZodLiteral<"fixture">;
                    revision: import("zod").ZodNull;
                }, import("zod/v4/core").$strict>], "kind">, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"unavailable">;
                    kind: import("zod").ZodEnum<{
                        minted: "minted";
                        userKey: "userKey";
                        deploymentKey: "deploymentKey";
                        fixture: "fixture";
                    }>;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>]>;
                runtime: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"absent">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"starting">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"ready">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"stopping">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"failed">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>], "state">;
                surfaces: import("zod").ZodArray<import("zod").ZodObject<{
                    surface: import("zod").ZodString;
                    sync: import("zod").ZodNullable<import("zod").ZodObject<{
                        syncApplication: import("zod").ZodNullable<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"pending">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"applied">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"failed">;
                            message: import("zod").ZodString;
                        }, import("zod/v4/core").$strict>], "kind">>;
                        appliedSyncRevisions: import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
                        status: import("zod").ZodUnion<readonly [import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"bootstrap">;
                            estimatedAt: import("zod").ZodUnion<readonly [import("zod").ZodISODateTime, import("zod").ZodLiteral<"unknown">]>;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"reconcile">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"backfill">;
                            estimatedAt: import("zod").ZodUnion<readonly [import("zod").ZodISODateTime, import("zod").ZodLiteral<"unknown">]>;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"catchingUp">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"live">;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"polling">;
                            nextAt: import("zod").ZodISODateTime;
                        }, import("zod/v4/core").$strict>], "kind">, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"rateLimited">;
                            retryAt: import("zod").ZodISODateTime;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"interrupted">;
                            retryAt: import("zod").ZodISODateTime;
                            message: import("zod").ZodString;
                        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                            kind: import("zod").ZodLiteral<"signInRequired">;
                        }, import("zod/v4/core").$strict>], "kind">]>;
                        progress: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                            name: import("zod").ZodString;
                            synced: import("zod").ZodNumber;
                            estimation: import("zod").ZodUnion<readonly [import("zod").ZodLiteral<"unplanned">, import("zod").ZodObject<{
                                total: import("zod").ZodNumber;
                                skipped: import("zod").ZodNumber;
                            }, import("zod/v4/core").$strict>]>;
                        }, import("zod/v4/core").$strict>>;
                    }, import("zod/v4/core").$strict>>;
                }, import("zod/v4/core").$strict>>;
            }, import("zod/v4/core").$strict>[]], "lifecycle">>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "source.sync.bootstrap": import("@magnis/sdk").RpcContract<"source.sync.bootstrap", import("zod").ZodObject<{
        sourceId: import("zod").ZodString;
        surface: import("zod").ZodString;
        params: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
        seeded: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "skills.capabilities": import("@magnis/sdk").RpcContract<"skills.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "skills.list": import("@magnis/sdk").RpcContract<"skills.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "skills.list_files": import("@magnis/sdk").RpcContract<"skills.list_files", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        files: import("zod").ZodArray<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "skills.read": import("@magnis/sdk").RpcContract<"skills.read", import("zod").ZodObject<{
        id: import("zod").ZodString;
        path: import("zod").ZodDefault<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        content: import("zod").ZodString;
        truncated: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "skills.skill.list": {
        readonly method: "skills.skill.list";
        readonly input: import("zod").ZodObject<{}, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            description: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "skills.skill.get": {
        readonly method: "skills.skill.get";
        readonly input: import("zod").ZodObject<{
            id: import("zod").ZodString;
            path: import("zod").ZodDefault<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            content: import("zod").ZodString;
            truncated: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "skills.skill.file.list": {
        readonly method: "skills.skill.file.list";
        readonly input: import("zod").ZodObject<{
            id: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            files: import("zod").ZodArray<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "setup.get": import("@magnis/sdk").RpcContract<"setup.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        document: import("zod").ZodObject<{
            version: import("zod").ZodNumber;
            completed: import("zod").ZodBoolean;
            currentStep: import("zod").ZodString;
            sources: import("zod").ZodArray<import("zod").ZodString>;
            engine: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        plan: import("zod").ZodObject<{
            steps: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"welcome">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"accounts">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"connect">;
                source: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"agent">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"syncing">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"done">;
            }, import("zod/v4/core").$strict>], "kind">>>;
        }, import("zod/v4/core").$strict>;
        stage: import("zod").ZodObject<{
            current: import("zod").ZodNullable<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"welcome">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"accounts">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"connect">;
                source: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"agent">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"syncing">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"done">;
            }, import("zod/v4/core").$strict>], "kind">>;
            history: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
                step: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"welcome">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"accounts">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"connect">;
                    source: import("zod").ZodString;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"agent">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"syncing">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"done">;
                }, import("zod/v4/core").$strict>], "kind">;
                outcome: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"answered">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"skipped">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"refused">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>], "state">;
                session: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strict>>>;
        }, import("zod/v4/core").$strict>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "setup.update": import("@magnis/sdk").RpcContract<"setup.update", import("zod").ZodObject<{
        step: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"welcome">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"accounts">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"connect">;
            source: import("zod").ZodString;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"agent">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"syncing">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"done">;
        }, import("zod/v4/core").$strict>], "kind">;
        outcome: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"answered">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"skipped">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"refused">;
            reason: import("zod").ZodString;
        }, import("zod/v4/core").$strict>], "state">;
        session: import("zod").ZodNullable<import("zod").ZodString>;
        document: import("zod").ZodNullable<import("zod").ZodObject<{
            version: import("zod").ZodNumber;
            completed: import("zod").ZodBoolean;
            currentStep: import("zod").ZodString;
            sources: import("zod").ZodArray<import("zod").ZodString>;
            engine: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        document: import("zod").ZodObject<{
            version: import("zod").ZodNumber;
            completed: import("zod").ZodBoolean;
            currentStep: import("zod").ZodString;
            sources: import("zod").ZodArray<import("zod").ZodString>;
            engine: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        plan: import("zod").ZodObject<{
            steps: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"welcome">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"accounts">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"connect">;
                source: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"agent">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"syncing">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"done">;
            }, import("zod/v4/core").$strict>], "kind">>>;
        }, import("zod/v4/core").$strict>;
        stage: import("zod").ZodObject<{
            current: import("zod").ZodNullable<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"welcome">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"accounts">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"connect">;
                source: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"agent">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"syncing">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"done">;
            }, import("zod/v4/core").$strict>], "kind">>;
            history: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
                step: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"welcome">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"accounts">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"connect">;
                    source: import("zod").ZodString;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"agent">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"syncing">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"done">;
                }, import("zod/v4/core").$strict>], "kind">;
                outcome: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"answered">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"skipped">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    state: import("zod").ZodLiteral<"refused">;
                    reason: import("zod").ZodString;
                }, import("zod/v4/core").$strict>], "state">;
                session: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strict>>>;
        }, import("zod/v4/core").$strict>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "search.by_graph": import("@magnis/sdk").RpcContract<"search.by_graph", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        depth: import("zod").ZodDefault<import("zod").ZodInt>;
        linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            syncEnabled: import("zod").ZodBoolean;
            syncRevision: import("zod").ZodString;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            syncEnabled: import("zod").ZodNull;
            syncRevision: import("zod").ZodNull;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>]>>;
        id: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        schemaId: import("zod").ZodString;
        score: import("zod").ZodNumber;
        excerpt: import("zod").ZodOptional<import("zod").ZodString>;
        linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "search.capabilities": import("@magnis/sdk").RpcContract<"search.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "search.combined": import("@magnis/sdk").RpcContract<"search.combined", import("zod").ZodObject<{
        query: import("zod").ZodString;
        relatedTo: import("zod").ZodDefault<import("zod").ZodArray<import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>>;
        schemaIds: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            syncEnabled: import("zod").ZodBoolean;
            syncRevision: import("zod").ZodString;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            syncEnabled: import("zod").ZodNull;
            syncRevision: import("zod").ZodNull;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>]>>;
        id: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        schemaId: import("zod").ZodString;
        score: import("zod").ZodNumber;
        excerpt: import("zod").ZodOptional<import("zod").ZodString>;
        linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "search.fast": import("@magnis/sdk").RpcContract<"search.fast", import("zod").ZodObject<{
        query: import("zod").ZodString;
        mentionIds: import("zod").ZodDefault<import("zod").ZodArray<import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>>;
        schemaIds: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        retrieval: import("zod").ZodDefault<import("zod").ZodEnum<{
            text: "text";
            hybrid: "hybrid";
        }>>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        results: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            score: import("zod").ZodNumber;
            excerpt: import("zod").ZodOptional<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "search.hybrid": import("@magnis/sdk").RpcContract<"search.hybrid", import("zod").ZodObject<{
        query: import("zod").ZodString;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            syncEnabled: import("zod").ZodBoolean;
            syncRevision: import("zod").ZodString;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            syncEnabled: import("zod").ZodNull;
            syncRevision: import("zod").ZodNull;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>]>>;
        id: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        schemaId: import("zod").ZodString;
        score: import("zod").ZodNumber;
        excerpt: import("zod").ZodOptional<import("zod").ZodString>;
        linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "search.indexing_status": import("@magnis/sdk").RpcContract<"search.indexing_status", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        indexed: import("zod").ZodInt;
        total: import("zod").ZodInt;
        pending: import("zod").ZodInt;
        percent: import("zod").ZodInt;
        model: import("zod").ZodString;
        status: import("zod").ZodEnum<{
            idle: "idle";
            indexing: "indexing";
        }>;
        activeModelId: import("zod").ZodNullable<import("zod").ZodString>;
        lifecycleState: import("zod").ZodEnum<{
            failed: "failed";
            ready: "ready";
            unconfigured: "unconfigured";
            catching_up: "catching_up";
            reconfiguring: "reconfiguring";
        }>;
        generation: import("zod").ZodInt;
        lastFailure: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "search.model_status": import("@magnis/sdk").RpcContract<"search.model_status", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        key: import("zod").ZodString;
        downloaded: import("zod").ZodBoolean;
        downloadSize: import("zod").ZodNullable<import("zod").ZodString>;
        diskUsage: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "search.entities.search": {
        readonly method: "search.entities.search";
        readonly input: import("zod").ZodObject<{
            query: import("zod").ZodString;
            relatedTo: import("zod").ZodDefault<import("zod").ZodArray<import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>>;
            schemaIds: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
            limit: import("zod").ZodDefault<import("zod").ZodInt>;
            extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            score: import("zod").ZodNumber;
            excerpt: import("zod").ZodOptional<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "search.neighborhood.list": {
        readonly method: "search.neighborhood.list";
        readonly input: import("zod").ZodObject<{
            entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            depth: import("zod").ZodDefault<import("zod").ZodInt>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
            extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            score: import("zod").ZodNumber;
            excerpt: import("zod").ZodOptional<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "runtime.composer.setPresence": import("@magnis/sdk").RpcContract<"runtime.composer.setPresence", import("zod").ZodObject<{
        presence: import("zod").ZodNullable<import("zod").ZodObject<{
            mode: import("zod").ZodEnum<{
                email: "email";
                telegram: "telegram";
            }>;
            threadKey: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "module_settings.list": import("@magnis/sdk").RpcContract<"module_settings.list", import("zod").ZodObject<{
        moduleId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        moduleId: import("zod").ZodString;
        label: import("zod").ZodString;
        schema: import("zod").ZodNullable<import("zod").ZodObject<{
            moduleId: import("zod").ZodString;
            label: import("zod").ZodString;
            description: import("zod").ZodNullable<import("zod").ZodString>;
            fields: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
                key: import("zod").ZodString;
                label: import("zod").ZodString;
                description: import("zod").ZodNullable<import("zod").ZodString>;
                fieldType: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"number">;
                    min: import("zod").ZodNullable<import("zod").ZodNumber>;
                    max: import("zod").ZodNullable<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"string">;
                    maxLength: import("zod").ZodNullable<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"boolean">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"enum">;
                    options: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
                        value: import("zod").ZodString;
                        label: import("zod").ZodString;
                        description: import("zod").ZodNullable<import("zod").ZodString>;
                    }, import("zod/v4/core").$strict>>>;
                }, import("zod/v4/core").$strict>], "type">;
                defaultValue: import("zod").ZodString;
                confirmationMessage: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strict>>>;
        }, import("zod/v4/core").$strict>>;
        values: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            key: import("zod").ZodString;
            value: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "memory.capabilities": import("@magnis/sdk").RpcContract<"memory.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.confirm": import("@magnis/sdk").RpcContract<"memory.confirm", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"ok">;
        confidence: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.diagnostics": import("@magnis/sdk").RpcContract<"memory.diagnostics", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        totalActive: import("zod").ZodNumber;
        totalRejected: import("zod").ZodNumber;
        totalStale: import("zod").ZodNumber;
        byType: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>;
        avgConfidence: import("zod").ZodNumber;
        lastConsolidation: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.forget": import("@magnis/sdk").RpcContract<"memory.forget", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"forgotten">;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.list": import("@magnis/sdk").RpcContract<"memory.list", import("zod").ZodObject<{
        memoryType: import("zod").ZodOptional<import("zod").ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        subjectEntityId: import("zod").ZodOptional<import("zod").ZodGUID>;
        sourceEpisodeId: import("zod").ZodOptional<import("zod").ZodGUID>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        memoryType: import("zod").ZodString;
        title: import("zod").ZodString;
        body: import("zod").ZodString;
        confidence: import("zod").ZodNumber;
        status: import("zod").ZodString;
        origin: import("zod").ZodString;
        sourceKind: import("zod").ZodString;
        sourceEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
        sourceMessageIds: import("zod").ZodArray<import("zod").ZodString>;
        subjectEntityId: import("zod").ZodNullable<import("zod").ZodString>;
        projectEntityId: import("zod").ZodNullable<import("zod").ZodString>;
        validFrom: import("zod").ZodString;
        lastVerifiedAt: import("zod").ZodString;
        supersededBy: import("zod").ZodNullable<import("zod").ZodString>;
        archivedAt: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "memory.reject": import("@magnis/sdk").RpcContract<"memory.reject", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"rejected">;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.save": import("@magnis/sdk").RpcContract<"memory.save", import("zod").ZodObject<{
        memoryType: import("zod").ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>;
        title: import("zod").ZodString;
        body: import("zod").ZodString;
        subjectEntityId: import("zod").ZodOptional<import("zod").ZodGUID>;
        projectEntityId: import("zod").ZodOptional<import("zod").ZodGUID>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        status: import("zod").ZodLiteral<"saved">;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "memory.search": import("@magnis/sdk").RpcContract<"memory.search", import("zod").ZodObject<{
        query: import("zod").ZodString;
        memoryType: import("zod").ZodOptional<import("zod").ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        memoryType: import("zod").ZodString;
        title: import("zod").ZodString;
        body: import("zod").ZodString;
        confidence: import("zod").ZodNumber;
        status: import("zod").ZodString;
        origin: import("zod").ZodString;
        sourceKind: import("zod").ZodString;
        sourceEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
        sourceMessageIds: import("zod").ZodArray<import("zod").ZodString>;
        subjectEntityId: import("zod").ZodNullable<import("zod").ZodString>;
        projectEntityId: import("zod").ZodNullable<import("zod").ZodString>;
        validFrom: import("zod").ZodString;
        lastVerifiedAt: import("zod").ZodString;
        supersededBy: import("zod").ZodNullable<import("zod").ZodString>;
        archivedAt: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "identity.create": import("@magnis/sdk").RpcContract<"identity.create", import("zod").ZodObject<{
        name: import("zod").ZodString;
        content: import("zod").ZodDefault<import("zod").ZodString>;
        isDefault: import("zod").ZodDefault<import("zod").ZodBoolean>;
        groupIds: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        content: import("zod").ZodString;
        isDefault: import("zod").ZodBoolean;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        groupNames: import("zod").ZodArray<import("zod").ZodString>;
        updatedAt: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "identity.delete": import("@magnis/sdk").RpcContract<"identity.delete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "identity.list": import("@magnis/sdk").RpcContract<"identity.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        content: import("zod").ZodString;
        isDefault: import("zod").ZodBoolean;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        groupNames: import("zod").ZodArray<import("zod").ZodString>;
        updatedAt: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "identity.update": import("@magnis/sdk").RpcContract<"identity.update", import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        content: import("zod").ZodOptional<import("zod").ZodString>;
        isDefault: import("zod").ZodOptional<import("zod").ZodBoolean>;
        groupIds: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        content: import("zod").ZodString;
        isDefault: import("zod").ZodBoolean;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        groupNames: import("zod").ZodArray<import("zod").ZodString>;
        updatedAt: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "hooks.create": import("@magnis/sdk").RpcContract<"hooks.create", import("zod").ZodObject<{
        name: import("zod").ZodString;
        triggerAction: import("zod").ZodString;
        triggerScope: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        description: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        reviewAgentId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        onWarning: import("zod").ZodDefault<import("zod").ZodString>;
        groupIds: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        triggerAction: import("zod").ZodString;
        triggerScope: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        reviewAgentId: import("zod").ZodOptional<import("zod").ZodString>;
        onWarning: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "hooks.delete": import("@magnis/sdk").RpcContract<"hooks.delete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "hooks.list": import("@magnis/sdk").RpcContract<"hooks.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        triggerAction: import("zod").ZodString;
        triggerScope: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        reviewAgentId: import("zod").ZodOptional<import("zod").ZodString>;
        onWarning: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "hooks.update": import("@magnis/sdk").RpcContract<"hooks.update", import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        triggerAction: import("zod").ZodOptional<import("zod").ZodString>;
        triggerScope: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        description: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        reviewAgentId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        onWarning: import("zod").ZodOptional<import("zod").ZodString>;
        groupIds: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        enabled: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        triggerAction: import("zod").ZodString;
        triggerScope: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        reviewAgentId: import("zod").ZodOptional<import("zod").ZodString>;
        onWarning: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.add_member": import("@magnis/sdk").RpcContract<"groups.add_member", import("zod").ZodObject<{
        groupId: import("zod").ZodString;
        entityId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.capabilities": import("@magnis/sdk").RpcContract<"groups.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.create": import("@magnis/sdk").RpcContract<"groups.create", import("zod").ZodObject<{
        name: import("zod").ZodString;
        description: import("zod").ZodDefault<import("zod").ZodString>;
        memory: import("zod").ZodDefault<import("zod").ZodString>;
        clientId: import("zod").ZodOptional<import("zod").ZodGUID>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodString;
        memory: import("zod").ZodString;
        memberCount: import("zod").ZodNumber;
        identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.delete": import("@magnis/sdk").RpcContract<"groups.delete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.get": import("@magnis/sdk").RpcContract<"groups.get", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        name: import("zod").ZodString;
        id: import("zod").ZodString;
        description: import("zod").ZodString;
        createdAt: import("zod").ZodString;
        memory: import("zod").ZodString;
        memberCount: import("zod").ZodNumber;
        identityProfiles: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            contentPreview: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.list": import("@magnis/sdk").RpcContract<"groups.list", import("zod").ZodObject<{
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        offset: import("zod").ZodDefault<import("zod").ZodInt>;
        search: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            description: import("zod").ZodString;
            memory: import("zod").ZodString;
            memberCount: import("zod").ZodNumber;
            identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
            createdAt: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodInt;
        limit: import("zod").ZodInt;
        offset: import("zod").ZodInt;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.list_for_entity": import("@magnis/sdk").RpcContract<"groups.list_for_entity", import("zod").ZodObject<{
        entityId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodString;
        memory: import("zod").ZodString;
        memberCount: import("zod").ZodNumber;
        identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "groups.list_members": import("@magnis/sdk").RpcContract<"groups.list_members", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        entityId: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        schemaId: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "groups.remove_member": import("@magnis/sdk").RpcContract<"groups.remove_member", import("zod").ZodObject<{
        groupId: import("zod").ZodString;
        entityId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.resolve_identity": import("@magnis/sdk").RpcContract<"groups.resolve_identity", import("zod").ZodObject<{
        entityId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        groupId: import("zod").ZodString;
        groupName: import("zod").ZodString;
        description: import("zod").ZodString;
        memory: import("zod").ZodString;
        identityProfiles: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            contentPreview: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "groups.update": import("@magnis/sdk").RpcContract<"groups.update", import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        description: import("zod").ZodOptional<import("zod").ZodString>;
        memory: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodString;
        memory: import("zod").ZodString;
        memberCount: import("zod").ZodNumber;
        identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.update_bio": import("@magnis/sdk").RpcContract<"groups.update_bio", import("zod").ZodObject<{
        groupId: import("zod").ZodString;
        content: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.update_memory": import("@magnis/sdk").RpcContract<"groups.update_memory", import("zod").ZodObject<{
        groupId: import("zod").ZodString;
        memory: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        description: import("zod").ZodString;
        memory: import("zod").ZodString;
        memberCount: import("zod").ZodNumber;
        identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "groups.group.create": {
        readonly method: "groups.group.create";
        readonly input: import("zod").ZodObject<{
            name: import("zod").ZodString;
            description: import("zod").ZodDefault<import("zod").ZodString>;
            memory: import("zod").ZodDefault<import("zod").ZodString>;
            clientId: import("zod").ZodOptional<import("zod").ZodGUID>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            description: import("zod").ZodString;
            memory: import("zod").ZodString;
            memberCount: import("zod").ZodNumber;
            identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
            createdAt: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.group.get": {
        readonly method: "groups.group.get";
        readonly input: import("zod").ZodObject<{
            id: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            name: import("zod").ZodString;
            id: import("zod").ZodString;
            description: import("zod").ZodString;
            createdAt: import("zod").ZodString;
            memory: import("zod").ZodString;
            memberCount: import("zod").ZodNumber;
            identityProfiles: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                contentPreview: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.group.link": {
        readonly method: "groups.group.link";
        readonly input: import("zod").ZodObject<{
            groupId: import("zod").ZodString;
            entityId: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            status: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.group.list": {
        readonly method: "groups.group.list";
        readonly input: import("zod").ZodObject<{
            limit: import("zod").ZodDefault<import("zod").ZodInt>;
            offset: import("zod").ZodDefault<import("zod").ZodInt>;
            search: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            items: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodString;
                description: import("zod").ZodString;
                memory: import("zod").ZodString;
                memberCount: import("zod").ZodNumber;
                identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
            total: import("zod").ZodInt;
            limit: import("zod").ZodInt;
            offset: import("zod").ZodInt;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.group.memory.update": {
        readonly method: "groups.group.memory.update";
        readonly input: import("zod").ZodObject<{
            groupId: import("zod").ZodString;
            memory: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            description: import("zod").ZodString;
            memory: import("zod").ZodString;
            memberCount: import("zod").ZodNumber;
            identityProfileName: import("zod").ZodNullable<import("zod").ZodString>;
            createdAt: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.group.unlink": {
        readonly method: "groups.group.unlink";
        readonly input: import("zod").ZodObject<{
            groupId: import("zod").ZodString;
            entityId: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            status: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "groups.identity.bio.update": {
        readonly method: "groups.identity.bio.update";
        readonly input: import("zod").ZodObject<{
            groupId: import("zod").ZodString;
            content: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            status: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "graph.approve": import("@magnis/sdk").RpcContract<"graph.approve", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
        episodeId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodUnion<readonly [import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        origin: import("zod").ZodLiteral<"canonical">;
        source: import("zod").ZodObject<{
            source: import("zod").ZodString;
            account: import("zod").ZodString;
            externalId: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        canonicalKey: import("zod").ZodNullable<import("zod").ZodString>;
        id: import("zod").ZodUnion<readonly [import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">, import("zod").ZodLiteral<"00000000-0000-0000-0000-000000000000">]>;
        schemaId: import("zod").ZodString;
        schemaVersion: import("zod").ZodInt;
        createdAt: import("zod").ZodISODateTime;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        date: import("zod").ZodISODateTime;
        idx: import("zod").ZodNullable<import("zod").ZodString>;
        properties: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        keys: import("zod").ZodArray<import("zod").ZodString>;
        origin: import("zod").ZodLiteral<"derived">;
        confidence: import("zod").ZodNumber;
        evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        id: import("zod").ZodUnion<readonly [import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">, import("zod").ZodLiteral<"00000000-0000-0000-0000-000000000000">]>;
        schemaId: import("zod").ZodString;
        schemaVersion: import("zod").ZodInt;
        createdAt: import("zod").ZodISODateTime;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        date: import("zod").ZodISODateTime;
        idx: import("zod").ZodNullable<import("zod").ZodString>;
        properties: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
    }, import("zod/v4/core").$strict>], "origin">, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        origin: import("zod").ZodLiteral<"canonical">;
        metadata: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        id: import("zod").ZodString;
        owner: import("zod").ZodString;
        from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
        createdAt: import("zod").ZodISODateTime;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        origin: import("zod").ZodLiteral<"derived">;
        confidence: import("zod").ZodNumber;
        evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        id: import("zod").ZodString;
        owner: import("zod").ZodString;
        from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
        createdAt: import("zod").ZodISODateTime;
    }, import("zod/v4/core").$strict>], "origin">]>, "required">;
    readonly "graph.capabilities": import("@magnis/sdk").RpcContract<"graph.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.archive": import("@magnis/sdk").RpcContract<"graph.entity.archive", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.get": import("@magnis/sdk").RpcContract<"graph.entity.get", import("zod").ZodObject<{
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
        id: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        schemaId: import("zod").ZodString;
        name: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
        extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            syncEnabled: import("zod").ZodBoolean;
            syncRevision: import("zod").ZodString;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            syncEnabled: import("zod").ZodNull;
            syncRevision: import("zod").ZodNull;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>]>>;
        properties: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
        linkedEntities: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            linkKind: import("zod").ZodString;
            direction: import("zod").ZodEnum<{
                in: "in";
                out: "out";
            }>;
            createdAt: import("zod").ZodString;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.links": import("@magnis/sdk").RpcContract<"graph.entity.links", import("zod").ZodObject<{
        id: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodOptional<import("zod").ZodString>;
        direction: import("zod").ZodDefault<import("zod").ZodEnum<{
            from: "from";
            to: "to";
            both: "both";
        }>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        entityId: import("zod").ZodString;
        links: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            direction: import("zod").ZodLiteral<"from">;
            kind: import("zod").ZodString;
            targetId: import("zod").ZodString;
            targetName: import("zod").ZodNullable<import("zod").ZodString>;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            id: import("zod").ZodString;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            direction: import("zod").ZodLiteral<"to">;
            kind: import("zod").ZodString;
            sourceId: import("zod").ZodString;
            sourceName: import("zod").ZodNullable<import("zod").ZodString>;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            id: import("zod").ZodString;
        }, import("zod/v4/core").$strict>], "direction">>;
        total: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.pin": import("@magnis/sdk").RpcContract<"graph.entity.pin", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        pinOrder: import("zod").ZodInt;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.unarchive": import("@magnis/sdk").RpcContract<"graph.entity.unarchive", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.unpin": import("@magnis/sdk").RpcContract<"graph.entity.unpin", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.update_properties": import("@magnis/sdk").RpcContract<"graph.entity.update_properties", import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        properties: import("zod").ZodType<import("@magnis/sdk").JsonObject, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonObject, unknown>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.find": import("@magnis/sdk").RpcContract<"graph.find", import("zod").ZodObject<{
        type: import("zod").ZodString;
        chatId: import("zod").ZodOptional<import("zod").ZodString>;
        name: import("zod").ZodOptional<import("zod").ZodString>;
        after: import("zod").ZodOptional<import("zod").ZodString>;
        before: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        offset: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            schemaId: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            date: import("zod").ZodString;
            idx: import("zod").ZodNullable<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodNumber;
        hasMore: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.get": import("@magnis/sdk").RpcContract<"graph.get", import("zod").ZodObject<{
        id: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        entity: import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            schemaId: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            date: import("zod").ZodString;
            idx: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            syncEnabled: import("zod").ZodBoolean;
            syncRevision: import("zod").ZodString;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            syncEnabled: import("zod").ZodNull;
            syncRevision: import("zod").ZodNull;
            pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
            archived: import("zod").ZodBoolean;
            private: import("zod").ZodBoolean;
            indexed: import("zod").ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, import("zod/v4/core").$strict>]>>;
        links: import("zod").ZodArray<import("zod").ZodObject<{
            from: import("zod").ZodString;
            to: import("zod").ZodString;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            id: import("zod").ZodString;
            kind: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
        linkCounts: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>;
        linksTotal: import("zod").ZodNumber;
        linksHasMore: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.link.add": import("@magnis/sdk").RpcContract<"graph.link.add", import("zod").ZodObject<{
        confidence: import("zod").ZodNumber;
        evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        kind: import("zod").ZodString;
        from: import("zod").ZodString;
        to: import("zod").ZodString;
        created: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.link.end": import("@magnis/sdk").RpcContract<"graph.link.end", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
        validUntil: import("zod").ZodISODateTime;
        evidence: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
    }, import("zod/v4/core").$strip>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        origin: import("zod").ZodLiteral<"canonical">;
        metadata: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        id: import("zod").ZodString;
        owner: import("zod").ZodString;
        from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
        createdAt: import("zod").ZodISODateTime;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        origin: import("zod").ZodLiteral<"derived">;
        confidence: import("zod").ZodNumber;
        evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
        validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        id: import("zod").ZodString;
        owner: import("zod").ZodString;
        from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
        createdAt: import("zod").ZodISODateTime;
    }, import("zod/v4/core").$strict>], "origin">, "required">;
    readonly "graph.links": import("@magnis/sdk").RpcContract<"graph.links", import("zod").ZodObject<{
        id: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        kind: import("zod").ZodString;
        direction: import("zod").ZodDefault<import("zod").ZodEnum<{
            in: "in";
            out: "out";
        }>>;
        childType: import("zod").ZodOptional<import("zod").ZodString>;
        after: import("zod").ZodOptional<import("zod").ZodString>;
        before: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        offset: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            schemaId: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            date: import("zod").ZodString;
            idx: import("zod").ZodNullable<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodNumber;
        hasMore: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.search": import("@magnis/sdk").RpcContract<"graph.search", import("zod").ZodObject<{
        query: import("zod").ZodString;
        type: import("zod").ZodOptional<import("zod").ZodString>;
        after: import("zod").ZodOptional<import("zod").ZodString>;
        before: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        extras: import("zod").ZodExactOptional<import("zod").ZodLiteral<true>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            extras: import("zod").ZodExactOptional<import("zod").ZodUnion<readonly [import("zod").ZodObject<{
                syncEnabled: import("zod").ZodBoolean;
                syncRevision: import("zod").ZodString;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                syncEnabled: import("zod").ZodNull;
                syncRevision: import("zod").ZodNull;
                pinOrder: import("zod").ZodNullable<import("zod").ZodInt>;
                archived: import("zod").ZodBoolean;
                private: import("zod").ZodBoolean;
                indexed: import("zod").ZodEnum<{
                    indexed: "indexed";
                    pending: "pending";
                    refused: "refused";
                }>;
            }, import("zod/v4/core").$strict>]>>;
            id: import("zod").ZodString;
            schemaId: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            date: import("zod").ZodString;
            idx: import("zod").ZodNullable<import("zod").ZodString>;
            linkKind: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodNumber;
        hasMore: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.withdraw": import("@magnis/sdk").RpcContract<"graph.withdraw", import("zod").ZodObject<{
        evidenceIds: import("zod").ZodArray<import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        entities: import("zod").ZodNumber;
        links: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.entity.links.list": {
        readonly method: "graph.entity.links.list";
        readonly input: import("zod").ZodObject<{
            id: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            kind: import("zod").ZodOptional<import("zod").ZodString>;
            direction: import("zod").ZodDefault<import("zod").ZodEnum<{
                from: "from";
                to: "to";
                both: "both";
            }>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            entityId: import("zod").ZodString;
            links: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                direction: import("zod").ZodLiteral<"from">;
                kind: import("zod").ZodString;
                targetId: import("zod").ZodString;
                targetName: import("zod").ZodNullable<import("zod").ZodString>;
                confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
                origin: import("zod").ZodEnum<{
                    canonical: "canonical";
                    derived: "derived";
                }>;
                validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
                id: import("zod").ZodString;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                direction: import("zod").ZodLiteral<"to">;
                kind: import("zod").ZodString;
                sourceId: import("zod").ZodString;
                sourceName: import("zod").ZodNullable<import("zod").ZodString>;
                confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
                origin: import("zod").ZodEnum<{
                    canonical: "canonical";
                    derived: "derived";
                }>;
                validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
                id: import("zod").ZodString;
            }, import("zod/v4/core").$strict>], "direction">>;
            total: import("zod").ZodNumber;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "graph.link.link": {
        readonly method: "graph.link.link";
        readonly input: import("zod").ZodObject<{
            confidence: import("zod").ZodNumber;
            evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
            validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            kind: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            id: import("zod").ZodString;
            kind: import("zod").ZodString;
            from: import("zod").ZodString;
            to: import("zod").ZodString;
            created: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "graph.link.update": {
        readonly method: "graph.link.update";
        readonly input: import("zod").ZodObject<{
            id: import("zod").ZodGUID;
            validUntil: import("zod").ZodISODateTime;
            evidence: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            origin: import("zod").ZodLiteral<"canonical">;
            metadata: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
            validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            id: import("zod").ZodString;
            owner: import("zod").ZodString;
            from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            kind: import("zod").ZodString;
            createdAt: import("zod").ZodISODateTime;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            origin: import("zod").ZodLiteral<"derived">;
            confidence: import("zod").ZodNumber;
            evidence: import("zod").ZodTuple<[import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">], import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">>;
            validFrom: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            id: import("zod").ZodString;
            owner: import("zod").ZodString;
            from: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            to: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
            kind: import("zod").ZodString;
            createdAt: import("zod").ZodISODateTime;
        }, import("zod/v4/core").$strict>], "origin">;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "graph.entity.update": import("@magnis/sdk").RpcContract<"graph.entity.update", import("zod").ZodUnion<readonly [import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        pinOrder: import("zod").ZodNonOptional<import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodInt>>>;
        archived: import("zod").ZodOptional<import("zod").ZodBoolean>;
        indexed: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        pinOrder: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodInt>>;
        archived: import("zod").ZodNonOptional<import("zod").ZodOptional<import("zod").ZodBoolean>>;
        indexed: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        entityId: import("zod/v4/core").$ZodBranded<import("zod").ZodGUID, "PersistentEntityId", "out">;
        pinOrder: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodInt>>;
        archived: import("zod").ZodOptional<import("zod").ZodBoolean>;
        indexed: import("zod").ZodNonOptional<import("zod").ZodOptional<import("zod").ZodBoolean>>;
    }, import("zod/v4/core").$strict>]>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "graph.link.unlink": import("@magnis/sdk").RpcContract<"graph.link.unlink", import("zod").ZodObject<{
        id: import("zod").ZodGUID;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        ok: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "file.upload": import("@magnis/sdk").RpcContract<"file.upload", import("zod").ZodObject<{
        name: import("zod").ZodString;
        localPath: import("zod").ZodString;
        mimeType: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        schemaId: import("zod").ZodString;
        name: import("zod").ZodString;
        mimeType: import("zod").ZodString;
        sizeBytes: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "extensions.get": import("@magnis/sdk").RpcContract<"extensions.get", import("zod").ZodObject<{
        key: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        kind: import("zod").ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>;
        id: import("zod").ZodString;
        title: import("zod").ZodString;
        summary: import("zod").ZodString;
        publisher: import("zod").ZodString;
        publisherUrl: import("zod").ZodOptional<import("zod").ZodString>;
        iconUrl: import("zod").ZodString;
        details: import("zod").ZodString;
        docsUrl: import("zod").ZodOptional<import("zod").ZodString>;
        version: import("zod").ZodString;
        state: import("zod").ZodEnum<{
            active: "active";
            available: "available";
            installed_disabled: "installed_disabled";
            activation_failed: "activation_failed";
        }>;
        stateReason: import("zod").ZodOptional<import("zod").ZodString>;
        connection: import("zod").ZodOptional<import("zod").ZodString>;
        installable: import("zod").ZodBoolean;
        installed: import("zod").ZodBoolean;
        enabled: import("zod").ZodBoolean;
        packageHash: import("zod").ZodNullable<import("zod").ZodString>;
        ui: import("zod").ZodOptional<import("zod").ZodObject<{
            moduleId: import("zod").ZodString;
            packageHash: import("zod").ZodString;
            entry: import("zod").ZodString;
            exportName: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
        removable: import("zod").ZodBoolean;
        position: import("zod").ZodNumber;
        blockingDependents: import("zod").ZodArray<import("zod").ZodString>;
        unmetRequirements: import("zod").ZodArray<import("zod").ZodString>;
        surfaces: import("zod").ZodArray<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "extensions.list": import("@magnis/sdk").RpcContract<"extensions.list", import("zod").ZodObject<{
        kind: import("zod").ZodOptional<import("zod").ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>>;
        enabled: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        extensions: import("zod").ZodArray<import("zod").ZodObject<{
            kind: import("zod").ZodEnum<{
                source: "source";
                module: "module";
                skill: "skill";
            }>;
            id: import("zod").ZodString;
            title: import("zod").ZodString;
            summary: import("zod").ZodString;
            publisher: import("zod").ZodString;
            publisherUrl: import("zod").ZodOptional<import("zod").ZodString>;
            iconUrl: import("zod").ZodString;
            details: import("zod").ZodString;
            docsUrl: import("zod").ZodOptional<import("zod").ZodString>;
            version: import("zod").ZodString;
            state: import("zod").ZodEnum<{
                active: "active";
                available: "available";
                installed_disabled: "installed_disabled";
                activation_failed: "activation_failed";
            }>;
            stateReason: import("zod").ZodOptional<import("zod").ZodString>;
            connection: import("zod").ZodOptional<import("zod").ZodString>;
            installable: import("zod").ZodBoolean;
            installed: import("zod").ZodBoolean;
            enabled: import("zod").ZodBoolean;
            packageHash: import("zod").ZodNullable<import("zod").ZodString>;
            ui: import("zod").ZodOptional<import("zod").ZodObject<{
                moduleId: import("zod").ZodString;
                packageHash: import("zod").ZodString;
                entry: import("zod").ZodString;
                exportName: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
            removable: import("zod").ZodBoolean;
            position: import("zod").ZodNumber;
            blockingDependents: import("zod").ZodArray<import("zod").ZodString>;
            unmetRequirements: import("zod").ZodArray<import("zod").ZodString>;
            surfaces: import("zod").ZodArray<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "eval.capabilities": import("@magnis/sdk").RpcContract<"eval.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "eval.fixture.invoke": import("@magnis/sdk").RpcContract<"eval.fixture.invoke", import("zod").ZodObject<{
        actionId: import("zod").ZodString;
        idempotencyKey: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        invocationId: import("zod").ZodString;
        actionId: import("zod").ZodString;
        phase: import("zod").ZodLiteral<"trigger_evaluated">;
        actionTime: import("zod").ZodISODateTime;
        eventEntityId: import("zod").ZodNullable<import("zod").ZodString>;
        episodeId: import("zod").ZodNull;
        failureCode: import("zod").ZodNull;
        failureDetail: import("zod").ZodNull;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.append_message": import("@magnis/sdk").RpcContract<"episodes.append_message", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        requestId: import("zod").ZodString;
        messageId: import("zod").ZodString;
        content: import("zod").ZodString;
        attachmentIds: import("zod").ZodArray<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        kind: import("zod").ZodLiteral<"appended">;
        episodeId: import("zod").ZodString;
        inputId: import("zod").ZodString;
        sequence: import("zod").ZodNumber;
        messageId: import("zod").ZodString;
        state: import("zod").ZodLiteral<"active">;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        kind: import("zod").ZodLiteral<"queued">;
        episodeId: import("zod").ZodString;
        inputId: import("zod").ZodString;
        sequence: import("zod").ZodNumber;
        state: import("zod").ZodEnum<{
            active: "active";
            needs_input: "needs_input";
        }>;
    }, import("zod/v4/core").$strict>], "kind">, "required">;
    readonly "episodes.archive": import("@magnis/sdk").RpcContract<"episodes.archive", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.ask_user": import("@magnis/sdk").RpcContract<"episodes.ask_user", import("zod").ZodObject<{
        question: import("zod").ZodString;
        answerSchema: import("zod").ZodDefault<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodLiteral<"question_sent">;
        awaitingResponse: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.capabilities": import("@magnis/sdk").RpcContract<"episodes.capabilities", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        module: import("zod").ZodString;
        entities: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodObject<{
            entity: import("zod").ZodString;
            operations: import("zod").ZodReadonly<import("zod").ZodArray<import("zod").ZodString>>;
            forms: import("zod").ZodExactOptional<import("zod").ZodReadonly<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>>>;
        }, import("zod/v4/core").$strict>>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.complete": import("@magnis/sdk").RpcContract<"episodes.complete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.create": import("@magnis/sdk").RpcContract<"episodes.create", import("zod").ZodObject<{
        requestId: import("zod").ZodString;
        title: import("zod").ZodString;
        selection: import("zod").ZodOptional<import("zod").ZodObject<{
            implementationId: import("zod").ZodOptional<import("zod").ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>>;
            modelId: import("zod").ZodOptional<import("zod").ZodString>;
            reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"provider_default">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"explicit">;
                capabilitiesRevision: import("zod").ZodString;
                values: import("zod").ZodObject<{
                    effort: import("zod").ZodOptional<import("zod").ZodString>;
                    thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                    budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>;
            }, import("zod/v4/core").$strict>], "mode">>;
        }, import("zod/v4/core").$strict>>;
        profileId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        binding: import("zod").ZodObject<{
            revision: import("zod").ZodNumber;
            implementationId: import("zod").ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
            modelId: import("zod").ZodString;
            reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"provider_default">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"explicit">;
                capabilitiesRevision: import("zod").ZodString;
                values: import("zod").ZodObject<{
                    effort: import("zod").ZodOptional<import("zod").ZodString>;
                    thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                    budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>;
            }, import("zod/v4/core").$strict>], "mode">>;
            profile: import("zod").ZodObject<{
                profileId: import("zod").ZodString;
                configurationHash: import("zod").ZodString;
                instructions: import("zod").ZodString;
                allowedToolNames: import("zod").ZodArray<import("zod").ZodString>;
                contextBudgetTokens: import("zod").ZodNumber;
            }, import("zod/v4/core").$strict>;
            session: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                implementationId: import("zod").ZodEnum<{
                    magnis: "magnis";
                    codex: "codex";
                    claude: "claude";
                }>;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>;
        state: import("zod").ZodLiteral<"idle">;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.delegate": import("@magnis/sdk").RpcContract<"episodes.delegate", import("zod").ZodObject<{
        subagent: import("zod").ZodString;
        title: import("zod").ZodString;
        prompt: import("zod").ZodString;
        model: import("zod").ZodOptional<import("zod").ZodString>;
        background: import("zod").ZodOptional<import("zod").ZodBoolean>;
        result: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        childEpisodeId: import("zod").ZodString;
        waitId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.get": import("@magnis/sdk").RpcContract<"episodes.get", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        rootEpisodeId: import("zod").ZodString;
        parentEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
        openDelegations: import("zod").ZodInt;
        hasUnfinishedDescendants: import("zod").ZodBoolean;
        title: import("zod").ZodString;
        isArchived: import("zod").ZodBoolean;
        linkedEntities: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodNullable<import("zod").ZodString>;
            schemaId: import("zod").ZodString;
            linkKind: import("zod").ZodString;
            direction: import("zod").ZodEnum<{
                in: "in";
                out: "out";
            }>;
            createdAt: import("zod").ZodString;
            data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
            confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
            origin: import("zod").ZodEnum<{
                canonical: "canonical";
                derived: "derived";
            }>;
            validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
        }, import("zod/v4/core").$strict>>;
        createdAt: import("zod").ZodString;
        updatedAt: import("zod").ZodString;
        state: import("zod").ZodEnum<{
            active: "active";
            needs_input: "needs_input";
            idle: "idle";
        }>;
        binding: import("zod").ZodObject<{
            revision: import("zod").ZodNumber;
            implementationId: import("zod").ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
            modelId: import("zod").ZodString;
            reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"provider_default">;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                mode: import("zod").ZodLiteral<"explicit">;
                capabilitiesRevision: import("zod").ZodString;
                values: import("zod").ZodObject<{
                    effort: import("zod").ZodOptional<import("zod").ZodString>;
                    thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                    budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>;
            }, import("zod/v4/core").$strict>], "mode">>;
            profile: import("zod").ZodObject<{
                profileId: import("zod").ZodString;
                configurationHash: import("zod").ZodString;
                instructions: import("zod").ZodString;
                allowedToolNames: import("zod").ZodArray<import("zod").ZodString>;
                contextBudgetTokens: import("zod").ZodNumber;
            }, import("zod/v4/core").$strict>;
            session: import("zod").ZodNullable<import("zod").ZodObject<{
                id: import("zod").ZodString;
                implementationId: import("zod").ZodEnum<{
                    magnis: "magnis";
                    codex: "codex";
                    claude: "claude";
                }>;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>;
        workingMemory: import("zod").ZodObject<{
            agentMemory: import("zod").ZodNullable<import("zod").ZodString>;
            objective: import("zod").ZodNullable<import("zod").ZodString>;
            currentState: import("zod").ZodNullable<import("zod").ZodString>;
            recentDecisions: import("zod").ZodArray<import("zod").ZodString>;
            summary: import("zod").ZodNullable<import("zod").ZodString>;
            transcriptWindow: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                episodeId: import("zod").ZodString;
                ordinal: import("zod").ZodInt;
                role: import("zod").ZodString;
                content: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                toolName: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                toolBinding: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodObject<{
                    entity: import("zod").ZodString;
                    operation: import("zod").ZodString;
                }, import("zod/v4/core").$strict>>>;
                toolCallId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                toolArgs: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                toolResult: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                status: import("zod").ZodString;
                createdAt: import("zod").ZodString;
                attachments: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
            }, import("zod/v4/core").$strict>>;
            todos: import("zod").ZodArray<import("zod").ZodObject<{
                content: import("zod").ZodString;
                status: import("zod").ZodEnum<{
                    pending: "pending";
                    completed: "completed";
                    cancelled: "cancelled";
                    in_progress: "in_progress";
                }>;
                externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            }, import("zod/v4/core").$strict>>;
            waits: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                executionId: import("zod").ZodString;
                kind: import("zod").ZodEnum<{
                    tool_approval: "tool_approval";
                    ask_user: "ask_user";
                    native_approval: "native_approval";
                    subagent: "subagent";
                }>;
                request: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
                createdAt: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
            deniedToolCallIds: import("zod").ZodArray<import("zod").ZodString>;
            activeEntityIds: import("zod").ZodArray<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        activeExecutionId: import("zod").ZodNullable<import("zod").ZodString>;
        executionError: import("zod").ZodOptional<import("zod").ZodObject<{
            executionId: import("zod").ZodString;
            code: import("zod").ZodString;
            message: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.link_entity": import("@magnis/sdk").RpcContract<"episodes.link_entity", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        entityId: import("zod").ZodString;
        kind: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.list": import("@magnis/sdk").RpcContract<"episodes.list", import("zod").ZodObject<{
        includeChildren: import("zod").ZodOptional<import("zod").ZodBoolean>;
        search: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodOptional<import("zod").ZodString>;
        archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
        limit: import("zod").ZodDefault<import("zod").ZodNumber>;
        offset: import("zod").ZodDefault<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            title: import("zod").ZodString;
            rootEpisodeId: import("zod").ZodString;
            parentEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
            rootTitle: import("zod").ZodString;
            openDelegations: import("zod").ZodInt;
            status: import("zod").ZodUnion<[import("zod").ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>, import("zod").ZodString]>;
            isArchived: import("zod").ZodBoolean;
            messageCount: import("zod").ZodInt;
            createdAt: import("zod").ZodString;
            date: import("zod").ZodString;
            updatedAt: import("zod").ZodString;
            lastMessageAt: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodNumber;
        limit: import("zod").ZodNumber;
        offset: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.list_for_entity": import("@magnis/sdk").RpcContract<"episodes.list_for_entity", import("zod").ZodObject<{
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        offset: import("zod").ZodDefault<import("zod").ZodInt>;
        entityId: import("zod").ZodString;
        statuses: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodArray<import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        title: import("zod").ZodString;
        status: import("zod").ZodString;
        isArchived: import("zod").ZodBoolean;
        linkKinds: import("zod").ZodArray<import("zod").ZodString>;
        updatedAt: import("zod").ZodString;
        isEmpty: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "episodes.model.set": import("@magnis/sdk").RpcContract<"episodes.model.set", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        requestId: import("zod").ZodString;
        expectedRevision: import("zod").ZodNumber;
        modelId: import("zod").ZodString;
        reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"provider_default">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"explicit">;
            capabilitiesRevision: import("zod").ZodString;
            values: import("zod").ZodObject<{
                effort: import("zod").ZodOptional<import("zod").ZodString>;
                thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, import("zod/v4/core").$strict>;
        }, import("zod/v4/core").$strict>], "mode">>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        revision: import("zod").ZodNumber;
        implementationId: import("zod").ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
        modelId: import("zod").ZodString;
        reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"provider_default">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"explicit">;
            capabilitiesRevision: import("zod").ZodString;
            values: import("zod").ZodObject<{
                effort: import("zod").ZodOptional<import("zod").ZodString>;
                thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, import("zod/v4/core").$strict>;
        }, import("zod/v4/core").$strict>], "mode">>;
        profile: import("zod").ZodObject<{
            profileId: import("zod").ZodString;
            configurationHash: import("zod").ZodString;
            instructions: import("zod").ZodString;
            allowedToolNames: import("zod").ZodArray<import("zod").ZodString>;
            contextBudgetTokens: import("zod").ZodNumber;
        }, import("zod/v4/core").$strict>;
        session: import("zod").ZodNullable<import("zod").ZodObject<{
            id: import("zod").ZodString;
            implementationId: import("zod").ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.report": import("@magnis/sdk").RpcContract<"episodes.report", import("zod").ZodObject<{
        summary: import("zod").ZodString;
        result: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        reported: import("zod").ZodLiteral<true>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.search": import("@magnis/sdk").RpcContract<"episodes.search", import("zod").ZodObject<{
        query: import("zod").ZodString;
        status: import("zod").ZodOptional<import("zod").ZodString>;
        archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
        limit: import("zod").ZodDefault<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        title: import("zod").ZodString;
        status: import("zod").ZodString;
        isArchived: import("zod").ZodBoolean;
        objective: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "episodes.set_status": import("@magnis/sdk").RpcContract<"episodes.set_status", import("zod").ZodObject<{
        id: import("zod").ZodString;
        status: import("zod").ZodEnum<{
            active: "active";
            completed: "completed";
            needs_input: "needs_input";
            idle: "idle";
        }>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.set_title": import("@magnis/sdk").RpcContract<"episodes.set_title", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        title: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.stop": import("@magnis/sdk").RpcContract<"episodes.stop", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        requestId: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        executionId: import("zod").ZodNullable<import("zod").ZodString>;
        state: import("zod").ZodLiteral<"idle">;
        alreadyStopped: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.subtree": import("@magnis/sdk").RpcContract<"episodes.subtree", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        cursor: import("zod").ZodOptional<import("zod").ZodString>;
        openOnly: import("zod").ZodOptional<import("zod").ZodBoolean>;
        directOnly: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            episodeId: import("zod").ZodString;
            parentEpisodeId: import("zod").ZodString;
            rootEpisodeId: import("zod").ZodString;
            title: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>;
            depth: import("zod").ZodInt;
        }, import("zod/v4/core").$strict>>;
        nextCursor: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.summary.get": import("@magnis/sdk").RpcContract<"episodes.summary.get", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        episodeId: import("zod").ZodString;
        objective: import("zod").ZodNullable<import("zod").ZodString>;
        currentState: import("zod").ZodNullable<import("zod").ZodString>;
        recentDecisions: import("zod").ZodArray<import("zod").ZodString>;
        entityRefs: import("zod").ZodArray<import("zod").ZodString>;
        tokenEstimate: import("zod").ZodNumber;
        lastRefreshedAt: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.summary.refresh": import("@magnis/sdk").RpcContract<"episodes.summary.refresh", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        episodeId: import("zod").ZodString;
        objective: import("zod").ZodNullable<import("zod").ZodString>;
        currentState: import("zod").ZodNullable<import("zod").ZodString>;
        recentDecisions: import("zod").ZodArray<import("zod").ZodString>;
        entityRefs: import("zod").ZodArray<import("zod").ZodString>;
        tokenEstimate: import("zod").ZodNumber;
        lastRefreshedAt: import("zod").ZodString;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.todo.get": import("@magnis/sdk").RpcContract<"episodes.todo.get", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.todo.update": import("@magnis/sdk").RpcContract<"episodes.todo.update", import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.unarchive": import("@magnis/sdk").RpcContract<"episodes.unarchive", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.usage.query": import("@magnis/sdk").RpcContract<"episodes.usage.query", import("zod").ZodObject<{
        from: import("zod").ZodISODateTime;
        to: import("zod").ZodISODateTime;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        from: import("zod").ZodString;
        to: import("zod").ZodString;
        episodes: import("zod").ZodArray<import("zod").ZodObject<{
            episodeId: import("zod").ZodString;
            episodeTitle: import("zod").ZodNullable<import("zod").ZodString>;
            totalTokens: import("zod").ZodNumber;
            costMicros: import("zod").ZodNumber;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.wait.resolve": import("@magnis/sdk").RpcContract<"episodes.wait.resolve", import("zod").ZodUnion<readonly [import("zod").ZodObject<{
        kind: import("zod").ZodEnum<{
            tool_approval: "tool_approval";
            native_approval: "native_approval";
        }>;
        episodeId: import("zod").ZodString;
        waitId: import("zod").ZodString;
        resolutionId: import("zod").ZodString;
        decision: import("zod").ZodEnum<{
            approved: "approved";
            denied: "denied";
        }>;
        argumentsOverride: import("zod").ZodExactOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        kind: import("zod").ZodLiteral<"ask_user">;
        episodeId: import("zod").ZodString;
        waitId: import("zod").ZodString;
        resolutionId: import("zod").ZodString;
        answer: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
    }, import("zod/v4/core").$strict>]>, import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        waitId: import("zod").ZodString;
        inputId: import("zod").ZodString;
        state: import("zod").ZodEnum<{
            active: "active";
            needs_input: "needs_input";
        }>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.episode.ask_user": {
        readonly method: "episodes.episode.ask_user";
        readonly input: import("zod").ZodObject<{
            question: import("zod").ZodString;
            answerSchema: import("zod").ZodDefault<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            status: import("zod").ZodLiteral<"question_sent">;
            awaitingResponse: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.create": {
        readonly method: "episodes.episode.create";
        readonly input: import("zod").ZodObject<{
            subagent: import("zod").ZodString;
            title: import("zod").ZodString;
            prompt: import("zod").ZodString;
            model: import("zod").ZodOptional<import("zod").ZodString>;
            background: import("zod").ZodOptional<import("zod").ZodBoolean>;
            result: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            childEpisodeId: import("zod").ZodString;
            waitId: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.get": {
        readonly method: "episodes.episode.get";
        readonly input: import("zod").ZodObject<{
            episodeId: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            episodeId: import("zod").ZodString;
            rootEpisodeId: import("zod").ZodString;
            parentEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
            openDelegations: import("zod").ZodInt;
            hasUnfinishedDescendants: import("zod").ZodBoolean;
            title: import("zod").ZodString;
            isArchived: import("zod").ZodBoolean;
            linkedEntities: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                name: import("zod").ZodNullable<import("zod").ZodString>;
                schemaId: import("zod").ZodString;
                linkKind: import("zod").ZodString;
                direction: import("zod").ZodEnum<{
                    in: "in";
                    out: "out";
                }>;
                createdAt: import("zod").ZodString;
                data: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
                confidence: import("zod").ZodNullable<import("zod").ZodNumber>;
                origin: import("zod").ZodEnum<{
                    canonical: "canonical";
                    derived: "derived";
                }>;
                validUntil: import("zod").ZodNullable<import("zod").ZodISODateTime>;
            }, import("zod/v4/core").$strict>>;
            createdAt: import("zod").ZodString;
            updatedAt: import("zod").ZodString;
            state: import("zod").ZodEnum<{
                active: "active";
                needs_input: "needs_input";
                idle: "idle";
            }>;
            binding: import("zod").ZodObject<{
                revision: import("zod").ZodNumber;
                implementationId: import("zod").ZodEnum<{
                    magnis: "magnis";
                    codex: "codex";
                    claude: "claude";
                }>;
                modelId: import("zod").ZodString;
                reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    mode: import("zod").ZodLiteral<"provider_default">;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    mode: import("zod").ZodLiteral<"explicit">;
                    capabilitiesRevision: import("zod").ZodString;
                    values: import("zod").ZodObject<{
                        effort: import("zod").ZodOptional<import("zod").ZodString>;
                        thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                        budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
                    }, import("zod/v4/core").$strict>;
                }, import("zod/v4/core").$strict>], "mode">>;
                profile: import("zod").ZodObject<{
                    profileId: import("zod").ZodString;
                    configurationHash: import("zod").ZodString;
                    instructions: import("zod").ZodString;
                    allowedToolNames: import("zod").ZodArray<import("zod").ZodString>;
                    contextBudgetTokens: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>;
                session: import("zod").ZodNullable<import("zod").ZodObject<{
                    id: import("zod").ZodString;
                    implementationId: import("zod").ZodEnum<{
                        magnis: "magnis";
                        codex: "codex";
                        claude: "claude";
                    }>;
                }, import("zod/v4/core").$strict>>;
            }, import("zod/v4/core").$strict>;
            workingMemory: import("zod").ZodObject<{
                agentMemory: import("zod").ZodNullable<import("zod").ZodString>;
                objective: import("zod").ZodNullable<import("zod").ZodString>;
                currentState: import("zod").ZodNullable<import("zod").ZodString>;
                recentDecisions: import("zod").ZodArray<import("zod").ZodString>;
                summary: import("zod").ZodNullable<import("zod").ZodString>;
                transcriptWindow: import("zod").ZodArray<import("zod").ZodObject<{
                    id: import("zod").ZodString;
                    episodeId: import("zod").ZodString;
                    ordinal: import("zod").ZodInt;
                    role: import("zod").ZodString;
                    content: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                    toolName: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                    toolBinding: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodObject<{
                        entity: import("zod").ZodString;
                        operation: import("zod").ZodString;
                    }, import("zod/v4/core").$strict>>>;
                    toolCallId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                    toolArgs: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                    toolResult: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
                    status: import("zod").ZodString;
                    createdAt: import("zod").ZodString;
                    attachments: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
                }, import("zod/v4/core").$strict>>;
                todos: import("zod").ZodArray<import("zod").ZodObject<{
                    content: import("zod").ZodString;
                    status: import("zod").ZodEnum<{
                        pending: "pending";
                        completed: "completed";
                        cancelled: "cancelled";
                        in_progress: "in_progress";
                    }>;
                    externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
                }, import("zod/v4/core").$strict>>;
                waits: import("zod").ZodArray<import("zod").ZodObject<{
                    id: import("zod").ZodString;
                    executionId: import("zod").ZodString;
                    kind: import("zod").ZodEnum<{
                        tool_approval: "tool_approval";
                        ask_user: "ask_user";
                        native_approval: "native_approval";
                        subagent: "subagent";
                    }>;
                    request: import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>;
                    createdAt: import("zod").ZodString;
                }, import("zod/v4/core").$strict>>;
                deniedToolCallIds: import("zod").ZodArray<import("zod").ZodString>;
                activeEntityIds: import("zod").ZodArray<import("zod").ZodString>;
            }, import("zod/v4/core").$strict>;
            activeExecutionId: import("zod").ZodNullable<import("zod").ZodString>;
            executionError: import("zod").ZodOptional<import("zod").ZodObject<{
                executionId: import("zod").ZodString;
                code: import("zod").ZodString;
                message: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.link": {
        readonly method: "episodes.episode.link";
        readonly input: import("zod").ZodObject<{
            episodeId: import("zod").ZodString;
            entityId: import("zod").ZodString;
            kind: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            status: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.report": {
        readonly method: "episodes.episode.report";
        readonly input: import("zod").ZodObject<{
            summary: import("zod").ZodString;
            result: import("zod").ZodOptional<import("zod").ZodType<import("@magnis/sdk").JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<import("@magnis/sdk").JsonValue, unknown>>>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodObject<{
            reported: import("zod").ZodLiteral<true>;
        }, import("zod/v4/core").$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.search": {
        readonly method: "episodes.episode.search";
        readonly input: import("zod").ZodObject<{
            query: import("zod").ZodString;
            status: import("zod").ZodOptional<import("zod").ZodString>;
            archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
            limit: import("zod").ZodDefault<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strict>;
        readonly output: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            title: import("zod").ZodString;
            status: import("zod").ZodString;
            isArchived: import("zod").ZodBoolean;
            objective: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("@magnis/sdk").JsonObject>;
    };
    readonly "episodes.episode.list": import("@magnis/sdk").RpcContract<"episodes.episode.list", import("zod").ZodUnion<readonly [import("zod").ZodObject<{
        includeChildren: import("zod").ZodOptional<import("zod").ZodBoolean>;
        search: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodOptional<import("zod").ZodString>;
        archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
        limit: import("zod").ZodDefault<import("zod").ZodNumber>;
        offset: import("zod").ZodDefault<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        limit: import("zod").ZodDefault<import("zod").ZodInt>;
        offset: import("zod").ZodDefault<import("zod").ZodInt>;
        entityId: import("zod").ZodString;
        statuses: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        archived: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodBoolean>>;
    }, import("zod/v4/core").$strict>]>, import("zod").ZodUnion<readonly [import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            title: import("zod").ZodString;
            rootEpisodeId: import("zod").ZodString;
            parentEpisodeId: import("zod").ZodNullable<import("zod").ZodString>;
            rootTitle: import("zod").ZodString;
            openDelegations: import("zod").ZodInt;
            status: import("zod").ZodUnion<[import("zod").ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>, import("zod").ZodString]>;
            isArchived: import("zod").ZodBoolean;
            messageCount: import("zod").ZodInt;
            createdAt: import("zod").ZodString;
            date: import("zod").ZodString;
            updatedAt: import("zod").ZodString;
            lastMessageAt: import("zod").ZodOptional<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        total: import("zod").ZodNumber;
        limit: import("zod").ZodNumber;
        offset: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, import("zod").ZodArray<import("zod").ZodObject<{
        episodeId: import("zod").ZodString;
        title: import("zod").ZodString;
        status: import("zod").ZodString;
        isArchived: import("zod").ZodBoolean;
        linkKinds: import("zod").ZodArray<import("zod").ZodString>;
        updatedAt: import("zod").ZodString;
        isEmpty: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>>]>, "required">;
    readonly "episodes.episode.update": import("@magnis/sdk").RpcContract<"episodes.episode.update", import("zod").ZodObject<{
        id: import("zod").ZodString;
        title: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodOptional<import("zod").ZodEnum<{
            active: "active";
            completed: "completed";
            needs_input: "needs_input";
            idle: "idle";
        }>>;
        archived: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.todo.list": import("@magnis/sdk").RpcContract<"episodes.workspace.todo.list", import("zod").ZodObject<{}, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            id: import("zod").ZodUUID;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.todo.add": import("@magnis/sdk").RpcContract<"episodes.workspace.todo.add", import("zod").ZodObject<{
        content: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            id: import("zod").ZodUUID;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.todo.rm": import("@magnis/sdk").RpcContract<"episodes.workspace.todo.rm", import("zod").ZodObject<{
        id: import("zod").ZodUUID;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            id: import("zod").ZodUUID;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.todo.update": import("@magnis/sdk").RpcContract<"episodes.workspace.todo.update", import("zod").ZodObject<{
        id: import("zod").ZodUUID;
        content: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodOptional<import("zod").ZodEnum<{
            pending: "pending";
            completed: "completed";
            cancelled: "cancelled";
            in_progress: "in_progress";
        }>>;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        items: import("zod").ZodArray<import("zod").ZodObject<{
            content: import("zod").ZodString;
            status: import("zod").ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: import("zod").ZodDefault<import("zod").ZodNullable<import("zod").ZodString>>;
            id: import("zod").ZodUUID;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.memory.get": import("@magnis/sdk").RpcContract<"episodes.workspace.memory.get", import("zod").ZodObject<{}, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        body: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "episodes.workspace.memory.save": import("@magnis/sdk").RpcContract<"episodes.workspace.memory.save", import("zod").ZodObject<{
        body: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        body: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "credits.balance.get": import("@magnis/sdk").RpcContract<"credits.balance.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        userId: import("zod").ZodString;
        limitMicros: import("zod").ZodNumber;
        remainingMicros: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "billing.ledger.query": import("@magnis/sdk").RpcContract<"billing.ledger.query", import("zod").ZodObject<{
        from: import("zod").ZodOptional<import("zod").ZodString>;
        to: import("zod").ZodOptional<import("zod").ZodString>;
        limit: import("zod").ZodOptional<import("zod").ZodNumber>;
        offset: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        rows: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            turnId: import("zod").ZodNullable<import("zod").ZodString>;
            origin: import("zod").ZodString;
            provider: import("zod").ZodString;
            model: import("zod").ZodString;
            startedAt: import("zod").ZodString;
            finishedAt: import("zod").ZodNullable<import("zod").ZodString>;
            inputTokens: import("zod").ZodNumber;
            outputTokens: import("zod").ZodNumber;
            cacheReadTokens: import("zod").ZodNumber;
            cacheWriteTokens: import("zod").ZodNumber;
            reasoningTokens: import("zod").ZodNumber;
            costMicros: import("zod").ZodNullable<import("zod").ZodNumber>;
            status: import("zod").ZodString;
            error: import("zod").ZodNullable<import("zod").ZodString>;
        }, import("zod/v4/core").$strict>>;
        from: import("zod").ZodString;
        to: import("zod").ZodString;
        limit: import("zod").ZodNumber;
        offset: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "billing.limits.get": import("@magnis/sdk").RpcContract<"billing.limits.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        userId: import("zod").ZodString;
        creditLimitMicros: import("zod").ZodNullable<import("zod").ZodNumber>;
        spentMicros: import("zod").ZodNumber;
        reservedMicros: import("zod").ZodNumber;
        availableMicros: import("zod").ZodNullable<import("zod").ZodNumber>;
        entitled: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "allowlist.add": import("@magnis/sdk").RpcContract<"allowlist.add", import("zod").ZodObject<{
        action: import("zod").ZodString;
        targetType: import("zod").ZodString;
        targetId: import("zod").ZodString;
        targetLabel: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        episodeId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        action: import("zod").ZodString;
        targetType: import("zod").ZodString;
        targetId: import("zod").ZodString;
        targetLabel: import("zod").ZodOptional<import("zod").ZodString>;
        accessLevel: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        hookIds: import("zod").ZodArray<import("zod").ZodString>;
        episodeId: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "allowlist.delete": import("@magnis/sdk").RpcContract<"allowlist.delete", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        status: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "allowlist.get": import("@magnis/sdk").RpcContract<"allowlist.get", import("zod").ZodObject<{
        id: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        action: import("zod").ZodString;
        targetType: import("zod").ZodString;
        targetId: import("zod").ZodString;
        targetLabel: import("zod").ZodOptional<import("zod").ZodString>;
        accessLevel: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        hookIds: import("zod").ZodArray<import("zod").ZodString>;
        episodeId: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "allowlist.list": import("@magnis/sdk").RpcContract<"allowlist.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        action: import("zod").ZodString;
        targetType: import("zod").ZodString;
        targetId: import("zod").ZodString;
        targetLabel: import("zod").ZodOptional<import("zod").ZodString>;
        accessLevel: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        hookIds: import("zod").ZodArray<import("zod").ZodString>;
        episodeId: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "allowlist.update_access": import("@magnis/sdk").RpcContract<"allowlist.update_access", import("zod").ZodObject<{
        id: import("zod").ZodString;
        accessLevel: import("zod").ZodString;
        groupIds: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
        hookIds: import("zod").ZodDefault<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        id: import("zod").ZodString;
        action: import("zod").ZodString;
        targetType: import("zod").ZodString;
        targetId: import("zod").ZodString;
        targetLabel: import("zod").ZodOptional<import("zod").ZodString>;
        accessLevel: import("zod").ZodString;
        groupIds: import("zod").ZodArray<import("zod").ZodString>;
        hookIds: import("zod").ZodArray<import("zod").ZodString>;
        episodeId: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "ai_models.catalog": import("@magnis/sdk").RpcContract<"ai_models.catalog", import("zod").ZodObject<{
        providerId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        modelId: import("zod").ZodString;
        name: import("zod").ZodString;
        promptUsdPerToken: import("zod").ZodNullable<import("zod").ZodString>;
        completionUsdPerToken: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.catalog_models": import("@magnis/sdk").RpcContract<"ai_models.catalog_models", import("zod").ZodObject<{
        search: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        source: import("zod").ZodEnum<{
            bundled: "bundled";
            refreshed: "refreshed";
        }>;
        version: import("zod").ZodString;
        providers: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            name: import("zod").ZodString;
            family: import("zod").ZodString;
            api: import("zod").ZodNullable<import("zod").ZodString>;
            logoUrl: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
        models: import("zod").ZodArray<import("zod").ZodObject<{
            providerId: import("zod").ZodString;
            modelId: import("zod").ZodString;
            name: import("zod").ZodString;
            family: import("zod").ZodString;
            costInputUsdMtok: import("zod").ZodNullable<import("zod").ZodString>;
            costOutputUsdMtok: import("zod").ZodNullable<import("zod").ZodString>;
            costCacheReadUsdMtok: import("zod").ZodNullable<import("zod").ZodString>;
            costCacheWriteUsdMtok: import("zod").ZodNullable<import("zod").ZodString>;
            contextLimit: import("zod").ZodNullable<import("zod").ZodNumber>;
            reasoning: import("zod").ZodBoolean;
            logoUrl: import("zod").ZodString;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "ai_models.get_defaults": import("@magnis/sdk").RpcContract<"ai_models.get_defaults", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        capability: import("zod").ZodString;
        modelId: import("zod").ZodString;
        updatedAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.list_models": import("@magnis/sdk").RpcContract<"ai_models.list_models", import("zod").ZodObject<{
        capability: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        providerId: import("zod").ZodString;
        modelId: import("zod").ZodString;
        name: import("zod").ZodString;
        capability: import("zod").ZodString;
        enabled: import("zod").ZodBoolean;
        configJson: import("zod").ZodNullable<import("zod").ZodString>;
        createdAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.list_providers": import("@magnis/sdk").RpcContract<"ai_models.list_providers", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        name: import("zod").ZodString;
        baseUrl: import("zod").ZodNullable<import("zod").ZodString>;
        enabled: import("zod").ZodBoolean;
        authKind: import("zod").ZodString;
        reserved: import("zod").ZodBoolean;
        apiKeySet: import("zod").ZodBoolean;
        createdAt: import("zod").ZodString;
        updatedAt: import("zod").ZodString;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.subscription_status": import("@magnis/sdk").RpcContract<"ai_models.subscription_status", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        connected: import("zod").ZodBoolean;
        accountId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "ai_models.directory.language.list": import("@magnis/sdk").RpcContract<"ai_models.directory.language.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        private: import("zod").ZodBoolean;
        id: import("zod").ZodString;
        displayName: import("zod").ZodString;
        dataBoundary: import("zod").ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        contextTokens: import("zod").ZodNumber;
        capabilities: import("zod").ZodObject<{
            tools: import("zod").ZodBoolean;
            vision: import("zod").ZodBoolean;
            reasoning: import("zod").ZodBoolean;
            structuredOutput: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>;
        available: import("zod").ZodBoolean;
        isGlobalDefault: import("zod").ZodBoolean;
        reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"none">;
            revision: import("zod").ZodString;
            canUseProviderDefault: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"unknown">;
            reason: import("zod").ZodEnum<{
                metadata_unavailable: "metadata_unavailable";
                unverified_model: "unverified_model";
                adapter_not_supported: "adapter_not_supported";
            }>;
            revision: import("zod").ZodString;
            canUseProviderDefault: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            state: import("zod").ZodLiteral<"ready">;
            controls: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"effort">;
                options: import("zod").ZodArray<import("zod").ZodObject<{
                    id: import("zod").ZodString;
                    label: import("zod").ZodString;
                }, import("zod/v4/core").$strict>>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"thinking">;
                options: import("zod").ZodArray<import("zod").ZodBoolean>;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"budget">;
                unit: import("zod").ZodLiteral<"tokens">;
                min: import("zod").ZodNumber;
                max: import("zod").ZodNumber;
                step: import("zod").ZodNumber;
            }, import("zod/v4/core").$strict>], "kind">>;
            defaultValues: import("zod").ZodNullable<import("zod").ZodObject<{
                effort: import("zod").ZodOptional<import("zod").ZodString>;
                thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, import("zod/v4/core").$strict>>;
            revision: import("zod").ZodString;
            canUseProviderDefault: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strict>], "state">>;
        providerConnectionId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.directory.embedding.list": import("@magnis/sdk").RpcContract<"ai_models.directory.embedding.list", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodArray<import("zod").ZodObject<{
        private: import("zod").ZodBoolean;
        id: import("zod").ZodString;
        displayName: import("zod").ZodString;
        dataBoundary: import("zod").ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        dimensions: import("zod").ZodNumber;
        normalization: import("zod").ZodEnum<{
            none: "none";
            l2: "l2";
        }>;
        revision: import("zod").ZodString;
        available: import("zod").ZodBoolean;
    }, import("zod/v4/core").$strict>>, "required">;
    readonly "ai_models.directory.language_default.get": import("@magnis/sdk").RpcContract<"ai_models.directory.language_default.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        modelId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "ai_models.preferences.language.get": import("@magnis/sdk").RpcContract<"ai_models.preferences.language.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        mode: import("zod").ZodLiteral<"inherit">;
        modelId: import("zod").ZodNull;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        mode: import("zod").ZodLiteral<"model">;
        modelId: import("zod").ZodString;
    }, import("zod/v4/core").$strict>], "mode">, "required">;
    readonly "ai_models.preferences.language.set": import("@magnis/sdk").RpcContract<"ai_models.preferences.language.set", import("zod").ZodObject<{
        modelId: import("zod").ZodNullable<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        mode: import("zod").ZodLiteral<"inherit">;
        modelId: import("zod").ZodNull;
    }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
        mode: import("zod").ZodLiteral<"model">;
        modelId: import("zod").ZodString;
    }, import("zod/v4/core").$strict>], "mode">, "required">;
    readonly "agent.implementations": import("@magnis/sdk").RpcContract<"agent.implementations", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        implementations: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
            displayName: import("zod").ZodString;
            nativeSession: import("zod").ZodBoolean;
            usesLlmRuntime: import("zod").ZodBoolean;
            available: import("zod").ZodOptional<import("zod").ZodBoolean>;
            unavailableReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
        }, import("zod/v4/core").$strict>>;
        defaultImplementationId: import("zod").ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "agent.limits.get": import("@magnis/sdk").RpcContract<"agent.limits.get", import("zod").ZodObject<{}, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        maxSteps: import("zod").ZodNumber;
    }, import("zod/v4/core").$strict>, "required">;
    readonly "agent.models.list": import("@magnis/sdk").RpcContract<"agent.models.list", import("zod").ZodObject<{
        implementationId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
        implementationId: import("zod").ZodString;
        models: import("zod").ZodArray<import("zod").ZodObject<{
            id: import("zod").ZodString;
            modelId: import("zod").ZodString;
            name: import("zod").ZodString;
            providerConnectionId: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
            providerDisplayName: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
            dataBoundary: import("zod").ZodOptional<import("zod").ZodEnum<{
                device_only: "device_only";
                cloud_allowed: "cloud_allowed";
            }>>;
            available: import("zod").ZodOptional<import("zod").ZodBoolean>;
            unavailableReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
            isDefault: import("zod").ZodOptional<import("zod").ZodBoolean>;
            reasoning: import("zod").ZodOptional<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"none">;
                revision: import("zod").ZodString;
                canUseProviderDefault: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"unknown">;
                reason: import("zod").ZodEnum<{
                    metadata_unavailable: "metadata_unavailable";
                    unverified_model: "unverified_model";
                    adapter_not_supported: "adapter_not_supported";
                }>;
                revision: import("zod").ZodString;
                canUseProviderDefault: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                state: import("zod").ZodLiteral<"ready">;
                controls: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"effort">;
                    options: import("zod").ZodArray<import("zod").ZodObject<{
                        id: import("zod").ZodString;
                        label: import("zod").ZodString;
                    }, import("zod/v4/core").$strict>>;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"thinking">;
                    options: import("zod").ZodArray<import("zod").ZodBoolean>;
                }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
                    kind: import("zod").ZodLiteral<"budget">;
                    unit: import("zod").ZodLiteral<"tokens">;
                    min: import("zod").ZodNumber;
                    max: import("zod").ZodNumber;
                    step: import("zod").ZodNumber;
                }, import("zod/v4/core").$strict>], "kind">>;
                defaultValues: import("zod").ZodNullable<import("zod").ZodObject<{
                    effort: import("zod").ZodOptional<import("zod").ZodString>;
                    thinking: import("zod").ZodOptional<import("zod").ZodBoolean>;
                    budgetTokens: import("zod").ZodOptional<import("zod").ZodNumber>;
                }, import("zod/v4/core").$strict>>;
                revision: import("zod").ZodString;
                canUseProviderDefault: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strict>], "state">>;
        }, import("zod/v4/core").$strict>>;
        available: import("zod").ZodOptional<import("zod").ZodBoolean>;
        unavailableReason: import("zod").ZodOptional<import("zod").ZodNullable<import("zod").ZodString>>;
    }, import("zod/v4/core").$strict>, "required">;
}[Method]>>, Error>;
