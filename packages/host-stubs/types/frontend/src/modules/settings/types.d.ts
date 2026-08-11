export interface ContactGroup {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly description: string;
    readonly memory: string;
    readonly member_count: number;
    readonly identity_profile_name: string | null;
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
    readonly trigger_scope?: string;
    readonly description?: string;
    readonly review_agent_id?: string;
    readonly on_warning: "block" | "warn" | "log";
    readonly group_ids: readonly string[];
    readonly enabled: boolean;
    readonly created_at: string;
}
export interface IdentityProfile {
    readonly id: string;
    readonly name: string;
    readonly icon_color: string;
    readonly content: string;
    readonly is_default: boolean;
    readonly group_ids: readonly string[];
    readonly group_names: readonly string[];
    readonly updated_at: string;
    readonly created_at: string;
}
export interface AiProvider {
    readonly id: string;
    readonly name: string;
    readonly base_url: string | null;
    readonly enabled: boolean;
    readonly auth_kind: "api_key" | "codex_subscription";
    readonly reserved: boolean;
    /** INV-CAT-2a: the key value never crosses the wire — write-only. */
    readonly api_key_set: boolean;
    readonly created_at: string;
    readonly updated_at: string;
}
/** A provider in the models.dev catalog (`ai_models.catalog_models`). */
export interface CatalogProvider {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly api?: string | null;
    readonly logo_url: string;
}
/**
 * One agent-usable model from the models.dev catalog
 * (`ai_models.catalog_models`, INV-MA-1). Costs are USD per 1M tokens as
 * decimal strings ("3", "0.6", …); display as "$in / $out".
 */
export interface CatalogModel {
    readonly provider_id: string;
    readonly model_id: string;
    readonly name: string;
    readonly family: string;
    readonly cost_input_usd_mtok?: string | null;
    readonly cost_output_usd_mtok?: string | null;
    readonly cost_cache_read_usd_mtok?: string | null;
    readonly cost_cache_write_usd_mtok?: string | null;
    readonly context_limit?: number | null;
    readonly reasoning: boolean;
    readonly logo_url: string;
}
/** Response of `ai_models.catalog_models` (INV-MA-1/2). */
export interface CatalogResponse {
    readonly source: "bundled" | "refreshed";
    readonly version: string;
    readonly providers: readonly CatalogProvider[];
    readonly models: readonly CatalogModel[];
}
/** `ai_models.subscription_status` (INV-CAT-9). Tokens never appear here. */
export interface SubscriptionStatus {
    readonly connected: boolean;
    readonly account_id?: string | null;
}
export interface AiModel {
    readonly id: string;
    readonly provider_id: string;
    readonly model_id: string;
    readonly name: string;
    readonly capability: "embedding" | "reasoning" | "chat";
    readonly enabled: boolean;
    readonly config_json?: string;
    readonly created_at: string;
}
export interface ModelDefault {
    readonly capability: string;
    readonly model_id: string;
    readonly updated_at: string;
}
export interface AllowlistEntry {
    readonly id: string;
    readonly action: string;
    readonly target_type: string;
    readonly target_id: string;
    readonly target_label?: string;
    readonly access_level: string;
    readonly group_ids: readonly string[];
    readonly hook_ids: readonly string[];
    readonly episode_id: string | null;
    readonly created_at: string;
}
export interface AllowlistCheckResult {
    readonly allowed: boolean;
    readonly entry?: AllowlistEntry;
}
export interface SourceAuthConfig {
    readonly source_id: string;
    readonly config: {
        readonly type: "oauth2" | "phone_code" | "api_key";
        readonly client_id?: string;
        readonly client_secret?: string;
        readonly auth_url?: string;
        readonly token_url?: string;
        readonly scopes?: string;
        readonly steps?: readonly string[];
    };
}
export interface SourceListResponse {
    readonly sources: readonly {
        readonly source_id: string;
        readonly display_name: string;
        readonly surfaces: readonly string[];
        readonly auth_type: string;
        /** INV-ST-10: false when the source cannot start (missing a required
         *  operator app-cred). The connect catalog shows ONLY connectable ones. */
        readonly connectable: boolean;
        /** The signal: why it can't start (null when connectable). */
        readonly unavailable_reason: string | null;
    }[];
}
export interface EnumOption {
    readonly value: string;
    readonly label: string;
    readonly description: string | null;
}
export type ModuleSettingFieldType = {
    readonly type: "number";
    readonly min: number | null;
    readonly max: number | null;
} | {
    readonly type: "string";
    readonly max_length: number | null;
} | {
    readonly type: "boolean";
} | {
    readonly type: "enum";
    readonly options: readonly EnumOption[];
};
export interface ModuleSettingField {
    readonly key: string;
    readonly label: string;
    readonly description: string | null;
    readonly field_type: ModuleSettingFieldType;
    readonly default_value: string;
    readonly confirmation_message: string | null;
}
export interface ModuleSettingsSchema {
    readonly module_id: string;
    readonly label: string;
    readonly description: string | null;
    readonly fields: readonly ModuleSettingField[];
}
export interface ModuleSettingValue {
    readonly key: string;
    readonly value: string;
}
export interface ModuleSettingsEntry {
    readonly module_id: string;
    readonly label: string;
    readonly schema: ModuleSettingsSchema | null;
    readonly values: readonly ModuleSettingValue[];
}
