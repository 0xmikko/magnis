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
export interface ToolCallEvent {
    readonly id: string;
    readonly name: string;
    readonly args: unknown;
}
export interface ToolResultEvent {
    readonly id: string;
    readonly name?: string;
    readonly result: unknown;
}
export interface PendingToolCall {
    /** Feed identifier (`tool_call_id` in persisted episode messages). */
    readonly id: string;
    readonly name: string;
    readonly args: unknown;
    /** Approval-store request id (`approval_id` from pending_approval payload). */
    approvalId?: string;
    chatName?: string;
    status: "pending" | "approved" | "denied";
}
export interface CompletedToolResult {
    readonly id: string;
    readonly name: string;
    readonly result: unknown;
}
export type ContentBlock = {
    type: "thinking";
    text: string;
} | {
    type: "tool_call";
    toolCallId: string;
} | {
    type: "text";
    text: string;
} | {
    type: "user_message";
    text: string;
};
export interface EpisodeState {
    episodeId: string | null;
    episodeTitle: string | null;
    replyTo: ReplyToContext | null;
    messages: ChatMessage[];
    streamingContent: string;
    isStreaming: boolean;
    /** True when the last stream emitted `paused_for_approval` (BuiltinEngine
     *  aborted because a tool returned pending_approval). Gates auto-resume in
     *  approveToolCall — engines that finish naturally never set this, so a
     *  user approval on a completed stream does not start a redundant re-stream. */
    pausedForApproval: boolean;
    toolCalls: PendingToolCall[];
    toolResults: CompletedToolResult[];
    contentBlocks: ContentBlock[];
    error: string | null;
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
export interface EpisodeListItem {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly message_count: number;
    readonly created_at: string;
    readonly date?: string;
    readonly updated_at: string;
    readonly last_message_at?: string;
}
export interface EpisodeMessage {
    readonly id: string;
    readonly episode_id: string;
    readonly ordinal: number;
    readonly role: string;
    readonly content?: string;
    readonly tool_name?: string;
    readonly tool_call_id?: string;
    readonly tool_args?: string;
    readonly tool_result?: string;
    readonly status: string;
    readonly created_at: string;
}
export interface LinkedEntitySummary {
    readonly id: string;
    readonly name: string | null;
    readonly schema_id: string;
    readonly link_kind: string;
    readonly created_at: string;
    readonly data?: Readonly<Record<string, unknown>>;
}
export interface EpisodeDetailView {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly message_count: number;
    readonly messages: readonly EpisodeMessage[];
    readonly linked_entities: readonly LinkedEntitySummary[];
    readonly created_at: string;
    readonly date?: string;
    readonly updated_at: string;
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
}
