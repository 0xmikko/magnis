export interface IntegrationsStatus {
    readonly telegram: {
        readonly configured: boolean;
        readonly authorized: boolean;
    };
    readonly google: {
        readonly configured: boolean;
        readonly connected: boolean;
    };
}
export interface SyncSurfaceStatus {
    readonly surface: string;
    readonly phase: string | null;
    readonly status: string;
    readonly last_sync_at: string | null;
    readonly last_error: string | null;
    readonly next_retry_at: string | null;
}
export interface SourceAccount {
    readonly source_id: string;
    readonly account_id: string;
    readonly surfaces: readonly string[];
    readonly status: string;
    readonly sync?: readonly SyncSurfaceStatus[];
}
export interface SourceListResponse {
    readonly sources: readonly {
        readonly source_id: string;
        readonly display_name: string;
        readonly surfaces: readonly string[];
        readonly auth_type: string;
    }[];
}
export interface SourceAccountsListResponse {
    readonly accounts: readonly SourceAccount[];
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
