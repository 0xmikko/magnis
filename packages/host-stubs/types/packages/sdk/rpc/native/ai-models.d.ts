import { z } from "zod";
export declare const aiModelLanguageDirectoryContract: import("../contract.js").RpcContract<"ai_models.directory.language.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    private: z.ZodBoolean;
    id: z.ZodString;
    displayName: z.ZodString;
    dataBoundary: z.ZodEnum<{
        device_only: "device_only";
        cloud_allowed: "cloud_allowed";
    }>;
    contextTokens: z.ZodNumber;
    capabilities: z.ZodObject<{
        tools: z.ZodBoolean;
        vision: z.ZodBoolean;
        reasoning: z.ZodBoolean;
        structuredOutput: z.ZodBoolean;
    }, z.core.$strict>;
    available: z.ZodBoolean;
    isGlobalDefault: z.ZodBoolean;
    reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"none">;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"unknown">;
        reason: z.ZodEnum<{
            metadata_unavailable: "metadata_unavailable";
            unverified_model: "unverified_model";
            adapter_not_supported: "adapter_not_supported";
        }>;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        controls: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"effort">;
            options: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"thinking">;
            options: z.ZodArray<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"budget">;
            unit: z.ZodLiteral<"tokens">;
            min: z.ZodNumber;
            max: z.ZodNumber;
            step: z.ZodNumber;
        }, z.core.$strict>], "kind">>;
        defaultValues: z.ZodNullable<z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>], "state">>;
    providerConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>>, "required">;
