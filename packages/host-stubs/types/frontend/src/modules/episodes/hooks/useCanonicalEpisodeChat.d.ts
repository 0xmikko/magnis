import type { ChatMessageAttachment, EpisodeState, UIContext } from "../types";
export interface UseAgentChatResult {
    readonly messages: EpisodeState["messages"];
    readonly streamingContent: string;
    readonly isStreaming: boolean;
    readonly canStop: boolean;
    readonly toolCalls: EpisodeState["toolCalls"];
    readonly toolResults: EpisodeState["toolResults"];
    readonly contentBlocks: EpisodeState["contentBlocks"];
    readonly error: EpisodeState["error"];
    readonly commandError: string | null;
    readonly episodeId: string | null;
    readonly episodeTitle: string | null;
    readonly replyTo: EpisodeState["replyTo"];
    readonly sendMessage: (text: string, context?: UIContext, attachments?: readonly ChatMessageAttachment[], episodeTitle?: string) => void;
    readonly stopStream: () => void;
    readonly approveToolCall: (toolCallId: string, argumentsOverride?: unknown) => Promise<void>;
    readonly denyToolCall: (toolCallId: string) => Promise<void>;
    readonly startNewEpisode: () => void;
}
/** Episode-module controller backed only by the canonical retained resource. */
export declare function useCanonicalEpisodeChat(_contextKey: string, contextEntityId?: string, explicitEpisodeId?: string): UseAgentChatResult;
