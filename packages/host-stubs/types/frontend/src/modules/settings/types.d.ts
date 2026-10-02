export type { AiProviderConnectionInfo, AiLogicalModelAdminInfo, AiCatalogCandidateInfo, OllamaLibraryPage, OllamaLibraryFamily, OllamaLibraryVariantsPage, OllamaLibraryVariant, OllamaModelPull, AiModel, AiProvider, CatalogModel, CatalogProvider, ModelCatalogPage as CatalogResponse, ModelDefault, } from "@magnis/sdk/core/ai-model";
import type { rpcContracts } from "@magnis/sdk";
import type { RpcOutputFor } from "@magnis/sdk/rpc/contract";
export interface ContactGroup {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly description: string;
    readonly memory: string;
    readonly member_count: number;
    readonly identityProfileName: string | null;
    readonly created_at: string;
}
export interface Subagent {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly avatar_color: string;
    readonly system_prompt?: string;
    readonly status: "active" | "paused";
    readonly created_at: string;
}
export interface Hook {
    readonly id: string;
    readonly name: string;
    readonly trigger_action: string;
    readonly triggerScope?: string;
    readonly description?: string;
    readonly reviewAgentId?: string;
    readonly onWarning: "block" | "warn" | "log";
    readonly group_ids: readonly string[];
    readonly enabled: boolean;
    readonly created_at: string;
}
export interface IdentityProfile {
    readonly id: string;
    readonly name: string;
    readonly iconColor: string;
    readonly content: string;
    readonly is_default: boolean;
    readonly group_ids: readonly string[];
    readonly groupNames: readonly string[];
    readonly updated_at: string;
    readonly created_at: string;
}
export type SubscriptionStatus = RpcOutputFor<(typeof rpcContracts)["ai_models.subscription_status"]>;
export interface AllowlistEntry {
    readonly id: string;
    readonly action: string;
    readonly target_type: string;
    readonly target_id: string;
    readonly targetLabel?: string;
    readonly access_level: string;
    readonly group_ids: readonly string[];
    readonly hookIds: readonly string[];
    readonly episode_id: string | null;
    readonly created_at: string;
}
export interface AllowlistCheckResult {
    readonly allowed: boolean;
    readonly entry?: AllowlistEntry;
}
export type { EnumOption, ModuleSettingField, ModuleSettingFieldType, ModuleSettingsEntry, ModuleSettingsSchema, ModuleSettingValue, } from "@magnis/sdk";
