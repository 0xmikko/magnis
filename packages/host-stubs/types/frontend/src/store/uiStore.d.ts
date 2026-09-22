type ThemeMode = "dark" | "light" | "system";
interface EpisodeFocus {
    readonly rootEpisodeId: string;
    readonly episodeId: string;
}
interface UiState {
    readonly pendingEpisodeFocus: EpisodeFocus | null;
    setPendingEpisodeFocus: (focus: EpisodeFocus | null) => void;
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
