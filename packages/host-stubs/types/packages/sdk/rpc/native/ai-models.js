import { z } from "zod";
import { AiModelSchema, AiProviderSchema, CodexAuthStatusSchema, EmbeddingModelInfoSchema, LlmModelInfoSchema, ModelCatalogPageSchema, ModelDefaultSchema, ProviderCatalogModelSchema, UserLanguagePreferenceSchema, } from "../../core/ai-model.js";
import { defineRpcContract } from "../contract.js";
export const aiModelLanguageDirectoryContract = defineRpcContract({
    method: "ai_models.directory.language.list",
    input: z.object({}),
    output: z.array(LlmModelInfoSchema),
});
export const aiModelEmbeddingDirectoryContract = defineRpcContract({
    method: "ai_models.directory.embedding.list",
    input: z.object({}),
    output: z.array(EmbeddingModelInfoSchema),
});
export const aiModelGlobalLanguageDefaultContract = defineRpcContract({
    method: "ai_models.directory.language_default.get",
    input: z.object({}),
    output: z.strictObject({ modelId: z.string().min(1).nullable() }),
});
export const aiModelLanguagePreferenceGetContract = defineRpcContract({
    method: "ai_models.preferences.language.get",
    input: z.object({}),
    output: UserLanguagePreferenceSchema,
});
export const aiModelLanguagePreferenceSetContract = defineRpcContract({
    method: "ai_models.preferences.language.set",
    input: z.object({ modelId: z.string().min(1).nullable() }),
    output: UserLanguagePreferenceSchema,
});
export const aiModelsContracts = {
    "ai_models.catalog": defineRpcContract({
        method: "ai_models.catalog",
        input: z.object({ providerId: z.string().min(1) }),
        output: z.array(ProviderCatalogModelSchema),
    }),
    "ai_models.catalog_models": defineRpcContract({
        method: "ai_models.catalog_models",
        input: z.object({ search: z.string().optional() }),
        output: ModelCatalogPageSchema,
    }),
    "ai_models.get_defaults": defineRpcContract({
        method: "ai_models.get_defaults",
        input: z.object({}),
        output: z.array(ModelDefaultSchema),
    }),
    "ai_models.list_models": defineRpcContract({
        method: "ai_models.list_models",
        input: z.object({ capability: z.string().optional() }),
        output: z.array(AiModelSchema),
    }),
    "ai_models.list_providers": defineRpcContract({
        method: "ai_models.list_providers",
        input: z.object({}),
        output: z.array(AiProviderSchema),
    }),
    "ai_models.subscription_status": defineRpcContract({
        method: "ai_models.subscription_status",
        input: z.object({}),
        output: CodexAuthStatusSchema,
    }),
    "ai_models.directory.language.list": aiModelLanguageDirectoryContract,
    "ai_models.directory.embedding.list": aiModelEmbeddingDirectoryContract,
    "ai_models.directory.language_default.get": aiModelGlobalLanguageDefaultContract,
    "ai_models.preferences.language.get": aiModelLanguagePreferenceGetContract,
    "ai_models.preferences.language.set": aiModelLanguagePreferenceSetContract,
};
