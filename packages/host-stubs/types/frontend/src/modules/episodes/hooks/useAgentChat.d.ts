/**
 * useAgentChat — consumer hook for agent chat episodes.
 *
 * Subscribes to runtime.agent.chat store for a given contextKey
 * and exposes action callbacks.
 */
import type { ChatMessageAttachment, EpisodeState, UIContext } from "../types";
export interface UseAgentChatResult {
    readonly messages: EpisodeState["messages"];
    readonly streamingContent: string;
    readonly isStreaming: boolean;
    readonly toolCalls: EpisodeState["toolCalls"];
    readonly toolResults: EpisodeState["toolResults"];
    readonly contentBlocks: EpisodeState["contentBlocks"];
    readonly error: string | null;
    readonly episodeId: string | null;
    readonly episodeTitle: string | null;
    readonly replyTo: EpisodeState["replyTo"];
    readonly sendMessage: (text: string, context?: UIContext, attachments?: readonly ChatMessageAttachment[], episodeTitle?: string, systemPrompt?: string, engine?: string, model?: string) => void;
    readonly stopStream: () => void;
    readonly approveToolCall: (toolCallId: string, argumentsOverride?: unknown) => Promise<void>;
    readonly denyToolCall: (toolCallId: string) => Promise<void>;
    readonly startNewEpisode: () => void;
}
export declare function useAgentChat(contextKey: string, contextEntityId?: string, explicitEpisodeId?: string): UseAgentChatResult;
