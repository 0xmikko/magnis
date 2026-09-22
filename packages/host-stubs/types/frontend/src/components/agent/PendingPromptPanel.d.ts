import type { JSX, ReactNode } from "react";
import type { PendingPrompt } from "@magnis/client-core";
export interface PendingPromptPanelProps {
    readonly loadMoreDelegations?: () => void;
    readonly loadingDelegations?: boolean;
    readonly delegationError?: string;
    readonly delegationsOpen?: boolean;
    readonly delegations?: readonly {
        readonly childEpisodeId: string;
        readonly title: string;
    }[];
    readonly onFocusDelegation?: (episodeId: string) => void;
    /** Full queue of pending prompts (head shown, rest counted). */
    readonly queue: readonly PendingPrompt[];
    /** Renderer delegated to the existing AgentPanel render pipeline. */
    readonly renderPrompt: (prompt: PendingPrompt) => ReactNode;
}
/**
 * Pinned panel rendered above the docked composer. Shows the head of the
 * pending-prompt queue and a subtle `N of M` counter when more prompts are
 * queued behind it. Rendering delegates to the caller so module-specific
 * renderers (ContactCreate, EmailBatchSend, etc.) keep their full UI.
 *
 * The same pinned slot also hosts the explicitly opened running-helper list.
 * Returns null when neither prompt nor helper list is visible.
 */
export declare function PendingPromptPanel({ queue, renderPrompt, delegationsOpen, delegations, onFocusDelegation, loadMoreDelegations, loadingDelegations, delegationError, }: PendingPromptPanelProps): JSX.Element | null;
