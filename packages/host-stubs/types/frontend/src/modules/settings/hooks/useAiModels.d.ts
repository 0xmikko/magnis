import type { AiProvider, AiModel, CatalogResponse, ModelDefault, SubscriptionStatus } from "../types";
export interface CreateProviderInput {
    readonly id?: string;
    readonly name: string;
    readonly base_url: string;
    readonly api_key?: string;
}
/**
 * INV-MA-5: "Add Provider" branches on presence in `list_providers` —
 * a seeded/known provider is updated in place, a new custom OpenAI-compatible
 * one is created (base_url required).
 */
export interface ConnectProviderInput {
    readonly id: string;
    readonly name: string;
    readonly base_url: string;
    readonly api_key?: string;
}
/** INV-MA-3: enable a catalog model = materialize an enabled chat row. */
export interface EnableModelInput {
    readonly provider_id: string;
    readonly model_id: string;
}
/** Manual model creation for non-catalog providers (Codex subscription). */
export interface CreateModelInput {
    readonly provider_id: string;
    readonly model_id: string;
    readonly name: string;
    readonly capability?: "chat" | "reasoning" | "embedding";
}
export interface UseAiModelsResult {
    readonly providers: readonly AiProvider[];
    readonly models: readonly AiModel[];
    readonly defaults: readonly ModelDefault[];
    readonly loading: boolean;
    /** Set when the mount load RPCs fail; providers/models are left as-is. */
    readonly loadError: string | null;
    readonly updateProvider: (id: string, updates: {
        api_key?: string;
        base_url?: string;
        enabled?: boolean;
    }) => Promise<void>;
    readonly createProvider: (data: CreateProviderInput) => Promise<AiProvider>;
    /** INV-MA-5: connect a provider — update if it already exists, else create. */
    readonly connectProvider: (data: ConnectProviderInput) => Promise<AiProvider>;
    readonly deleteProvider: (id: string) => Promise<void>;
    /** INV-MA-3: enable a catalog model (materialize + seed price), append it. */
    readonly enableModel: (data: EnableModelInput) => Promise<AiModel>;
    /** Manually create a model for a provider not in the models.dev catalog
     *  (e.g. the Codex subscription: model IDs are account-specific). */
    readonly createModel: (data: CreateModelInput) => Promise<AiModel>;
    readonly deleteModel: (id: string) => Promise<void>;
    readonly updateModel: (id: string, updates: {
        enabled?: boolean;
        config_json?: string;
    }) => Promise<void>;
    readonly setDefault: (capability: string, modelId: string) => Promise<void>;
    /** INV-MA-1: search the flat models.dev catalog for the model picker. */
    readonly catalogModels: (search: string) => Promise<CatalogResponse>;
    /** INV-CAT-9: loaded lazily by the subscription card, not on mount. */
    readonly subscriptionStatus: SubscriptionStatus | null;
    readonly subscriptionStatusError: string | null;
    readonly loadSubscriptionStatus: () => Promise<void>;
    readonly reload: () => Promise<void>;
}
export declare function useAiModels(): UseAiModelsResult;
