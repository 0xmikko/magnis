import { z } from "zod";
import { TokenBreakdownSchema } from "./token-breakdown.js";
/** Exact controls for one model and execution route. Missing metadata stays unknown. */
export const ReasoningValuesSchema = z.strictObject({
    effort: z.string().min(1).optional(),
    thinking: z.boolean().optional(),
    budgetTokens: z.number().int().nonnegative().optional(),
});
export const ReasoningControlSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("effort"),
        options: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1) })).min(1)
            .refine((options) => new Set(options.map((option) => option.id)).size === options.length, "Effort IDs must be unique"),
    }),
    z.strictObject({
        kind: z.literal("thinking"),
        options: z.array(z.boolean()).min(1)
            .refine((options) => new Set(options).size === options.length, "Thinking options must be unique"),
    }),
    z.strictObject({
        kind: z.literal("budget"), unit: z.literal("tokens"),
        min: z.number().int().nonnegative(), max: z.number().int().nonnegative(),
        step: z.number().int().positive(),
    }).refine((control) => control.max >= control.min, "Budget maximum must not be less than its minimum"),
]);
function reasoningValueIssues(values, controls) {
    const issues = [];
    if (Object.keys(values).length === 0)
        issues.push("Explicit reasoning values must not be empty");
    if (values.effort !== undefined) {
        const control = controls.find((item) => item.kind === "effort");
        if (control?.kind !== "effort" || !control.options.some((option) => option.id === values.effort)) {
            issues.push("Effort is not advertised by this model route");
        }
    }
    if (values.thinking !== undefined) {
        const control = controls.find((item) => item.kind === "thinking");
        if (control?.kind !== "thinking" || !control.options.includes(values.thinking)) {
            issues.push("Thinking value is not advertised by this model route");
        }
    }
    if (values.budgetTokens !== undefined) {
        const control = controls.find((item) => item.kind === "budget");
        if (control?.kind !== "budget" || values.budgetTokens < control.min || values.budgetTokens > control.max
            || (values.budgetTokens - control.min) % control.step !== 0) {
            issues.push("Reasoning budget is outside the advertised range or step");
        }
    }
    return issues;
}
const reasoningContractBase = {
    revision: z.string().min(1),
    canUseProviderDefault: z.boolean(),
};
export const ReasoningCapabilitiesSchema = z.discriminatedUnion("state", [
    z.strictObject({ ...reasoningContractBase, state: z.literal("none") }),
    z.strictObject({ ...reasoningContractBase, state: z.literal("unknown"),
        reason: z.enum(["metadata_unavailable", "unverified_model", "adapter_not_supported"]),
    }),
    z.strictObject({ ...reasoningContractBase, state: z.literal("ready"),
        controls: z.array(ReasoningControlSchema).min(1), defaultValues: ReasoningValuesSchema.nullable(),
    }),
]).superRefine((capabilities, context) => {
    if (capabilities.state !== "ready")
        return;
    if (new Set(capabilities.controls.map((control) => control.kind)).size !== capabilities.controls.length) {
        context.addIssue({ code: "custom", path: ["controls"], message: "Reasoning controls must be unique" });
    }
    if (capabilities.defaultValues !== null) {
        for (const message of reasoningValueIssues(capabilities.defaultValues, capabilities.controls)) {
            context.addIssue({ code: "custom", path: ["defaultValues"], message });
        }
    }
});
export const EpisodeReasoningSelectionSchema = z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("provider_default") }),
    z.strictObject({ mode: z.literal("explicit"), capabilitiesRevision: z.string().min(1),
        values: ReasoningValuesSchema.refine((values) => Object.keys(values).length > 0, "Explicit values must not be empty"),
    }),
]);
/** Shape and model-specific validation shared by UI and execution admission. */
export const ReasoningSelectionWithCapabilitiesSchema = z.strictObject({
    capabilities: ReasoningCapabilitiesSchema,
    selection: EpisodeReasoningSelectionSchema,
}).superRefine(({ capabilities, selection }, context) => {
    if (selection.mode === "provider_default") {
        if (!capabilities.canUseProviderDefault) {
            context.addIssue({ code: "custom", path: ["selection"], message: "This route does not confirm a provider default" });
        }
        return;
    }
    if (capabilities.state !== "ready") {
        context.addIssue({ code: "custom", path: ["selection"], message: "Explicit reasoning requires confirmed model controls" });
        return;
    }
    if (selection.capabilitiesRevision !== capabilities.revision) {
        context.addIssue({ code: "custom", path: ["selection", "capabilitiesRevision"], message: "Reasoning capabilities changed; select the settings again" });
    }
    for (const message of reasoningValueIssues(selection.values, capabilities.controls)) {
        context.addIssue({ code: "custom", path: ["selection", "values"], message });
    }
});
export const AiModelSchema = z.strictObject({
    id: z.string(),
    providerId: z.string(),
    modelId: z.string(),
    name: z.string(),
    capability: z.string(),
    enabled: z.boolean(),
    configJson: z.string().nullable(),
    createdAt: z.string(),
});
export const AiProviderSchema = z.strictObject({
    id: z.string(),
    name: z.string(),
    baseUrl: z.string().nullable(),
    enabled: z.boolean(),
    authKind: z.string(),
    reserved: z.boolean(),
    apiKeySet: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export const ModelDefaultSchema = z.strictObject({
    capability: z.string(),
    modelId: z.string(),
    updatedAt: z.string(),
});
export const CatalogModelSchema = z.strictObject({
    providerId: z.string(),
    modelId: z.string(),
    name: z.string(),
    family: z.string(),
    costInputUsdMtok: z.string().nullable(),
    costOutputUsdMtok: z.string().nullable(),
    costCacheReadUsdMtok: z.string().nullable(),
    costCacheWriteUsdMtok: z.string().nullable(),
    contextLimit: z.number().int().nonnegative().nullable(),
    reasoning: z.boolean(),
    logoUrl: z.string(),
});
/** One model returned by a provider-owned catalog (for example OpenRouter).
 * This is a flat list, distinct from the models.dev catalog page below. */
export const ProviderCatalogModelSchema = z.strictObject({
    modelId: z.string(),
    name: z.string(),
    promptUsdPerToken: z.string().nullable(),
    completionUsdPerToken: z.string().nullable(),
});
export const CatalogProviderSchema = z.strictObject({
    id: z.string(),
    name: z.string(),
    family: z.string(),
    api: z.string().nullable(),
    logoUrl: z.string(),
});
export const ModelCatalogPageSchema = z.strictObject({
    source: z.enum(["bundled", "refreshed"]),
    version: z.string(),
    providers: z.array(CatalogProviderSchema),
    models: z.array(CatalogModelSchema),
});
export const LlmModelInfoSchema = z.strictObject({
    private: z.boolean(),
    id: z.string().min(1),
    displayName: z.string().min(1),
    dataBoundary: z.enum(["device_only", "cloud_allowed"]),
    contextTokens: z.number().int().positive(),
    capabilities: z.strictObject({
        tools: z.boolean(),
        vision: z.boolean(),
        reasoning: z.boolean(),
        structuredOutput: z.boolean(),
    }),
    available: z.boolean(),
    isGlobalDefault: z.boolean(),
    reasoning: ReasoningCapabilitiesSchema.optional(),
    providerConnectionId: z.string().nullable().optional(),
});
export const EmbeddingModelInfoSchema = z.strictObject({
    private: z.boolean(),
    id: z.string().min(1),
    displayName: z.string().min(1),
    dataBoundary: z.enum(["device_only", "cloud_allowed"]),
    dimensions: z.number().int().positive(),
    normalization: z.enum(["none", "l2"]),
    revision: z.string().min(1),
    available: z.boolean(),
});
/** A personal language selection is either one exact logical model or an
 * explicit request to inherit the deployment-wide default. */
export const UserLanguagePreferenceSchema = z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("inherit"), modelId: z.null() }),
    z.strictObject({ mode: z.literal("model"), modelId: z.string().min(1) }),
]);
/** Codex subscription connection state, as the host's auth store reads it
 * and `ai_models.subscription_status` answers it. */
