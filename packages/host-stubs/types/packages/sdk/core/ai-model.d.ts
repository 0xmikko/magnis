import { z } from "zod";
/** Exact controls for one model and execution route. Missing metadata stays unknown. */
export declare const ReasoningValuesSchema: z.ZodObject<{
    effort: z.ZodOptional<z.ZodString>;
    thinking: z.ZodOptional<z.ZodBoolean>;
    budgetTokens: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type ReasoningValues = z.output<typeof ReasoningValuesSchema>;
export declare const ReasoningControlSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strict>], "kind">;
export type ReasoningControl = z.output<typeof ReasoningControlSchema>;
export declare const ReasoningCapabilitiesSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strict>], "state">;
export type ReasoningCapabilities = z.output<typeof ReasoningCapabilitiesSchema>;
export declare const EpisodeReasoningSelectionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"provider_default">;
}, z.core.$strict>, z.ZodObject<{
    mode: z.ZodLiteral<"explicit">;
    capabilitiesRevision: z.ZodString;
    values: z.ZodObject<{
        effort: z.ZodOptional<z.ZodString>;
        thinking: z.ZodOptional<z.ZodBoolean>;
        budgetTokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>], "mode">;
export type EpisodeReasoningSelection = z.output<typeof EpisodeReasoningSelectionSchema>;
/** Shape and model-specific validation shared by UI and execution admission. */
export declare const ReasoningSelectionWithCapabilitiesSchema: z.ZodObject<{
    capabilities: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strict>], "state">;
    selection: z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"provider_default">;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"explicit">;
        capabilitiesRevision: z.ZodString;
        values: z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>], "mode">;
}, z.core.$strict>;
export declare const AiModelSchema: z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type AiModel = z.output<typeof AiModelSchema>;
export declare const AiProviderSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    baseUrl: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    authKind: z.ZodString;
    reserved: z.ZodBoolean;
    apiKeySet: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type AiProvider = z.output<typeof AiProviderSchema>;
export declare const ModelDefaultSchema: z.ZodObject<{
    capability: z.ZodString;
    modelId: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type ModelDefault = z.output<typeof ModelDefaultSchema>;
export declare const CatalogModelSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type CatalogModel = z.output<typeof CatalogModelSchema>;
/** One model returned by a provider-owned catalog (for example OpenRouter).
 * This is a flat list, distinct from the models.dev catalog page below. */
export declare const ProviderCatalogModelSchema: z.ZodObject<{
    modelId: z.ZodString;
    name: z.ZodString;
    promptUsdPerToken: z.ZodNullable<z.ZodString>;
    completionUsdPerToken: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type ProviderCatalogModel = z.output<typeof ProviderCatalogModelSchema>;
export declare const CatalogProviderSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    family: z.ZodString;
    api: z.ZodNullable<z.ZodString>;
    logoUrl: z.ZodString;
}, z.core.$strip>;
export type CatalogProvider = z.output<typeof CatalogProviderSchema>;
export declare const ModelCatalogPageSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ModelCatalogPage = z.output<typeof ModelCatalogPageSchema>;
export declare const LlmModelInfoSchema: z.ZodObject<{
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
    }, z.core.$strip>;
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
}, z.core.$strip>;
export type LlmModelInfo = z.output<typeof LlmModelInfoSchema>;
export declare const EmbeddingModelInfoSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type EmbeddingModelInfo = z.output<typeof EmbeddingModelInfoSchema>;
/** A personal language selection is either one exact logical model or an
 * explicit request to inherit the deployment-wide default. */
