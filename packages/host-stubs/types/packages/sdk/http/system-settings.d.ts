import { z } from "zod";
import { type JsonValue } from "../core/json.js";
export declare const setDefaultAgentContract: import("./contract.js").HttpContract<"PUT", "/api/settings/agent/default-implementation", z.ZodObject<{
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
}, z.core.$strip>, z.ZodObject<{
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
}, z.core.$strict>>;
export declare const setAgentLimitsContract: import("./contract.js").HttpContract<"PUT", "/api/settings/agent/limits", z.ZodObject<{
    maxSteps: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    maxSteps: z.ZodNumber;
}, z.core.$strict>>;
export declare const updateModuleSettingsContract: import("./contract.js").HttpContract<"PUT", "/api/settings/modules/:moduleId/settings", z.ZodObject<{
    moduleId: z.ZodString;
    values: z.ZodRecord<z.ZodString, z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"ok">;
}, z.core.$strict>>;
export declare const refreshExtensionsCatalogContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/catalog/refresh", z.ZodObject<{}, z.core.$strip>, z.ZodUnion<readonly [z.ZodObject<{
    available: z.ZodLiteral<true>;
    packages: z.ZodNumber;
    channel: z.ZodString;
    curation: z.ZodNullable<z.ZodUnknown>;
}, z.core.$strip>, z.ZodObject<{
    available: z.ZodLiteral<false>;
    reason: z.ZodString;
}, z.core.$strip>]>>;
export declare const installExtensionContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/install", z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const uninstallExtensionContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/extensions/:extensionKey", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>;
export declare const enableExtensionContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/enable", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const disableExtensionContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/disable", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const updateExtensionContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/update", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const setExtensionPositionContract: import("./contract.js").HttpContract<"PUT", "/api/settings/extensions/:extensionKey/position", z.ZodObject<{
    extensionKey: z.ZodString;
    position: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const reloadExtensionContract: import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/reload", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const listSourceAppConfigContract: import("./contract.js").HttpContract<"GET", "/api/settings/sources/config", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    vaultAvailable: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        category: z.ZodEnum<{
            sharedProvider: "sharedProvider";
            module: "module";
        }>;
        keys: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            deploymentConfigured: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export declare const deleteSourceAppConfigContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/sources/:sourceId/config/:key", z.ZodObject<{
    sourceId: z.ZodString;
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>;
export declare const setSourceAppConfigContract: import("./contract.js").HttpContract<"PUT", "/api/settings/sources/:sourceId/config/:key", z.ZodObject<{
    sourceId: z.ZodString;
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>;
export declare const createAiProviderContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/providers", z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    baseUrl: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    baseUrl: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    authKind: z.ZodString;
    reserved: z.ZodBoolean;
    apiKeySet: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>;
export declare const updateAiProviderContract: import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/providers/:providerId", z.ZodObject<{
    providerId: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    baseUrl: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    baseUrl: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    authKind: z.ZodString;
    reserved: z.ZodBoolean;
    apiKeySet: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>;
export declare const deleteAiProviderContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/providers/:providerId", z.ZodObject<{
    providerId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    deleted: z.ZodString;
}, z.core.$strict>>;
export declare const createAiModelContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/models", z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
    capability: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    inputPerMtokMicros: z.ZodOptional<z.ZodNumber>;
    outputPerMtokMicros: z.ZodOptional<z.ZodNumber>;
    promptUsdPerToken: z.ZodOptional<z.ZodString>;
    completionUsdPerToken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>;
export declare const updateAiModelContract: import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
    enabled: z.ZodOptional<z.ZodBoolean>;
    configJson: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>;
export declare const deleteAiModelContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    deleted: z.ZodString;
}, z.core.$strict>>;
export declare const enableAiModelContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/models/enable", z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>;
export declare const setDefaultAiModelContract: import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/defaults/:capability", z.ZodObject<{
    capability: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    capability: z.ZodString;
    modelId: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>;
