import type { AppTransport } from "../contracts/transport.ts";
import type { ChatMessageAttachment, EpisodeState, UIContext } from "../types/episode.ts";
export type Listener = (state: EpisodeState) => void;
export type TodoItem = {
    readonly content: string;
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
};
export type TodoSnapshot = {
    readonly contextKey: string;
    readonly episodeId: string | null;
    readonly items: readonly TodoItem[];
};
export type TodoListener = (snapshot: TodoSnapshot) => void;
/** Only an explicit non-retryable server refusal proves no mutation was admitted. */
export declare function isDefinitiveEpisodeMutationRejection(error: unknown): boolean;
export declare function parseTodoItems(result: unknown): TodoItem[] | null;
export declare function parseUserMessageAttachments(content: string): {
    displayContent: string;
    attachments: ChatMessageAttachment[];
} | null;
export declare function createEmptyEpisodeState(episodeId?: string | null): EpisodeState;
export declare class AgentChatStore {
    private readonly transport;
    private readonly states;
    private readonly listeners;
    private readonly episodeSubscriptions;
    private readonly episodeRefreshes;
    private readonly hydrationGenerations;
    private readonly todoListeners;
    private readonly latestTodos;
    private readonly pendingAppends;
    private readonly pendingResolutions;
    constructor(transport: AppTransport);
    subscribe(contextKey: string, listener: Listener): () => void;
    getState(contextKey: string): EpisodeState | undefined;
    onTodo(listener: TodoListener): () => void;
    getTodo(contextKey: string): readonly TodoItem[] | null;
    loadLatestEpisode(contextKey: string, entityId?: string): Promise<string | null>;
    loadEpisode(contextKey: string, episodeId: string): Promise<string>;
    loadEpisodeById(contextKey: string, episodeId: string): Promise<void>;
    sendMessage(contextKey: string, text: string, _context?: UIContext, existingEpisodeId?: string, _contextEntityId?: string, attachments?: readonly ChatMessageAttachment[], _displayContent?: string, episodeTitle?: string, fileAttachmentIds?: readonly string[]): Promise<void>;
    private appendMessage;
    answerAskUser(contextKey: string, toolCallId: string, answer: string): Promise<void>;
    approveToolCall(contextKey: string, toolCallId: string, approved: boolean, argumentsOverride?: unknown): Promise<void>;
    private resolveWait;
    private submitWaitResolution;
    markToolCallDone(contextKey: string, toolCallId: string): void;
    startNewEpisode(contextKey: string, presetEpisodeId?: string): Promise<void>;
    stopStream(contextKey: string): Promise<void>;
    private reduceSnapshot;
    private subscribeEpisodeChanges;
    private requestEpisodeRefresh;
    private drainEpisodeRefresh;
    private beginHydration;
    private isCurrentHydration;
    private notify;
}
