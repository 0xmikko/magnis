export declare const LOCAL_WORKSPACE_ID = "local";
export declare const MANAGED_CLOUD_WORKSPACE_ID = "managed_cloud";
export declare const PRIVATE_WORKSPACE_ID = "private_workspace";
export type WorkspaceAuthMethod = "open" | "google";
export type WorkspaceKind = "local" | "managed_cloud" | "private_preview";
export interface WorkspaceDefinition {
    readonly id: string;
    readonly label: string;
    readonly kind: WorkspaceKind;
    readonly apiBaseUrl: string | null;
    readonly authMethod: WorkspaceAuthMethod | null;
}
interface WorkspaceState {
    readonly ready: boolean;
    readonly workspaces: readonly WorkspaceDefinition[];
    readonly selectedWorkspaceId: string | null;
    initialize: () => Promise<void>;
    selectWorkspace: (workspaceId: string) => Promise<void>;
}
export declare function resolveApiBaseUrl(rawApiUrl: string | undefined, pageUrl: URL): string;
export declare function resolveManagedCloudApiBaseUrl(): string;
export declare const useWorkspaceStore: import("zustand").UseBoundStore<import("zustand").StoreApi<WorkspaceState>>;
export declare function getCurrentWorkspace(): WorkspaceDefinition | null;
export declare function getWorkspaceById(workspaceId: string): WorkspaceDefinition | null;
export declare function getApiBaseUrl(): string;
export declare function getManagedCloudApiBaseUrl(): string;
export {};