export declare const refreshAiModelCatalogContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/catalog/refresh", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    source: z.ZodString;
    version: z.ZodString;
    providers: z.ZodNumber;
    models: z.ZodNumber;
}, z.core.$strict>>;
export declare const listAiProviderConnectionsContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>;
export declare const listAiProviderSettingsContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/provider-settings", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const saveAiProviderConnectionContract: import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/runtime/providers/:providerConnectionId", z.ZodObject<{
    providerConnectionId: z.ZodString;
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
    credential: z.ZodNullable<z.ZodString>;
    configuration: z.ZodOptional<z.ZodObject<{
        catalogProviderId: z.ZodNullable<z.ZodString>;
        expectedRevision: z.ZodNullable<z.ZodString>;
        requestId: z.ZodString;
        verification: z.ZodEnum<{
            verify: "verify";
            configuration_only: "configuration_only";
        }>;
    }, z.core.$strict>>;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>;
export declare const removeAiProviderConnectionContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/providers/:providerConnectionId", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>>;
export declare const clearAiProviderCredentialContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/providers/:providerConnectionId/credential", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>>;
export declare const testAiProviderConnectionContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/test", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    connected: z.ZodLiteral<true>;
}, z.core.$strict>>;
export declare const listAiModelCatalogSourcesContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/catalog/sources", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodString>>;
export declare const listAiModelCatalogCandidatesContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/catalog/sources/:sourceId/candidates", z.ZodObject<{
    sourceId: z.ZodString;
    providerConnectionId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>;
export declare const materializeAiModelContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/models", z.ZodObject<{
    logicalModelId: z.ZodString;
    providerConnectionId: z.ZodString;
    sourceId: z.ZodString;
    physicalModelId: z.ZodString;
    capability: z.ZodEnum<{
        language: "language";
        embedding: "embedding";
    }>;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>;
export declare const setAiModelEnabledContract: import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/runtime/models/:modelId/enabled", z.ZodObject<{
    modelId: z.ZodString;
    enabled: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>;
export declare const removeMaterializedAiModelContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strict>>;
export declare const setGlobalLanguageModelContract: import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/runtime/defaults/language", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strict>>;
export declare const deleteLocalSearchModelContract: import("./contract.js").HttpContract<"DELETE", "/api/settings/search/models/:modelKey", z.ZodObject<{
    modelKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"ok">;
}, z.core.$strict>>;
export interface BillingLimitInfo {
    readonly userId: string;
    readonly creditLimitMicros: number | null;
    readonly spentMicros: number;
    readonly reservedMicros: number;
    readonly availableMicros: number | null;
    readonly entitled: boolean;
}
export declare const BillingLimitInfoSchema: z.ZodObject<{
    userId: z.ZodString;
    creditLimitMicros: z.ZodNullable<z.ZodNumber>;
    spentMicros: z.ZodNumber;
    reservedMicros: z.ZodNumber;
    availableMicros: z.ZodNullable<z.ZodNumber>;
    entitled: z.ZodBoolean;
}, z.core.$strict>;
export declare const setUserBillingLimitContract: import("./contract.js").HttpContract<"PUT", "/api/settings/users/:userId/billing-limit", z.ZodObject<{
    userId: z.ZodString;
    creditLimitMicros: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    userId: z.ZodString;
    creditLimitMicros: z.ZodNullable<z.ZodNumber>;
    spentMicros: z.ZodNumber;
    reservedMicros: z.ZodNumber;
    availableMicros: z.ZodNullable<z.ZodNumber>;
    entitled: z.ZodBoolean;
}, z.core.$strict>>;
export declare const setUserCreditLimitContract: import("./contract.js").HttpContract<"PUT", "/api/settings/users/:userId/credit-limit", z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
    remainingMicros: z.ZodNumber;
}, z.core.$strip>>;
export interface AdminUser {
    readonly id: string;
    readonly name: string;
    readonly surname: string | null;
    readonly email: string | null;
    readonly isAdmin: boolean;
}
export declare const AdminUserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strict>;
export declare const listAdminUsersContract: import("./contract.js").HttpContract<"GET", "/api/settings/users", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strict>>>;
export declare const setUserAdminContract: import("./contract.js").HttpContract<"PATCH", "/api/settings/users/:userId", z.ZodObject<{
    userId: z.ZodString;
    isAdmin: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strict>>;
export declare const updateWorkspaceContract: import("./contract.js").HttpContract<"PATCH", "/api/settings/workspace", z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    membershipMode: z.ZodEnum<{
        singleUser: "singleUser";
        multiUser: "multiUser";
    }>;
    authenticationMethod: z.ZodEnum<{
        open: "open";
        google: "google";
        password: "password";
    }>;
}, z.core.$strict>>;
export declare const listConfiguredAiModelsContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/models", z.ZodObject<{}, z.core.$strict>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>;
export declare const listOllamaLibraryContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library", z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<{
        local: "local";
        embedding: "embedding";
        cloud: "cloud";
        all: "all";
    }>>;
    providerConnectionId: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    refresh: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const listOllamaLibraryVariantsContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library/:familyId/variants", z.ZodObject<{
    familyId: z.ZodString;
    providerConnectionId: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    refresh: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const startOllamaModelPullContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls", z.ZodObject<{
    providerConnectionId: z.ZodString;
    requestId: z.ZodString;
    modelTag: z.ZodString;
    catalogRevision: z.ZodString;
    logicalModelId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const listOllamaModelPullsContract: import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strict>>>;
