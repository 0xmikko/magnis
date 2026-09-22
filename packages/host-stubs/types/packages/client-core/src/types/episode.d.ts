import type { ContentBlock as SdkContentBlock, EpisodeAgentBinding, EpisodeAgentState, EpisodeExecutionError, EpisodeWorkingMemory, PendingToolCall as SdkPendingToolCall, ToolCallEvent as SdkToolCallEvent, ToolResultEvent as SdkToolResultEvent } from "@magnis/sdk";
/**
 * Attachment payload rendered alongside a chat message. For entities created
 * or updated by a tool call, `data` may carry a tool-kind envelope
 * (`kind: "created"` with `fields`, or `kind: "updated"` with `changed`).
 * Legacy attachments with no `kind` are passed through as flat entity data.
 */
export interface ChatMessageAttachment {
    readonly schemaId: string;
    readonly data: {
        readonly id: string;
        readonly kind?: "created" | "updated";
        readonly fields?: Readonly<Record<string, unknown>>;
        readonly changed?: Readonly<Record<string, {
            readonly before: unknown;
            readonly after: unknown;
        }>>;
        readonly [key: string]: unknown;
    };
}
export interface EntityMention {
    readonly id: string;
    readonly name: string;
    readonly schemaId: string;
}
export interface EntitySearchResult {
    readonly id: string;
    readonly name: string | null;
    readonly schema_id: string;
}
export interface ChatMessage {
    readonly role: "user" | "assistant";
    readonly content: string;
    readonly displayContent?: string;
    readonly attachments?: readonly ChatMessageAttachment[];
    /** File-entity UUIDs admitted with the durable Episode input. Distinct from
     * `attachments` above (entity mentions), which fold into `content`. */
    readonly fileAttachmentIds?: readonly string[];
}
export interface ReplyToContext {
    readonly entityId: string;
    readonly schemaId: string;
    readonly name: string;
    readonly data: Readonly<Record<string, unknown>>;
}
export interface UIContext {
    readonly activeModule?: string;
    readonly selectedEntityId?: string;
    readonly selectedEntityName?: string;
    readonly selectedChatId?: string;
    readonly selectedChatName?: string;
    readonly replyToEntityId?: string;
}
/** Canonical SDK-owned tool and transcript contracts. */
export type ToolCallEvent = SdkToolCallEvent;
export type ToolResultEvent = SdkToolResultEvent;
export type PendingToolCall = SdkPendingToolCall;
export type CompletedToolResult = SdkToolResultEvent & {
    readonly name: string;
};
export type ContentBlock = SdkContentBlock;
export type AgentFailure = (EpisodeExecutionError & {
    readonly kind: "execution";
}) | {
    readonly kind: "credit_exhausted";
    readonly code: 402;
    readonly retryable: false;
} | {
    readonly kind: "provider";
    readonly code: 429 | 503;
    readonly providerKind: string;
    readonly retryable: boolean;
    readonly displayMessage: string;
} | {
    readonly kind: "unexpected";
};
/** One line a human can read, for a failure that is a tagged union.
 *
 * Every surface that renders `EpisodeState.error` needs this, and each of them
 * used to reach for the value as if it were a string — which typechecked back
 * when it was one and has been a type error since it became a union. Putting
 * it here means the CLI and the web say the same thing about the same failure.
 * @tested-by: tst_fe_unit_agentfailure_001
 */
export declare function agentFailureMessage(failure: AgentFailure): string;
export interface EpisodeState {
    rootEpisodeId: string | null;
    parentEpisodeId: string | null;
    openDelegations: number | null;
    hasUnfinishedDescendants: boolean | null;
    episodeId: string | null;
    episodeTitle: string | null;
    replyTo: ReplyToContext | null;
    /** Canonical SDK projection of every entity linked to this Episode. */
    linkedEntities: readonly import("@magnis/sdk").LinkedEntitySummary[];
    messages: ChatMessage[];
    streamingContent: string;
    isStreaming: boolean;
    /** True while the durable Episode waits for an approval or answer. */
    pausedForApproval: boolean;
    toolCalls: PendingToolCall[];
    toolResults: CompletedToolResult[];
    contentBlocks: ContentBlock[];
    error: AgentFailure | null;
    /** Durable backend-owned Agent state; null before an Episode is selected. */
    agentState: EpisodeAgentState | null;
    /** Immutable implementation/profile plus the model revision for the next claim. */
    binding: EpisodeAgentBinding | null;
    /** Canonical working-memory snapshot hydrated from Episodes. */
    workingMemory: EpisodeWorkingMemory | null;
    /** The one non-terminal execution, if a continuation is currently claimed. */
    activeExecutionId: string | null;
}
export type PendingPromptKind = "ask_user" | "approval" | "module";
export interface PendingPrompt {
    readonly toolCall: PendingToolCall;
    readonly kind: PendingPromptKind;
}
export interface AskUserAnswer {
    readonly question?: string;
    readonly answer: string;
}
export type ResolvedDecision = {
    readonly kind: "ask_user";
    readonly toolCallId: string;
    readonly answerText: string;
    readonly answers: readonly AskUserAnswer[];
} | {
    readonly kind: "approval";
    readonly toolCallId: string;
    readonly status: "approved" | "denied";
    readonly toolName: string;
    /** Tool args carried through for the feed's compact / expanded summary. */
    readonly args: unknown;
    /** Executed tool result — used by the feed to show an EntityCard when the result is entity-shaped. */
    readonly result?: unknown;
};
export interface AskUserOption {
    readonly id: string;
    readonly label: string;
}
export interface AskUserQuestion {
    readonly id: string;
    readonly text: string;
    readonly type: "select_one" | "select_many";
    readonly options: readonly AskUserOption[];
}
export interface AskUserTab {
    readonly label: string;
    readonly questions: readonly AskUserQuestion[];
}
export interface AskUserPayload {
    readonly tabs: readonly AskUserTab[];
}
export interface AgentMessage {
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly content: string;
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
    readonly messagesByChat: Readonly<Record<string, readonly AgentMessage[]>>;
    readonly episodes?: readonly AgentChat[];
}
/** In the core package, color is a plain string. Frontend extends this with AvatarColor. */
export interface AgentChat {
    readonly id: string;
    readonly title: string;
    readonly preview: string;
    readonly time: string;
    readonly activityAt?: string;
    readonly color?: string;
    readonly icon?: string;
    readonly status?: string;
    readonly isArchived?: boolean;
}
