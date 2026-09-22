import type { JSX } from "react";
export interface AgentPanelProps {
    readonly moduleName: string;
    readonly forceDraft?: boolean;
    readonly onEpisodeCreated?: (episodeId: string) => void;
    readonly conversationKey?: string;
    readonly selectedItemId?: string;
    readonly selectedItemTitle?: string;
    readonly selectedChatId?: string;
    readonly selectedChatName?: string;
    readonly contextTitle?: string;
    /** When true, all pending tool calls are rendered as superseded (no Send buttons). */
    readonly archived?: boolean;
    /**
     * When set, this episode is loaded directly by id on first mount instead of
     * going through `list_for_entity`. Required when the caller already knows
     * which episode to display (e.g. Episodes module, where the URL carries the
     * episode UUID and the episode may not link to any target entity).
     */
    readonly presetEpisodeId?: string;
}
export declare function AgentPanel(props: AgentPanelProps): JSX.Element;