export declare const cancelOllamaModelPullContract: import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls/:operationId/cancel", z.ZodObject<{
    providerConnectionId: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>;
export declare const systemSettingsHttpContracts: readonly [import("./contract.js").HttpContract<"PUT", "/api/settings/agent/default-implementation", z.ZodObject<{
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
}, z.core.$strip>, z.ZodObject<{
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/agent/limits", z.ZodObject<{
    maxSteps: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    maxSteps: z.ZodNumber;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/modules/:moduleId/settings", z.ZodObject<{
    moduleId: z.ZodString;
    values: z.ZodRecord<z.ZodString, z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"ok">;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/catalog/refresh", z.ZodObject<{}, z.core.$strip>, z.ZodUnion<readonly [z.ZodObject<{
    available: z.ZodLiteral<true>;
    packages: z.ZodNumber;
    channel: z.ZodString;
    curation: z.ZodNullable<z.ZodUnknown>;
}, z.core.$strip>, z.ZodObject<{
    available: z.ZodLiteral<false>;
    reason: z.ZodString;
}, z.core.$strip>]>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/install", z.ZodObject<{
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/extensions/:extensionKey", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/enable", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/disable", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/update", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"PUT", "/api/settings/extensions/:extensionKey/position", z.ZodObject<{
    extensionKey: z.ZodString;
    position: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"POST", "/api/settings/extensions/:extensionKey/reload", z.ZodObject<{
    extensionKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        module: "module";
        skill: "skill";
    }>;
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    publisher: z.ZodString;
    publisherUrl: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodString;
    details: z.ZodString;
    docsUrl: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    state: z.ZodEnum<{
        available: "available";
        active: "active";
        installed_disabled: "installed_disabled";
        activation_failed: "activation_failed";
    }>;
    stateReason: z.ZodOptional<z.ZodString>;
    connection: z.ZodOptional<z.ZodString>;
    installable: z.ZodBoolean;
    installed: z.ZodBoolean;
    enabled: z.ZodBoolean;
    packageHash: z.ZodNullable<z.ZodString>;
    ui: z.ZodOptional<z.ZodObject<{
        moduleId: z.ZodString;
        packageHash: z.ZodString;
        entry: z.ZodString;
        exportName: z.ZodString;
    }, z.core.$strip>>;
    removable: z.ZodBoolean;
    position: z.ZodNumber;
    blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"GET", "/api/settings/sources/config", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    vaultAvailable: z.ZodBoolean;
    sources: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        displayName: z.ZodString;
        category: z.ZodEnum<{
            sharedProvider: "sharedProvider";
            module: "module";
        }>;
        keys: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            deploymentConfigured: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/sources/:sourceId/config/:key", z.ZodObject<{
    sourceId: z.ZodString;
    key: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/sources/:sourceId/config/:key", z.ZodObject<{
    sourceId: z.ZodString;
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/providers", z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    baseUrl: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    baseUrl: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    authKind: z.ZodString;
    reserved: z.ZodBoolean;
    apiKeySet: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/providers/:providerId", z.ZodObject<{
    providerId: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    baseUrl: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    baseUrl: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    authKind: z.ZodString;
    reserved: z.ZodBoolean;
    apiKeySet: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/providers/:providerId", z.ZodObject<{
    providerId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    deleted: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/models", z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
    capability: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    inputPerMtokMicros: z.ZodOptional<z.ZodNumber>;
    outputPerMtokMicros: z.ZodOptional<z.ZodNumber>;
    promptUsdPerToken: z.ZodOptional<z.ZodString>;
    completionUsdPerToken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
    enabled: z.ZodOptional<z.ZodBoolean>;
    configJson: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    deleted: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/models/enable", z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    capability: z.ZodString;
    enabled: z.ZodBoolean;
    configJson: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/defaults/:capability", z.ZodObject<{
    capability: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    capability: z.ZodString;
    modelId: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/catalog/refresh", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    source: z.ZodString;
    version: z.ZodString;
    providers: z.ZodNumber;
    models: z.ZodNumber;
}, z.core.$strict>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/models", z.ZodObject<{}, z.core.$strict>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library", z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<{
        local: "local";
        embedding: "embedding";
        cloud: "cloud";
        all: "all";
    }>>;
    providerConnectionId: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    refresh: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library/:familyId/variants", z.ZodObject<{
    familyId: z.ZodString;
    providerConnectionId: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    refresh: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls", z.ZodObject<{
    providerConnectionId: z.ZodString;
    requestId: z.ZodString;
    modelTag: z.ZodString;
    catalogRevision: z.ZodString;
    logicalModelId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strict>>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls/:operationId/cancel", z.ZodObject<{
    providerConnectionId: z.ZodString;
    operationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
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
}, z.core.$strict>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/providers", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/provider-settings", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/runtime/providers/:providerConnectionId", z.ZodObject<{
    providerConnectionId: z.ZodString;
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
    credential: z.ZodNullable<z.ZodString>;
    configuration: z.ZodOptional<z.ZodObject<{
        catalogProviderId: z.ZodNullable<z.ZodString>;
        expectedRevision: z.ZodNullable<z.ZodString>;
        requestId: z.ZodString;
        verification: z.ZodEnum<{
            verify: "verify";
            configuration_only: "configuration_only";
        }>;
    }, z.core.$strict>>;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/providers/:providerConnectionId", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/providers/:providerConnectionId/credential", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/providers/:providerConnectionId/test", z.ZodObject<{
    providerConnectionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    connected: z.ZodLiteral<true>;
}, z.core.$strict>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/catalog/sources", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodString>>, import("./contract.js").HttpContract<"GET", "/api/settings/ai-models/runtime/catalog/sources/:sourceId/candidates", z.ZodObject<{
    sourceId: z.ZodString;
    providerConnectionId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>>, import("./contract.js").HttpContract<"POST", "/api/settings/ai-models/runtime/models", z.ZodObject<{
    logicalModelId: z.ZodString;
    providerConnectionId: z.ZodString;
    sourceId: z.ZodString;
    physicalModelId: z.ZodString;
    capability: z.ZodEnum<{
        language: "language";
        embedding: "embedding";
    }>;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>, import("./contract.js").HttpContract<"PATCH", "/api/settings/ai-models/runtime/models/:modelId/enabled", z.ZodObject<{
    modelId: z.ZodString;
    enabled: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
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
}, z.core.$strip>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/ai-models/runtime/models/:modelId", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/ai-models/runtime/defaults/language", z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodString;
}, z.core.$strict>>, import("./contract.js").HttpContract<"DELETE", "/api/settings/search/models/:modelKey", z.ZodObject<{
    modelKey: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"ok">;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/users/:userId/billing-limit", z.ZodObject<{
    userId: z.ZodString;
    creditLimitMicros: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    userId: z.ZodString;
    creditLimitMicros: z.ZodNullable<z.ZodNumber>;
    spentMicros: z.ZodNumber;
    reservedMicros: z.ZodNumber;
    availableMicros: z.ZodNullable<z.ZodNumber>;
    entitled: z.ZodBoolean;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PUT", "/api/settings/users/:userId/credit-limit", z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
    remainingMicros: z.ZodNumber;
}, z.core.$strip>>, import("./contract.js").HttpContract<"GET", "/api/settings/users", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strict>>>, import("./contract.js").HttpContract<"PATCH", "/api/settings/users/:userId", z.ZodObject<{
    userId: z.ZodString;
    isAdmin: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    surname: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    isAdmin: z.ZodBoolean;
}, z.core.$strict>>, import("./contract.js").HttpContract<"PATCH", "/api/settings/workspace", z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    membershipMode: z.ZodEnum<{
        singleUser: "singleUser";
        multiUser: "multiUser";
    }>;
    authenticationMethod: z.ZodEnum<{
        open: "open";
        google: "google";
        password: "password";
    }>;
}, z.core.$strict>>];
//# sourceMappingURL=system-settings.d.ts.map