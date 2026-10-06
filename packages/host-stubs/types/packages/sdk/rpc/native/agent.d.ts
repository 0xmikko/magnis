import { z } from "zod";
export declare const agentContracts: {
    readonly "agent.implementations": import("../contract.js").RpcContract<"agent.implementations", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        implementations: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
            displayName: z.ZodString;
            nativeSession: z.ZodBoolean;
            usesLlmRuntime: z.ZodBoolean;
            available: z.ZodOptional<z.ZodBoolean>;
            unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>>;
        defaultImplementationId: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
    }, z.core.$strict>, "required">;
    readonly "agent.limits.get": import("../contract.js").RpcContract<"agent.limits.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        maxSteps: z.ZodNumber;
    }, z.core.$strict>, "required">;
    readonly "agent.models.list": import("../contract.js").RpcContract<"agent.models.list", z.ZodObject<{
        implementationId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        implementationId: z.ZodString;
        models: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            modelId: z.ZodString;
            name: z.ZodString;
            providerConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            providerDisplayName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            dataBoundary: z.ZodOptional<z.ZodEnum<{
                device_only: "device_only";
                cloud_allowed: "cloud_allowed";
            }>>;
            available: z.ZodOptional<z.ZodBoolean>;
            unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            isDefault: z.ZodOptional<z.ZodBoolean>;
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
        }, z.core.$strict>>;
        available: z.ZodOptional<z.ZodBoolean>;
        unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=agent.d.ts.map