export declare const UserLanguagePreferenceSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"inherit">;
    modelId: z.ZodNull;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"model">;
    modelId: z.ZodString;
}, z.core.$strip>], "mode">;
export type UserLanguagePreference = z.output<typeof UserLanguagePreferenceSchema>;
export declare const AiProviderAdapterIdSchema: z.ZodEnum<{
    anthropic: "anthropic";
    openai: "openai";
    "openai-compatible": "openai-compatible";
    ollama: "ollama";
    "local-fastembed": "local-fastembed";
}>;
export type AiProviderAdapterId = z.output<typeof AiProviderAdapterIdSchema>;
export declare const AiPriceInfoSchema: z.ZodObject<{
    inputPerMtokMicros: z.ZodNumber;
    outputPerMtokMicros: z.ZodNumber;
    cacheReadPerMtokMicros: z.ZodNullable<z.ZodNumber>;
    cacheWritePerMtokMicros: z.ZodNullable<z.ZodNumber>;
    cacheWriteOneHourPerMtokMicros: z.ZodNullable<z.ZodNumber>;
    reasoningPerMtokMicros: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type AiPriceInfo = z.output<typeof AiPriceInfoSchema>;
export declare const AiLanguageCapabilitiesSchema: z.ZodObject<{
    tools: z.ZodBoolean;
    vision: z.ZodBoolean;
    reasoning: z.ZodBoolean;
    structuredOutput: z.ZodBoolean;
}, z.core.$strip>;
export type AiLanguageCapabilities = z.output<typeof AiLanguageCapabilitiesSchema>;
/** Redacted administrator view. Credentials are write-only inputs. */
export declare const AiProviderConnectionInfoSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    adapterId: z.ZodEnum<{
        anthropic: "anthropic";
        openai: "openai";
        "openai-compatible": "openai-compatible";
        ollama: "ollama";
        "local-fastembed": "local-fastembed";
    }>;
    baseUrl: z.ZodNullable<z.ZodURL>;
    enabled: z.ZodBoolean;
    credentialRequired: z.ZodBoolean;
    configurationRevision: z.ZodString;
    credentialSet: z.ZodBoolean;
}, z.core.$strip>;
export type AiProviderConnectionInfo = z.output<typeof AiProviderConnectionInfoSchema>;
/** Settings presentation is separate from runtime provider/model responses. */
export declare const AiProviderAuthKindSchema: z.ZodEnum<{
    none: "none";
    api_key: "api_key";
    native: "native";
}>;
export type AiProviderAuthKind = z.output<typeof AiProviderAuthKindSchema>;
export declare const AiProviderOriginSchema: z.ZodEnum<{
    unknown: "unknown";
    configured: "configured";
    builtin: "builtin";
}>;
export type AiProviderOrigin = z.output<typeof AiProviderOriginSchema>;
export declare const AiProviderProblemSchema: z.ZodObject<{
    code: z.ZodEnum<{
        unreachable: "unreachable";
        invalid_credentials: "invalid_credentials";
        permission_denied: "permission_denied";
        rate_limited: "rate_limited";
        unavailable: "unavailable";
        disabled: "disabled";
        configuration_required: "configuration_required";
    }>;
    message: z.ZodString;
    field: z.ZodNullable<z.ZodEnum<{
        baseUrl: "baseUrl";
        credential: "credential";
    }>>;
}, z.core.$strict>;
export type AiProviderProblem = z.output<typeof AiProviderProblemSchema>;
export declare const AiProviderDescriptorSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    adapterId: z.ZodEnum<{
        anthropic: "anthropic";
        openai: "openai";
        "openai-compatible": "openai-compatible";
        ollama: "ollama";
        "local-fastembed": "local-fastembed";
    }>;
    authKind: z.ZodEnum<{
        none: "none";
        api_key: "api_key";
        native: "native";
    }>;
    endpoint: z.ZodNullable<z.ZodURL>;
    requiresEndpoint: z.ZodBoolean;
}, z.core.$strict>;
export type AiProviderDescriptor = z.output<typeof AiProviderDescriptorSchema>;
export declare const AiSavedProviderSettingsSchema: z.ZodObject<{
    connection: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        baseUrl: z.ZodNullable<z.ZodURL>;
        enabled: z.ZodBoolean;
        credentialRequired: z.ZodBoolean;
        configurationRevision: z.ZodString;
        credentialSet: z.ZodBoolean;
        adapterId: z.ZodString;
    }, z.core.$strict>;
    catalogProviderId: z.ZodNullable<z.ZodString>;
    origin: z.ZodEnum<{
        unknown: "unknown";
        configured: "configured";
        builtin: "builtin";
    }>;
    authKind: z.ZodEnum<{
        none: "none";
        api_key: "api_key";
        native: "native";
    }>;
    lastSaveRequestId: z.ZodNullable<z.ZodString>;
    problem: z.ZodNullable<z.ZodObject<{
        code: z.ZodEnum<{
            unreachable: "unreachable";
            invalid_credentials: "invalid_credentials";
            permission_denied: "permission_denied";
            rate_limited: "rate_limited";
            unavailable: "unavailable";
            disabled: "disabled";
            configuration_required: "configuration_required";
        }>;
        message: z.ZodString;
        field: z.ZodNullable<z.ZodEnum<{
            baseUrl: "baseUrl";
            credential: "credential";
        }>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AiSavedProviderSettings = z.output<typeof AiSavedProviderSettingsSchema>;
export declare const AiProviderSettingsSnapshotSchema: z.ZodObject<{
    connections: z.ZodArray<z.ZodObject<{
        connection: z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            baseUrl: z.ZodNullable<z.ZodURL>;
            enabled: z.ZodBoolean;
            credentialRequired: z.ZodBoolean;
            configurationRevision: z.ZodString;
            credentialSet: z.ZodBoolean;
            adapterId: z.ZodString;
        }, z.core.$strict>;
        catalogProviderId: z.ZodNullable<z.ZodString>;
        origin: z.ZodEnum<{
            unknown: "unknown";
            configured: "configured";
            builtin: "builtin";
        }>;
        authKind: z.ZodEnum<{
            none: "none";
            api_key: "api_key";
            native: "native";
        }>;
        lastSaveRequestId: z.ZodNullable<z.ZodString>;
        problem: z.ZodNullable<z.ZodObject<{
            code: z.ZodEnum<{
                unreachable: "unreachable";
                invalid_credentials: "invalid_credentials";
                permission_denied: "permission_denied";
                rate_limited: "rate_limited";
                unavailable: "unavailable";
                disabled: "disabled";
                configuration_required: "configuration_required";
            }>;
            message: z.ZodString;
            field: z.ZodNullable<z.ZodEnum<{
                baseUrl: "baseUrl";
                credential: "credential";
            }>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    catalog: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        adapterId: z.ZodEnum<{
            anthropic: "anthropic";
            openai: "openai";
            "openai-compatible": "openai-compatible";
            ollama: "ollama";
            "local-fastembed": "local-fastembed";
        }>;
        authKind: z.ZodEnum<{
            none: "none";
            api_key: "api_key";
            native: "native";
        }>;
        endpoint: z.ZodNullable<z.ZodURL>;
        requiresEndpoint: z.ZodBoolean;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AiProviderSettingsSnapshot = z.output<typeof AiProviderSettingsSnapshotSchema>;
/** Missing operation preserves legacy save semantics; it never implies verification. */
export declare const AiProviderConfigurationOperationSchema: z.ZodObject<{
    catalogProviderId: z.ZodNullable<z.ZodString>;
    expectedRevision: z.ZodNullable<z.ZodString>;
    requestId: z.ZodString;
    verification: z.ZodEnum<{
        verify: "verify";
        configuration_only: "configuration_only";
    }>;
}, z.core.$strict>;
export type AiProviderConfigurationOperation = z.output<typeof AiProviderConfigurationOperationSchema>;
/** Discovery result. It cannot execute until explicitly materialized. */
export declare const AiCatalogCandidateInfoSchema: z.ZodObject<{
    sourceId: z.ZodString;
    providerConnectionId: z.ZodNullable<z.ZodString>;
    adapterId: z.ZodEnum<{
        anthropic: "anthropic";
        openai: "openai";
        "openai-compatible": "openai-compatible";
        ollama: "ollama";
        "local-fastembed": "local-fastembed";
    }>;
    physicalModelId: z.ZodString;
    displayName: z.ZodString;
    capability: z.ZodEnum<{
        language: "language";
        embedding: "embedding";
    }>;
    dataBoundary: z.ZodEnum<{
        device_only: "device_only";
        cloud_allowed: "cloud_allowed";
    }>;
    contextTokens: z.ZodNullable<z.ZodNumber>;
    languageCapabilities: z.ZodNullable<z.ZodObject<{
        tools: z.ZodBoolean;
        vision: z.ZodBoolean;
        reasoning: z.ZodBoolean;
        structuredOutput: z.ZodBoolean;
    }, z.core.$strip>>;
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
    dimensions: z.ZodNullable<z.ZodNumber>;
    normalization: z.ZodNullable<z.ZodEnum<{
        none: "none";
        l2: "l2";
    }>>;
    artifactDigest: z.ZodNullable<z.ZodString>;
    price: z.ZodObject<{
        inputPerMtokMicros: z.ZodNumber;
        outputPerMtokMicros: z.ZodNumber;
        cacheReadPerMtokMicros: z.ZodNullable<z.ZodNumber>;
        cacheWritePerMtokMicros: z.ZodNullable<z.ZodNumber>;
        cacheWriteOneHourPerMtokMicros: z.ZodNullable<z.ZodNumber>;
        reasoningPerMtokMicros: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AiCatalogCandidateInfo = z.output<typeof AiCatalogCandidateInfoSchema>;
export declare const AiLogicalModelAdminInfoSchema: z.ZodObject<{
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
    capability: z.ZodEnum<{
        language: "language";
        embedding: "embedding";
    }>;
    displayName: z.ZodString;
    dataBoundary: z.ZodEnum<{
        device_only: "device_only";
        cloud_allowed: "cloud_allowed";
    }>;
    contextTokens: z.ZodNullable<z.ZodNumber>;
    providerConnectionId: z.ZodNullable<z.ZodString>;
    dimensions: z.ZodNullable<z.ZodNumber>;
    normalization: z.ZodNullable<z.ZodEnum<{
        none: "none";
        l2: "l2";
    }>>;
    adapterId: z.ZodEnum<{
        anthropic: "anthropic";
        openai: "openai";
        "openai-compatible": "openai-compatible";
        ollama: "ollama";
        "local-fastembed": "local-fastembed";
    }>;
    physicalModelId: z.ZodString;
    languageCapabilities: z.ZodNullable<z.ZodObject<{
        tools: z.ZodBoolean;
        vision: z.ZodBoolean;
        reasoning: z.ZodBoolean;
        structuredOutput: z.ZodBoolean;
    }, z.core.$strip>>;
    artifactDigest: z.ZodNullable<z.ZodString>;
    price: z.ZodNullable<z.ZodObject<{
        inputPerMtokMicros: z.ZodNumber;
        outputPerMtokMicros: z.ZodNumber;
        cacheReadPerMtokMicros: z.ZodNullable<z.ZodNumber>;
        cacheWritePerMtokMicros: z.ZodNullable<z.ZodNumber>;
        cacheWriteOneHourPerMtokMicros: z.ZodNullable<z.ZodNumber>;
        reasoningPerMtokMicros: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    id: z.ZodString;
    configurationRevision: z.ZodString;
    enabled: z.ZodBoolean;
    available: z.ZodOptional<z.ZodBoolean>;
    unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type AiLogicalModelAdminInfo = z.output<typeof AiLogicalModelAdminInfoSchema>;
export declare const AiCallAccountingSchema: z.ZodObject<{
    modelId: z.ZodString;
    tokens: z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
        cacheWriteOneHour: z.ZodNumber;
        reasoning: z.ZodNumber;
    }, z.core.$strip>;
    totalTokens: z.ZodNumber;
    costMicros: z.ZodNumber;
    status: z.ZodEnum<{
        complete: "complete";
        failed: "failed";
        aborted: "aborted";
    }>;
}, z.core.$strip>;
export type AiCallAccounting = z.output<typeof AiCallAccountingSchema>;
export declare const OllamaLibraryFamilySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    badges: z.ZodArray<z.ZodString>;
    executionKind: z.ZodEnum<{
        unknown: "unknown";
        local: "local";
        cloud: "cloud";
        mixed: "mixed";
    }>;
    capability: z.ZodEnum<{
        unknown: "unknown";
        language: "language";
        embedding: "embedding";
    }>;
}, z.core.$strict>;
export type OllamaLibraryFamily = z.output<typeof OllamaLibraryFamilySchema>;
export declare const OllamaLibraryPageSchema: z.ZodObject<{
    families: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        badges: z.ZodArray<z.ZodString>;
        executionKind: z.ZodEnum<{
            unknown: "unknown";
            local: "local";
            cloud: "cloud";
            mixed: "mixed";
        }>;
        capability: z.ZodEnum<{
            unknown: "unknown";
            language: "language";
            embedding: "embedding";
        }>;
    }, z.core.$strict>>;
    revision: z.ZodString;
    fetchedAt: z.ZodString;
    stale: z.ZodBoolean;
    nextCursor: z.ZodNullable<z.ZodString>;
    total: z.ZodNumber;
}, z.core.$strict>;
export type OllamaLibraryPage = z.output<typeof OllamaLibraryPageSchema>;
export declare const OllamaLibraryVariantSchema: z.ZodObject<{
    modelTag: z.ZodString;
    sizeLabel: z.ZodNullable<z.ZodString>;
    executionKind: z.ZodEnum<{
        unknown: "unknown";
        local: "local";
        cloud: "cloud";
    }>;
    capability: z.ZodEnum<{
        unknown: "unknown";
        language: "language";
        embedding: "embedding";
    }>;
    installationStatus: z.ZodEnum<{
        unknown: "unknown";
        not_installed: "not_installed";
        installed: "installed";
        added: "added";
    }>;
    logicalModelId: z.ZodNullable<z.ZodString>;
    operationId: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type OllamaLibraryVariant = z.output<typeof OllamaLibraryVariantSchema>;
export declare const OllamaLibraryVariantsPageSchema: z.ZodObject<{
    familyId: z.ZodString;
    variants: z.ZodArray<z.ZodObject<{
        modelTag: z.ZodString;
        sizeLabel: z.ZodNullable<z.ZodString>;
        executionKind: z.ZodEnum<{
            unknown: "unknown";
            local: "local";
            cloud: "cloud";
        }>;
        capability: z.ZodEnum<{
            unknown: "unknown";
            language: "language";
            embedding: "embedding";
        }>;
        installationStatus: z.ZodEnum<{
            unknown: "unknown";
            not_installed: "not_installed";
            installed: "installed";
            added: "added";
        }>;
        logicalModelId: z.ZodNullable<z.ZodString>;
        operationId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    revision: z.ZodString;
    fetchedAt: z.ZodString;
    stale: z.ZodBoolean;
    nextCursor: z.ZodNullable<z.ZodString>;
    total: z.ZodNumber;
}, z.core.$strict>;
export type OllamaLibraryVariantsPage = z.output<typeof OllamaLibraryVariantsPageSchema>;
export declare const OllamaModelPullSchema: z.ZodObject<{
    id: z.ZodString;
    requestId: z.ZodString;
    providerConnectionId: z.ZodString;
    providerConfigurationRevision: z.ZodString;
    catalogRevision: z.ZodString;
    modelTag: z.ZodString;
    logicalModelId: z.ZodString;
    phase: z.ZodEnum<{
        failed: "failed";
        preparing: "preparing";
        downloading: "downloading";
        verifying: "verifying";
        adding: "adding";
        completed: "completed";
        cancelled: "cancelled";
        interrupted: "interrupted";
    }>;
    layerDigest: z.ZodNullable<z.ZodString>;
    completedBytes: z.ZodNullable<z.ZodNumber>;
    totalBytes: z.ZodNullable<z.ZodNumber>;
    installed: z.ZodBoolean;
    added: z.ZodBoolean;
    error: z.ZodNullable<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type OllamaModelPull = z.output<typeof OllamaModelPullSchema>;
//# sourceMappingURL=ai-model.d.ts.map