export declare const aiModelEmbeddingDirectoryContract: import("../contract.js").RpcContract<"ai_models.directory.embedding.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    private: z.ZodBoolean;
    id: z.ZodString;
    displayName: z.ZodString;
    dataBoundary: z.ZodEnum<{
        device_only: "device_only";
        cloud_allowed: "cloud_allowed";
    }>;
    dimensions: z.ZodNumber;
    normalization: z.ZodEnum<{
        none: "none";
        l2: "l2";
    }>;
    revision: z.ZodString;
    available: z.ZodBoolean;
}, z.core.$strict>>, "required">;
export declare const aiModelGlobalLanguageDefaultContract: import("../contract.js").RpcContract<"ai_models.directory.language_default.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodNullable<z.ZodString>;
}, z.core.$strict>, "required">;
export declare const aiModelLanguagePreferenceGetContract: import("../contract.js").RpcContract<"ai_models.preferences.language.get", z.ZodObject<{}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"inherit">;
    modelId: z.ZodNull;
}, z.core.$strict>, z.ZodObject<{
    mode: z.ZodLiteral<"model">;
    modelId: z.ZodString;
}, z.core.$strict>], "mode">, "required">;
export declare const aiModelLanguagePreferenceSetContract: import("../contract.js").RpcContract<"ai_models.preferences.language.set", z.ZodObject<{
    modelId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"inherit">;
    modelId: z.ZodNull;
}, z.core.$strict>, z.ZodObject<{
    mode: z.ZodLiteral<"model">;
    modelId: z.ZodString;
}, z.core.$strict>], "mode">, "required">;
export declare const aiModelsContracts: {
    readonly "ai_models.catalog": import("../contract.js").RpcContract<"ai_models.catalog", z.ZodObject<{
        providerId: z.ZodString;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        modelId: z.ZodString;
        name: z.ZodString;
        promptUsdPerToken: z.ZodNullable<z.ZodString>;
        completionUsdPerToken: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.catalog_models": import("../contract.js").RpcContract<"ai_models.catalog_models", z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        source: z.ZodEnum<{
            bundled: "bundled";
            refreshed: "refreshed";
        }>;
        version: z.ZodString;
        providers: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            family: z.ZodString;
            api: z.ZodNullable<z.ZodString>;
            logoUrl: z.ZodString;
        }, z.core.$strict>>;
        models: z.ZodArray<z.ZodObject<{
            providerId: z.ZodString;
            modelId: z.ZodString;
            name: z.ZodString;
            family: z.ZodString;
            costInputUsdMtok: z.ZodNullable<z.ZodString>;
            costOutputUsdMtok: z.ZodNullable<z.ZodString>;
            costCacheReadUsdMtok: z.ZodNullable<z.ZodString>;
            costCacheWriteUsdMtok: z.ZodNullable<z.ZodString>;
            contextLimit: z.ZodNullable<z.ZodNumber>;
            reasoning: z.ZodBoolean;
            logoUrl: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>, "required">;
    readonly "ai_models.get_defaults": import("../contract.js").RpcContract<"ai_models.get_defaults", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        capability: z.ZodString;
        modelId: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.list_models": import("../contract.js").RpcContract<"ai_models.list_models", z.ZodObject<{
        capability: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        providerId: z.ZodString;
        modelId: z.ZodString;
        name: z.ZodString;
        capability: z.ZodString;
        enabled: z.ZodBoolean;
        configJson: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.list_providers": import("../contract.js").RpcContract<"ai_models.list_providers", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        baseUrl: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        authKind: z.ZodString;
        reserved: z.ZodBoolean;
        apiKeySet: z.ZodBoolean;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.subscription_status": import("../contract.js").RpcContract<"ai_models.subscription_status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        connected: z.ZodBoolean;
        accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>, "required">;
    readonly "ai_models.directory.language.list": import("../contract.js").RpcContract<"ai_models.directory.language.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        private: z.ZodBoolean;
        id: z.ZodString;
        displayName: z.ZodString;
        dataBoundary: z.ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        contextTokens: z.ZodNumber;
        capabilities: z.ZodObject<{
            tools: z.ZodBoolean;
            vision: z.ZodBoolean;
            reasoning: z.ZodBoolean;
            structuredOutput: z.ZodBoolean;
        }, z.core.$strict>;
        available: z.ZodBoolean;
        isGlobalDefault: z.ZodBoolean;
        reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"none">;
            revision: z.ZodString;
            canUseProviderDefault: z.ZodBoolean;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"unknown">;
            reason: z.ZodEnum<{
                metadata_unavailable: "metadata_unavailable";
                unverified_model: "unverified_model";
                adapter_not_supported: "adapter_not_supported";
            }>;
            revision: z.ZodString;
            canUseProviderDefault: z.ZodBoolean;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"ready">;
            controls: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"effort">;
                options: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    label: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"thinking">;
                options: z.ZodArray<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"budget">;
                unit: z.ZodLiteral<"tokens">;
                min: z.ZodNumber;
                max: z.ZodNumber;
                step: z.ZodNumber;
            }, z.core.$strict>], "kind">>;
            defaultValues: z.ZodNullable<z.ZodObject<{
                effort: z.ZodOptional<z.ZodString>;
                thinking: z.ZodOptional<z.ZodBoolean>;
                budgetTokens: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strict>>;
            revision: z.ZodString;
            canUseProviderDefault: z.ZodBoolean;
        }, z.core.$strict>], "state">>;
        providerConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.directory.embedding.list": import("../contract.js").RpcContract<"ai_models.directory.embedding.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        private: z.ZodBoolean;
        id: z.ZodString;
        displayName: z.ZodString;
        dataBoundary: z.ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        dimensions: z.ZodNumber;
        normalization: z.ZodEnum<{
            none: "none";
            l2: "l2";
        }>;
        revision: z.ZodString;
        available: z.ZodBoolean;
    }, z.core.$strict>>, "required">;
    readonly "ai_models.directory.language_default.get": import("../contract.js").RpcContract<"ai_models.directory.language_default.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        modelId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "ai_models.preferences.language.get": import("../contract.js").RpcContract<"ai_models.preferences.language.get", z.ZodObject<{}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"inherit">;
        modelId: z.ZodNull;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"model">;
        modelId: z.ZodString;
    }, z.core.$strict>], "mode">, "required">;
    readonly "ai_models.preferences.language.set": import("../contract.js").RpcContract<"ai_models.preferences.language.set", z.ZodObject<{
        modelId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"inherit">;
        modelId: z.ZodNull;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"model">;
        modelId: z.ZodString;
    }, z.core.$strict>], "mode">, "required">;
};
//# sourceMappingURL=ai-models.d.ts.map