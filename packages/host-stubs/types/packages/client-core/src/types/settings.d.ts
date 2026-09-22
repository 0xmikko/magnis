export interface SyncSurfaceStatus {
    readonly surface: string;
    readonly phase: string | null;
    readonly status: string;
    readonly lastSyncAt: string | null;
    readonly lastError: string | null;
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
export type { EnumOption, ModuleSettingField, ModuleSettingFieldType, ModuleSettingsEntry, ModuleSettingsSchema, ModuleSettingValue, } from "@magnis/sdk";
