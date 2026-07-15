import type { AppTransport } from "./transport.ts";
import type { ReplyToContext, ChatMessageAttachment } from "../types/episode.ts";
export interface AgentContextDescriptor {
    readonly moduleId: string;
    readonly entityId?: string;
    readonly entityTitle?: string;
    readonly chatId?: string;
    readonly chatTitle?: string;
    readonly extras?: Readonly<Record<string, unknown>>;
}
export interface AgentInvocationInput {
    readonly contextKey: string;
    readonly text: string;
    readonly context?: AgentContextDescriptor;
    readonly contextEntityId?: string;
}
export interface AgentDraftRequest {
    readonly targetModuleId: string;
    readonly payload: unknown;
}
export interface AgentHistoryBlock {
    readonly id: string;
    readonly kind: "text" | "thinking" | "tool_call" | "tool_result" | "module_block";
    readonly toolName?: string;
    readonly moduleIdHint?: string;
    readonly payload: unknown;
}
export interface AgentTodoItem {
    readonly id: string;
    readonly kind: string;
    readonly moduleId: string;
    readonly payload: unknown;
}
export interface AllowlistTarget {
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly targetLabel?: string;
}
export interface AgentContextAction {
    readonly id: string;
    readonly label: string;
    readonly run: (input: {
        transport: AppTransport;
        context: AgentContextDescriptor;
        payload?: unknown;
    }) => void | Promise<void>;
}
export interface AgentRuntimeState {
    readonly activeContext: AgentContextDescriptor | null;
    readonly replyTo: ReplyToContext | null;
    readonly isStreaming: boolean;
    readonly pendingApprovals: readonly string[];
}
export interface AgentChatStoreApi {
    readonly subscribe: (contextKey: string, listener: (state: unknown) => void) => () => void;
    readonly getState: (contextKey: string) => unknown | undefined;
    readonly loadLatestEpisode: (contextKey: string, entityId?: string) => Promise<string | null>;
    readonly loadEpisodeById: (contextKey: string, episodeId: string) => Promise<void>;
    readonly sendMessage: (contextKey: string, text: string, context?: unknown, existingEpisodeId?: string, contextEntityId?: string, attachments?: readonly ChatMessageAttachment[], displayContent?: string, episodeTitle?: string, systemPrompt?: string, engine?: string, model?: string) => Promise<void>;
    readonly approveToolCall: (contextKey: string, toolCallId: string, approved: boolean, argumentsOverride?: unknown) => Promise<void>;
    readonly markToolCallDone: (contextKey: string, toolCallId: string) => void;
    readonly startNewEpisode: (contextKey: string, presetEpisodeId?: string) => Promise<void>;
    readonly stopStream: (contextKey: string) => void;
}
