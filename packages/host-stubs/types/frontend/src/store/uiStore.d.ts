type ThemeMode = "dark" | "light" | "system";
interface UiState {
    readonly agentPanelVisible: boolean;
    readonly statusBarVisible: boolean;
    readonly backendReady: boolean;
    readonly pendingAgentQuery: string | null;
    readonly pendingAgentMentionIds: readonly string[];
    readonly theme: ThemeMode;
    toggleAgentPanel: () => void;
    toggleStatusBar: () => void;
    setBackendReady: (ready: boolean) => void;
    setPendingAgentQuery: (query: string | null) => void;
    setPendingAgentMentionIds: (ids: readonly string[]) => void;
    setTheme: (theme: ThemeMode) => void;
}
export declare const useUiStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UiState>>;
export {};
