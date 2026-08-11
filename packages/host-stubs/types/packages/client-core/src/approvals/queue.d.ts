import type { EpisodeState, PendingPrompt, PendingToolCall } from "../types/episode.ts";
/** Subset of EpisodeState required by the approval helpers. */
export type ApprovalReadState = Pick<EpisodeState, "toolCalls" | "messages" | "contentBlocks" | "toolResults">;
export declare const ASK_USER_MARKER_PREFIX = "[User selected from ask_user options]";
export declare const ASK_USER_MARKER_CLOSER = "[Proceed with the selected option \u2014 do NOT ask again]";
/**
 * Tool names that request a structured ask_user answer. Shared between the
 * queue selector, the decision summary, and any render path that needs to
 * classify a tool call.
 */
export declare const ASK_USER_TOOL_NAMES: ReadonlySet<string>;
export declare function isAskUserName(name: string): boolean;
/**
 * Wrap free-form composer text as an ask_user answer that the agent will
 * recognize (same marker format as AskUserCard emits). Used by the web and
 * CLI composer-fallthrough paths so typed text is interchangeable with
 * card-submitted answers from the agent's perspective.
 */
export declare function wrapAskUserAnswer(text: string): string;
/**
 * Build a FIFO pairing of ask_user `tool_call` IDs to their answering
 * `[User selected from ask_user options]` marker text, walking through the
 * persisted `contentBlocks` in order. Later ask_user prompts pair with
 * later marker messages so interleaved conversations resolve correctly.
 *
 * Returns a map keyed by ask_user toolCallId → marker-wrapped answer text.
 */
export declare function buildAskUserPairings(state: ApprovalReadState): Map<string, string>;
export interface PendingPromptQueueOptions {
    readonly archived?: boolean;
    readonly submittedAskUser?: ReadonlySet<string>;
    /**
     * Predicate that tells the selector whether a pending tool call has a
     * frontend-side module renderer (e.g. ContactCreateRenderer,
     * EmailBatchSendRenderer). Those tools are actionable even without a
     * backend-emitted approvalId — the module renderer supplies its own
     * Approve/Deny/Edit UI. Agent-core stays renderer-agnostic: the frontend
     * passes `runtime.agent.resolveHistoryRenderer(...)` wrapped into a bool
     * and the CLI leaves this undefined.
     */
    readonly hasRenderer?: (toolCall: PendingToolCall) => boolean;
}
/**
 * Derive the queue of pending prompts that require user attention from the
 * full episode state. Ports the supersede + answered-ask_user inference
 * from AgentPanel.tsx so both the web PendingPromptPanel and the CLI share
 * the same filtering rules.
 *
 * - Skips non-pending and internal tool calls (set_title / append_message).
 * - Skips superseded calls — a pending call is superseded when a later
 *   pending call with the same tool name exists.
 * - Skips archived episodes entirely.
 * - Skips ask_user prompts already answered via either the optimistic
 *   `submittedAskUser` set or a per-id pairing against a persisted
 *   `user_message` block carrying the ask_user marker.
 * - Returns actionable approvals/module cards before ask_user prompts, while
 *   preserving original order inside each priority group.
 */
export declare function selectPendingPromptQueue(state: ApprovalReadState, opts: PendingPromptQueueOptions): PendingPrompt[];
/**
 * Compute the set of tool_call IDs that are pending AND superseded
 * (another later pending call with the same name exists). Used by the feed
 * renderer to collapse stale prompts into a compact superseded placeholder.
 */
export declare function selectSupersededToolCallIds(state: ApprovalReadState): Set<string>;
