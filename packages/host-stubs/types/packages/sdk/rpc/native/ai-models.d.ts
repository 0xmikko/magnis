import { z } from "zod";
export declare const aiModelLanguageDirectoryContract: import("../contract.js").RpcContract<"ai_models.directory.language.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>, "required">;
export declare const aiModelEmbeddingDirectoryContract: import("../contract.js").RpcContract<"ai_models.directory.embedding.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>, "required">;
export declare const aiModelGlobalLanguageDefaultContract: import("../contract.js").RpcContract<"ai_models.directory.language_default.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    modelId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, "required">;
export declare const aiModelLanguagePreferenceGetContract: import("../contract.js").RpcContract<"ai_models.preferences.language.get", z.ZodObject<{}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"inherit">;
    modelId: z.ZodNull;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"model">;
    modelId: z.ZodString;
}, z.core.$strip>], "mode">, "required">;
export declare const aiModelLanguagePreferenceSetContract: import("../contract.js").RpcContract<"ai_models.preferences.language.set", z.ZodObject<{
    modelId: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"inherit">;
    modelId: z.ZodNull;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"model">;
    modelId: z.ZodString;
}, z.core.$strip>], "mode">, "required">;
//# sourceMappingURL=ai-models.d.ts.map