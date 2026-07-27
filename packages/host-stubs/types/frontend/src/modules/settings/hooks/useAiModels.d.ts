import type { AiProvider, AiModel, ModelDefault } from "../types";
interface UseAiModelsResult {
    readonly providers: readonly AiProvider[];
    readonly models: readonly AiModel[];
    readonly defaults: readonly ModelDefault[];
    readonly loading: boolean;
    readonly updateProvider: (id: string, updates: {
        api_key?: string;
        base_url?: string;
        enabled?: boolean;
    }) => Promise<void>;
    readonly updateModel: (id: string, updates: {
        enabled?: boolean;
        config_json?: string;
    }) => Promise<void>;
    readonly setDefault: (capability: string, modelId: string) => Promise<void>;
    readonly reload: () => Promise<void>;
}
export declare function useAiModels(): UseAiModelsResult;
export {};
