import type { JSX, ReactNode } from "react";
import type { PendingPrompt } from "@magnis/agent-core";
export interface PendingPromptPanelProps {
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
 * Returns null when the queue is empty so the composer sits flush against
 * the feed.
 */
export declare function PendingPromptPanel({ queue, renderPrompt, }: PendingPromptPanelProps): JSX.Element | null;
