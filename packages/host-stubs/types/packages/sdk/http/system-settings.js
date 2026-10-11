import { z } from "zod";
import { AiCatalogCandidateInfoSchema, AiLogicalModelAdminInfoSchema, AiModelSchema, AiProviderAdapterIdSchema, AiProviderConnectionInfoSchema, AiProviderConfigurationOperationSchema, AiProviderSettingsSnapshotSchema, AiProviderSchema, ModelDefaultSchema, OllamaLibraryPageSchema, OllamaLibraryVariantsPageSchema, OllamaModelPullSchema, } from "../core/ai-model.js";
import { ExtensionCatalogRefreshResultSchema, ExtensionViewSchema, } from "../core/extension.js";
import { ModuleSettingsUpdateParamsSchema } from "../core/module-settings.js";
import { CreditBalanceSchema } from "../core/credit.js";
import { SourceAppConfigListSchema } from "../core/source.js";
import { WorkspaceSchema } from "../core/workspace.js";
import { defineHttpContract } from "./contract.js";
export const setDefaultAgentContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/agent/default-implementation",
    input: z.object({ implementationId: z.enum(["magnis", "codex", "claude"]) }),
    output: z.strictObject({ implementationId: z.enum(["magnis", "codex", "claude"]) }),
});
export const setAgentLimitsContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/agent/limits",
    input: z.object({ maxSteps: z.number().int().positive() }),
    output: z.strictObject({ maxSteps: z.number().int().positive() }),
});
export const updateModuleSettingsContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/modules/:moduleId/settings",
    input: ModuleSettingsUpdateParamsSchema,
    output: z.strictObject({ status: z.literal("ok") }),
});
export const refreshExtensionsCatalogContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/catalog/refresh",
    input: z.object({}),
    output: ExtensionCatalogRefreshResultSchema,
});
export const installExtensionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/install",
    input: z.object({ key: z.string().min(1) }),
    output: ExtensionViewSchema,
});
export const uninstallExtensionContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/extensions/:extensionKey",
    input: z.object({ extensionKey: z.string().min(1) }),
    output: z.strictObject({ ok: z.literal(true) }),
});
export const enableExtensionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/:extensionKey/enable",
    input: z.object({ extensionKey: z.string().min(1) }),
    output: ExtensionViewSchema,
});
export const disableExtensionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/:extensionKey/disable",
    input: z.object({ extensionKey: z.string().min(1) }),
    output: ExtensionViewSchema,
});
export const updateExtensionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/:extensionKey/update",
    input: z.object({ extensionKey: z.string().min(1) }),
    output: ExtensionViewSchema,
});
export const setExtensionPositionContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/extensions/:extensionKey/position",
    input: z.object({
        extensionKey: z.string().min(1),
        position: z.number().int().nonnegative(),
    }),
    output: ExtensionViewSchema,
});
export const reloadExtensionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/extensions/:extensionKey/reload",
    input: z.object({ extensionKey: z.string().min(1) }),
    output: ExtensionViewSchema,
});
export const listSourceAppConfigContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/sources/config",
    input: z.object({}),
    output: SourceAppConfigListSchema,
});
export const deleteSourceAppConfigContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/sources/:sourceId/config/:key",
    input: z.object({
        sourceId: z.string().min(1),
        key: z.string().min(1),
    }),
    output: z.strictObject({ ok: z.literal(true) }),
});
export const setSourceAppConfigContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/sources/:sourceId/config/:key",
    input: z.object({
        sourceId: z.string().min(1),
        key: z.string().min(1),
        value: z.string().min(1),
    }),
    output: z.strictObject({ ok: z.literal(true) }),
});
export const createAiProviderContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/providers",
    input: z.object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        baseUrl: z.string().min(1),
        apiKey: z.string().optional(),
    }),
    output: AiProviderSchema,
});
export const updateAiProviderContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/ai-models/providers/:providerId",
    input: z.object({
        providerId: z.string().min(1),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        enabled: z.boolean().optional(),
    }),
    output: AiProviderSchema,
});
export const deleteAiProviderContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/ai-models/providers/:providerId",
    input: z.object({ providerId: z.string().min(1) }),
    output: z.strictObject({ deleted: z.string() }),
});
export const createAiModelContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/models",
    input: z.object({
        providerId: z.string().min(1),
        modelId: z.string().min(1),
        capability: z.string().min(1),
        name: z.string().optional(),
        inputPerMtokMicros: z.number().int().nonnegative().optional(),
        outputPerMtokMicros: z.number().int().nonnegative().optional(),
        promptUsdPerToken: z.string().optional(),
        completionUsdPerToken: z.string().optional(),
    }),
    output: AiModelSchema,
});
export const updateAiModelContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/ai-models/models/:modelId",
    input: z.object({
        modelId: z.string().min(1),
        enabled: z.boolean().optional(),
        configJson: z.string().optional(),
    }),
    output: AiModelSchema,
});
export const deleteAiModelContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/ai-models/models/:modelId",
    input: z.object({ modelId: z.string().min(1) }),
    output: z.strictObject({ deleted: z.string() }),
});
export const enableAiModelContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/models/enable",
    input: z.object({ providerId: z.string().min(1), modelId: z.string().min(1) }),
    output: AiModelSchema,
});
export const setDefaultAiModelContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/ai-models/defaults/:capability",
    input: z.object({ capability: z.string().min(1), modelId: z.string().min(1) }),
    output: ModelDefaultSchema,
});
export const refreshAiModelCatalogContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/catalog/refresh",
    input: z.object({}),
    output: z.strictObject({
        source: z.string(),
        version: z.string(),
        providers: z.number().int().nonnegative(),
        models: z.number().int().nonnegative(),
    }),
});
export const listAiProviderConnectionsContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/ai-models/runtime/providers",
    input: z.object({}),
    output: z.array(AiProviderConnectionInfoSchema),
});
export const listAiProviderSettingsContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/ai-models/runtime/provider-settings",
    input: z.object({}),
    output: AiProviderSettingsSnapshotSchema,
});
export const saveAiProviderConnectionContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/ai-models/runtime/providers/:providerConnectionId",
    input: z.object({
        providerConnectionId: z.string().min(1),
        displayName: z.string().min(1),
        adapterId: AiProviderAdapterIdSchema,
        baseUrl: z.url().nullable(),
        enabled: z.boolean(),
        credentialRequired: z.boolean(),
        credential: z.string().min(1).nullable(),
        configuration: AiProviderConfigurationOperationSchema.optional(),
    }),
    output: AiProviderConnectionInfoSchema,
});
export const removeAiProviderConnectionContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/ai-models/runtime/providers/:providerConnectionId",
    input: z.object({ providerConnectionId: z.string().min(1) }),
    output: z.strictObject({ providerConnectionId: z.string().min(1) }),
});
export const clearAiProviderCredentialContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/credential",
    input: z.object({ providerConnectionId: z.string().min(1) }),
    output: z.strictObject({ providerConnectionId: z.string().min(1) }),
});
export const testAiProviderConnectionContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/test",
    input: z.object({ providerConnectionId: z.string().min(1) }),
    output: z.strictObject({ connected: z.literal(true) }),
});
export const listAiModelCatalogSourcesContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/ai-models/runtime/catalog/sources",
    input: z.object({}),
    output: z.array(z.string().min(1)),
});
export const listAiModelCatalogCandidatesContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/ai-models/runtime/catalog/sources/:sourceId/candidates",
    input: z.object({ sourceId: z.string().min(1), providerConnectionId: z.string().min(1).optional() }),
    output: z.array(AiCatalogCandidateInfoSchema),
});
export const materializeAiModelContract = defineHttpContract({
    method: "POST",
    path: "/api/settings/ai-models/runtime/models",
    input: z.object({
        logicalModelId: z.string().min(1),
        providerConnectionId: z.string().min(1),
        sourceId: z.string().min(1),
        physicalModelId: z.string().min(1),
        capability: z.enum(["language", "embedding"]),
    }),
    output: AiLogicalModelAdminInfoSchema,
});
export const setAiModelPrivateContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/ai-models/runtime/models/:modelId/private",
    input: z.strictObject({ modelId: z.string().min(1), private: z.boolean() }),
    output: AiLogicalModelAdminInfoSchema,
});
export const setAiModelEnabledContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/ai-models/runtime/models/:modelId/enabled",
    input: z.object({ modelId: z.string().min(1), enabled: z.boolean() }),
    output: AiLogicalModelAdminInfoSchema,
});
export const removeMaterializedAiModelContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/ai-models/runtime/models/:modelId",
    input: z.object({ modelId: z.string().min(1) }),
    output: z.strictObject({ modelId: z.string().min(1) }),
});
export const setGlobalLanguageModelContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/ai-models/runtime/defaults/language",
    input: z.object({ modelId: z.string().min(1) }),
    output: z.strictObject({ modelId: z.string().min(1) }),
});
export const deleteLocalSearchModelContract = defineHttpContract({
    method: "DELETE",
    path: "/api/settings/search/models/:modelKey",
    input: z.object({ modelKey: z.string().min(1) }),
    output: z.strictObject({ status: z.literal("ok") }),
});
export const BillingLimitInfoSchema = z.strictObject({
    userId: z.string().min(1),
    creditLimitMicros: z.number().int().nonnegative().nullable(),
    spentMicros: z.number().int().nonnegative(),
    reservedMicros: z.number().int().nonnegative(),
    availableMicros: z.number().int().nullable(),
    entitled: z.boolean(),
});
export const setUserBillingLimitContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/users/:userId/billing-limit",
    input: z.object({
        userId: z.string().min(1),
        creditLimitMicros: z.number().int().nonnegative().nullable(),
    }),
    output: BillingLimitInfoSchema,
});
export const setUserCreditLimitContract = defineHttpContract({
    method: "PUT",
    path: "/api/settings/users/:userId/credit-limit",
    input: z.object({
        userId: z.string().min(1),
        limitMicros: z.number().int().nonnegative(),
    }),
    output: CreditBalanceSchema,
});
export const AdminUserSchema = z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    surname: z.string().nullable(),
    email: z.string().nullable(),
    isAdmin: z.boolean(),
});
export const listAdminUsersContract = defineHttpContract({
    method: "GET",
    path: "/api/settings/users",
    input: z.object({}),
    output: z.array(AdminUserSchema),
});
export const setUserAdminContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/users/:userId",
    input: z.object({ userId: z.string().min(1), isAdmin: z.boolean() }),
    output: AdminUserSchema,
});
export const updateWorkspaceContract = defineHttpContract({
    method: "PATCH",
    path: "/api/settings/workspace",
    input: z.object({ name: z.string().trim().min(1) }),
    output: WorkspaceSchema,
});
export const listConfiguredAiModelsContract = defineHttpContract({
    method: "GET", path: "/api/settings/ai-models/runtime/models",
    input: z.strictObject({}), output: z.array(AiLogicalModelAdminInfoSchema),
});
const ollamaLibraryQuery = {
    providerConnectionId: z.string().min(1), query: z.string().optional(),
    cursor: z.string().optional(), refresh: z.boolean().optional(),
};
export const listOllamaLibraryContract = defineHttpContract({
    method: "GET", path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library",
    input: z.strictObject({ ...ollamaLibraryQuery, kind: z.enum(["all", "local", "cloud", "embedding"]).optional() }),
    output: OllamaLibraryPageSchema,
});
export const listOllamaLibraryVariantsContract = defineHttpContract({
    method: "GET", path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/ollama-library/:familyId/variants",
    input: z.strictObject({ ...ollamaLibraryQuery, familyId: z.string().min(1) }),
    output: OllamaLibraryVariantsPageSchema,
});
export const startOllamaModelPullContract = defineHttpContract({
    method: "POST", path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls",
    input: z.strictObject({
        providerConnectionId: z.string().min(1), requestId: z.string().min(1),
        modelTag: z.string().min(1), catalogRevision: z.string().min(1), logicalModelId: z.string().min(1),
    }),
    output: OllamaModelPullSchema,
});
export const listOllamaModelPullsContract = defineHttpContract({
    method: "GET", path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls",
    input: z.strictObject({ providerConnectionId: z.string().min(1) }), output: z.array(OllamaModelPullSchema),
});
export const cancelOllamaModelPullContract = defineHttpContract({
    method: "POST", path: "/api/settings/ai-models/runtime/providers/:providerConnectionId/model-pulls/:operationId/cancel",
    input: z.strictObject({ providerConnectionId: z.string().min(1), operationId: z.string().min(1) }),
    output: OllamaModelPullSchema,
});
export const systemSettingsHttpContracts = [
    setDefaultAgentContract,
    setAgentLimitsContract,
    updateModuleSettingsContract,
    refreshExtensionsCatalogContract,
    installExtensionContract,
    uninstallExtensionContract,
    enableExtensionContract,
    disableExtensionContract,
    updateExtensionContract,
    setExtensionPositionContract,
    reloadExtensionContract,
    listSourceAppConfigContract,
    deleteSourceAppConfigContract,
    setSourceAppConfigContract,
    createAiProviderContract,
    updateAiProviderContract,
    deleteAiProviderContract,
    createAiModelContract,
    updateAiModelContract,
    deleteAiModelContract,
    enableAiModelContract,
    setDefaultAiModelContract,
    refreshAiModelCatalogContract,
    listConfiguredAiModelsContract,
    listOllamaLibraryContract,
    listOllamaLibraryVariantsContract,
    startOllamaModelPullContract,
    listOllamaModelPullsContract,
    cancelOllamaModelPullContract,
    listAiProviderConnectionsContract,
    listAiProviderSettingsContract,
    saveAiProviderConnectionContract,
    removeAiProviderConnectionContract,
    clearAiProviderCredentialContract,
    testAiProviderConnectionContract,
    listAiModelCatalogSourcesContract,
    listAiModelCatalogCandidatesContract,
    materializeAiModelContract,
    setAiModelPrivateContract,
    setAiModelEnabledContract,
    removeMaterializedAiModelContract,
    setGlobalLanguageModelContract,
    deleteLocalSearchModelContract,
    setUserBillingLimitContract,
    setUserCreditLimitContract,
    listAdminUsersContract,
    setUserAdminContract,
    updateWorkspaceContract,
];
