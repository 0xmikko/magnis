import type { AvatarColor } from "../shared/types";
import type { AgentMessage as CoreAgentMessage } from "@magnis/agent-core";
export type { ChatMessageAttachment, EntityMention, EntitySearchResult, ChatMessage, ReplyToContext, UIContext, ToolCallEvent, ToolResultEvent, PendingToolCall, CompletedToolResult, ContentBlock, EpisodeState, AskUserOption, AskUserQuestion, AskUserTab, AskUserPayload, EpisodeListItem, EpisodeMessage, LinkedEntitySummary, EpisodeDetailView, AgentMessage, } from "@magnis/agent-core";
export interface AgentChat {
    readonly id: string;
    readonly title: string;
    readonly preview: string;
    readonly time: string;
    readonly activityAt?: string;
    readonly color?: AvatarColor;
    readonly icon?: string;
    readonly status?: string;
}
export interface AgentModuleData {
    readonly listTitle: string;
    readonly searchPlaceholder: string;
    readonly detailSubtitle: string;
    readonly roleLabels: {
        readonly user: string;
        readonly assistant: string;
    };
    readonly composerPlaceholder: string;
    readonly chats: readonly AgentChat[];
    readonly messagesByChat: Readonly<Record<string, readonly CoreAgentMessage[]>>;
    readonly episodes?: readonly AgentChat[];
}
