/**
 * AgentChatStore — plain TypeScript external store for agent chat episodes.
 *
 * Pure TypeScript, no React dependency. Uses AppTransport for transport abstraction.
 */
import { type AppTransport } from "../contracts/transport.ts";
import type { TokenBreakdown } from "../contracts/billing.ts";
import type { ChatMessageAttachment, EpisodeState, ToolCallEvent, ToolResultEvent, UIContext } from "../types/episode.ts";
export type Listener = (state: EpisodeState) => void;
/**
 * Usage frame delivered via `chat.stream` with `stream.type === "usage"`.
 * `cost_micros === null` means the underlying llm_call was spooled (INV-BILL-17)
 * and the live cost is pending replay.
 */
export type UsageEvent = {
    /** Null when metering.start_turn failed and the chat continues ungated. */
    readonly turn_id: string | null;
    readonly episode_id: string | null;
    readonly provider: string;
    readonly model: string;
    readonly cumulative: TokenBreakdown;
    readonly cost_micros: number | null;
    readonly final: boolean;
    readonly step_index: number;
    readonly finish_reason: string | null;
    readonly error: string | null;
    readonly status: "ok" | "error";
};
export type UsageListener = (event: UsageEvent) => void;
/** One item of the episode session todo list (table episode_todo_item). */
export type TodoItem = {
    readonly content: string;
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
};
/** Snapshot emitted on every accepted `episodes.todo.update` tool result. */
export type TodoSnapshot = {
    readonly contextKey: string;
    readonly episodeId: string | null;
    readonly items: readonly TodoItem[];
};
export type TodoListener = (snapshot: TodoSnapshot) => void;
/**
 * INV-6 success predicate: a todo tool result counts as a valid snapshot
 * only when it parses as `{ items: TodoItem[] }` (statuses in enum,
 * contents non-empty strings). MCP error payloads and malformed shapes
 * return null — the caller keeps prior state.
 */
export declare function parseTodoItems(result: unknown): TodoItem[] | null;
export declare class AgentChatStore {
    private readonly states;
    private readonly listeners;
    private readonly activeStreams;
    private readonly uiContexts;
    /** Keys where startNewEpisode was called — skip loadLatestEpisode */
    private readonly freshKeys;
    /** Keys with in-flight episodes.create — prevents second sendMessage from skipping creation */
    private readonly pendingCreates;
    /**
     * Per-context engine selection of the turn currently in flight. A resume
     * after an approval continues THAT turn, so it must reach the same engine,
     * model and module system prompt — rebuilding the params from scratch sent
     * the continuation to whatever `DEFAULT_ENGINE` the backend holds.
     * @tested-by: tst_fe_agentcore_paused_012
     */
    private readonly turnParams;
    /** Global subscribers to live `usage` stream frames (Stage 3) */
    private readonly usageListeners;
    /**
     * Subscribe to live LLM usage frames emitted during `chat.stream`. Listener
     * receives one event per AI-SDK step (not cumulative per turn). Returns an
     * unsubscribe function.
     */
    onUsage(listener: UsageListener): () => void;
    /** Global subscribers to session-todo snapshots (plan agent-todo-context-panel §B.3). */
    private readonly todoListeners;
    /** Latest accepted todo snapshot per contextKey — late subscribers read it. */
    private readonly latestTodos;
    /**
     * Subscribe to live session-todo snapshots. Fires exactly when a
     * successful `episodes.todo.update` tool_result arrives (INV-6).
     * Returns an unsubscribe function.
     */
    onTodo(listener: TodoListener): () => void;
    /** Latest accepted todo snapshot for a context, null before the first one. */
    getTodo(contextKey: string): readonly TodoItem[] | null;
    subscribe(contextKey: string, listener: Listener): () => void;
    getState(contextKey: string): EpisodeState | undefined;
    /**
     * Plan item #7: for entity surfaces, hydrate the latest active/idle episode
     * for the entity via `episodes.list_for_entity(..., statuses=[active, idle], limit=5)`.
     * Ephemeral surfaces (new chat / search) pass `entityId=undefined` and skip.
     */
    loadLatestEpisode(transport: AppTransport, contextKey: string, entityId?: string): Promise<string | null>;
    loadEpisode(transport: AppTransport, contextKey: string, episodeId: string): Promise<string | null>;
    sendMessage(transport: AppTransport, contextKey: string, text: string, context?: UIContext, existingEpisodeId?: string, contextEntityId?: string, attachments?: readonly ChatMessageAttachment[], displayContent?: string, episodeTitle?: string, systemPrompt?: string, engine?: string, model?: string, fileAttachmentIds?: readonly string[]): Promise<void>;
    /** Mark a tool call as approved without re-executing it (for inline-edited tools). */
    markToolCallDone(transport: AppTransport, _contextKey: string, toolCallId: string): void;
    approveToolCall(transport: AppTransport, contextKey: string, toolCallId: string, approved: boolean, argumentsOverride?: unknown): Promise<void>;
    /**
     * Resume the agent stream after an approval decision — but ONLY if the last
     * stream paused for approval (`paused_for_approval`). Used by BOTH approve and
     * deny: on approve the executed result is in the transcript, on deny the
     * "[User denied]" message is — either way the engine (e.g. `codex exec resume`)
     * continues and reacts. No-op when the stream already finished naturally, so it
     * never triggers a redundant re-stream.
     */
    private resumeIfPausedForApproval;
    /** Alias: staging's API shape for loading an episode. */
    loadEpisodeById(transport: AppTransport, contextKey: string, episodeId: string): Promise<void>;
    /** @internal review fix: a context switching episodes must not serve the
     * previous episode's todo snapshot via getTodo. */
    private clearTodoCache;
    startNewEpisode(transport: AppTransport, contextKey: string, presetEpisodeId?: string): Promise<void>;
    stopStream(contextKey: string): void;
    private notify;
    private getOrCreate;
    private streamChat;
    /** @internal — exposed for tests */
    handleEngineResolved(contextKey: string, engine: string): void;
    /** @internal — exposed for tests */
    handleWarning(contextKey: string, code: string, message: string): void;
    private handleDelta;
    /** @internal — exposed for tests. Marks the episode as paused so the
     *  next approveToolCall resumes the stream. Cleared on resume, on the
     *  next sendMessage, or on starting a fresh episode. */
    handlePausedForApproval(contextKey: string): void;
    /** @internal — exposed for tests */
    handleDone(contextKey: string, fullContent: string): void;
    private handleStreamError;
    /** @internal — dispatch a raw `usage` stream chunk to onUsage subscribers. */
    private handleUsage;
    /** @internal — exposed for tests */
    handleToolCall(contextKey: string, event: ToolCallEvent): void;
    /** @internal — exposed for tests */
    handleToolResult(contextKey: string, event: ToolResultEvent): void;
}
export declare function parseUserMessageAttachments(content: string): {
    displayContent: string;
    attachments: ChatMessageAttachment[];
} | null;
