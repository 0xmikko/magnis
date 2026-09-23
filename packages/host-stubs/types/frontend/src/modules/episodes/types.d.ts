import type { AvatarColor } from "../shared/types";
import type { AgentMessage as CoreAgentMessage } from "@magnis/client-core";
export type { AgentFailure, AgentMessage, AskUserOption, AskUserPayload, AskUserQuestion, AskUserTab, ChatMessage, ChatMessageAttachment, CompletedToolResult, ContentBlock, EntityMention, EntitySearchResult, EpisodeState, PendingToolCall, ReplyToContext, ToolCallEvent, ToolResultEvent, UIContext } from "@magnis/client-core";
export type { EpisodeListItem, EpisodeMessage } from "@magnis/sdk";
export interface AgentChat {
    readonly id: string;
    readonly title: string;
    readonly preview: string;
    readonly time: string;
    readonly activityAt?: string;
    readonly color?: AvatarColor;
    readonly icon?: string;
    readonly status?: string;
    /** Separate from `status`, which now survives archiving. */
    readonly isArchived?: boolean;
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
