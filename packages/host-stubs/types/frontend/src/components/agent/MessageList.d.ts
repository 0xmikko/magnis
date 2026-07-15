import { type ReactNode } from "react";
import type { JSX } from "react";
import { type ResolvedDecision } from "@magnis/agent-core";
import type { ChatMessageAttachment, PendingToolCall, CompletedToolResult, ContentBlock } from "../../modules/episodes/types";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface AgentMessageListProps {
    readonly messages: readonly {
        role: string;
        content: string;
        displayContent?: string;
        attachments?: readonly ChatMessageAttachment[];
    }[];
    readonly streamingContent: string;
    readonly isStreaming: boolean;
    readonly error: string | null;
    readonly contentBlocks: readonly ContentBlock[];
    readonly toolCalls: readonly PendingToolCall[];
    readonly toolResults: readonly CompletedToolResult[];
    readonly onApproveToolCall: (id: string) => void;
    readonly onDenyToolCall: (id: string) => void;
    readonly renderToolCall: (tc: PendingToolCall) => ReactNode;
    readonly scrollRef?: React.Ref<HTMLDivElement>;
    readonly runtime?: AppRuntime;
    /** Background class for sticky user messages (must match parent pane). Defaults to bg-surface-tertiary. */
    readonly stickyBg?: string;
    /** Tool call IDs currently owned by the pending-prompt panel; skipped here. */
    readonly skipToolCallIds?: ReadonlySet<string>;
    /** Resolves a decision for a tool_call; when non-null, DecisionSummary replaces the full renderer. */
    readonly resolveDecision?: (toolCallId: string) => ResolvedDecision | null;
}
export declare function AgentMessageList({ messages, streamingContent, isStreaming, error, contentBlocks, toolCalls, renderToolCall, scrollRef, runtime, stickyBg, skipToolCallIds, resolveDecision, }: AgentMessageListProps): JSX.Element;