export const CodexAuthStatusSchema = z.strictObject({
    connected: z.boolean(),
    accountId: z.string().nullable().optional(),
});
export const AiProviderAdapterIdSchema = z.enum([
    "anthropic",
    "openai",
    "openai-compatible",
    "ollama",
    "local-fastembed",
]);
export const AiPriceInfoSchema = z.object({
    inputPerMtokMicros: z.number().int().nonnegative(),
    outputPerMtokMicros: z.number().int().nonnegative(),
    cacheReadPerMtokMicros: z.number().int().nonnegative().nullable(),
    cacheWritePerMtokMicros: z.number().int().nonnegative().nullable(),
    cacheWriteOneHourPerMtokMicros: z.number().int().nonnegative().nullable(),
    reasoningPerMtokMicros: z.number().int().nonnegative().nullable(),
});
export const AiLanguageCapabilitiesSchema = z.object({
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    structuredOutput: z.boolean(),
});
/** Redacted administrator view. Credentials are write-only inputs. */
export const AiProviderConnectionInfoSchema = z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    adapterId: AiProviderAdapterIdSchema,
    baseUrl: z.url().nullable(),
    enabled: z.boolean(),
    credentialRequired: z.boolean(),
    configurationRevision: z.string().min(1),
    credentialSet: z.boolean(),
});
/** Settings presentation is separate from runtime provider/model responses. */
export const AiProviderAuthKindSchema = z.enum(["none", "api_key", "native"]);
export const AiProviderOriginSchema = z.enum(["configured", "builtin", "unknown"]);
export const AiProviderProblemSchema = z.strictObject({
    code: z.enum(["unreachable", "invalid_credentials", "permission_denied", "rate_limited", "unavailable", "disabled", "configuration_required"]),
    message: z.string().min(1),
    field: z.enum(["baseUrl", "credential"]).nullable(),
});
export const AiProviderDescriptorSchema = z.strictObject({
    id: z.string().min(1),
    displayName: z.string().min(1),
    adapterId: AiProviderAdapterIdSchema,
    authKind: AiProviderAuthKindSchema,
    endpoint: z.url().nullable(),
    requiresEndpoint: z.boolean(),
});
export const AiSavedProviderSettingsSchema = z.strictObject({
    connection: AiProviderConnectionInfoSchema.extend({ adapterId: z.string().min(1) }).strict(),
    catalogProviderId: z.string().min(1).nullable(),
    origin: AiProviderOriginSchema,
    authKind: AiProviderAuthKindSchema,
    lastSaveRequestId: z.string().min(1).nullable(),
    problem: AiProviderProblemSchema.nullable(),
});
export const AiProviderSettingsSnapshotSchema = z.strictObject({
    connections: z.array(AiSavedProviderSettingsSchema),
    catalog: z.array(AiProviderDescriptorSchema),
}).superRefine((snapshot, context) => {
    const descriptors = new Map();
    for (const [index, descriptor] of snapshot.catalog.entries()) {
        if (descriptors.has(descriptor.id))
            context.addIssue({ code: "custom", path: ["catalog", index, "id"], message: "Duplicate provider descriptor" });
        descriptors.set(descriptor.id, descriptor);
    }
    const connections = new Set();
    for (const [index, saved] of snapshot.connections.entries()) {
        if (connections.has(saved.connection.id))
            context.addIssue({ code: "custom", path: ["connections", index, "connection", "id"], message: "Duplicate saved connection" });
        connections.add(saved.connection.id);
        const descriptor = saved.catalogProviderId === null ? undefined : descriptors.get(saved.catalogProviderId);
        if (descriptor !== undefined && descriptor.adapterId !== saved.connection.adapterId) {
            context.addIssue({ code: "custom", path: ["connections", index, "catalogProviderId"], message: "Connection adapter differs from its provider descriptor" });
        }
        if (saved.authKind === "none" && saved.connection.credentialRequired) {
            context.addIssue({ code: "custom", path: ["connections", index, "authKind"], message: "A keyless connection cannot require credentials" });
        }
    }
});
/** Missing operation preserves legacy save semantics; it never implies verification. */
export const AiProviderConfigurationOperationSchema = z.strictObject({
    catalogProviderId: z.string().min(1).nullable(),
    expectedRevision: z.string().min(1).nullable(),
    requestId: z.string().min(1),
    verification: z.enum(["verify", "configuration_only"]),
});
/** Discovery result. It cannot execute until explicitly materialized. */
export const AiCatalogCandidateInfoSchema = z.object({
    sourceId: z.string().min(1),
    providerConnectionId: z.string().min(1).nullable(),
    adapterId: AiProviderAdapterIdSchema,
    physicalModelId: z.string().min(1),
    displayName: z.string().min(1),
    capability: z.enum(["language", "embedding"]),
    dataBoundary: z.enum(["device_only", "cloud_allowed"]),
    contextTokens: z.number().int().positive().nullable(),
    languageCapabilities: AiLanguageCapabilitiesSchema.nullable(),
    reasoning: ReasoningCapabilitiesSchema.optional(),
    dimensions: z.number().int().positive().nullable(),
    normalization: z.enum(["none", "l2"]).nullable(),
    artifactDigest: z.string().min(1).nullable(),
    price: AiPriceInfoSchema,
});
export const AiLogicalModelAdminInfoSchema = AiCatalogCandidateInfoSchema.omit({ sourceId: true }).extend({
    private: z.boolean(),
    price: AiPriceInfoSchema.nullable(),
    id: z.string().min(1),
    configurationRevision: z.string().min(1),
    enabled: z.boolean(),
    available: z.boolean().optional(),
    unavailableReason: z.string().nullable().optional(),
});
export const AiCallAccountingSchema = z.object({
    modelId: z.string().min(1),
    tokens: TokenBreakdownSchema,
    totalTokens: z.number().int().nonnegative(),
    costMicros: z.number().int().nonnegative(),
    status: z.enum(["complete", "failed", "aborted"]),
});
export const OllamaLibraryFamilySchema = z.strictObject({
    id: z.string().min(1), name: z.string().min(1), description: z.string(),
    badges: z.array(z.string()),
    executionKind: z.enum(["local", "cloud", "mixed", "unknown"]),
    capability: z.enum(["language", "embedding", "unknown"]),
});
const ollamaPageFields = {
    revision: z.string().min(1), fetchedAt: z.string().datetime(), stale: z.boolean(),
    nextCursor: z.string().nullable(), total: z.number().int().nonnegative(),
};
export const OllamaLibraryPageSchema = z.strictObject({
    ...ollamaPageFields, families: z.array(OllamaLibraryFamilySchema),
});
export const OllamaLibraryVariantSchema = z.strictObject({
    modelTag: z.string().min(1), sizeLabel: z.string().nullable(),
    executionKind: z.enum(["local", "cloud", "unknown"]),
    capability: z.enum(["language", "embedding", "unknown"]),
    installationStatus: z.enum(["not_installed", "installed", "added", "unknown"]),
    logicalModelId: z.string().nullable(), operationId: z.string().nullable(),
});
export const OllamaLibraryVariantsPageSchema = z.strictObject({
    ...ollamaPageFields, familyId: z.string().min(1), variants: z.array(OllamaLibraryVariantSchema),
});
export const OllamaModelPullSchema = z.strictObject({
    id: z.string().min(1), requestId: z.string().min(1),
    providerConnectionId: z.string().min(1), providerConfigurationRevision: z.string().min(1),
    catalogRevision: z.string().min(1), modelTag: z.string().min(1), logicalModelId: z.string().min(1),
    phase: z.enum(["preparing", "downloading", "verifying", "adding", "completed", "failed", "cancelled", "interrupted"]),
    layerDigest: z.string().nullable(), completedBytes: z.number().int().nonnegative().nullable(),
    totalBytes: z.number().int().nonnegative().nullable(),
    installed: z.boolean(), added: z.boolean(),
    error: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
