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
    /** File-entity UUIDs sent as the wire-level `attachments` field of this
     *  message on `chat.stream` — the backend-validated channel
     *  (services/agents/attachments.rs). Distinct from `attachments` above
     *  (entity mentions), which fold into `content`. */
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
/** One `warning` stream event — non-fatal condition the engine reported
 *  (model fallback, resume unavailable, …). */
export interface EngineWarning {
    readonly code: string;
    readonly message: string;
}
export type AgentFailure = {
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
    episodeId: string | null;
    episodeTitle: string | null;
    replyTo: ReplyToContext | null;
    messages: ChatMessage[];
    streamingContent: string;
    isStreaming: boolean;
    /** Engine the sidecar actually dispatched to (`engine_resolved`, emitted
     *  before any other event). Null until the first event of a turn; reset
     *  on every new sendMessage. Optional for ONE release so state literals
     *  in zones frozen during the WS-1 consolidation keep compiling. */
    resolvedEngine?: string | null;
    /** `warning` events of the CURRENT turn, in arrival order. Optional for
     *  the same one-release transition reason as resolvedEngine. */
    warnings?: readonly EngineWarning[];
    /** True when the last stream emitted `paused_for_approval` (BuiltinEngine
     *  aborted because a tool returned pending_approval). Gates auto-resume in
     *  approveToolCall — engines that finish naturally never set this, so a
     *  user approval on a completed stream does not start a redundant re-stream. */
    pausedForApproval: boolean;
    toolCalls: PendingToolCall[];
    toolResults: CompletedToolResult[];
    contentBlocks: ContentBlock[];
    error: AgentFailure | null;
    /** The engine this EPISODE is answered by — chosen at creation, changeable
     *  while the transcript is empty, frozen by the first message. Distinct from
     *  `resolvedEngine`, which is what the current turn ran on: after the freeze
     *  they agree, and before the first message only this one exists. */
    engine: string | null;
    /** Whether the engine can still be changed. Served by the backend rather
     *  than derived from `messages.length`, because the client's window is not
     *  the transcript.
     *
     *  Required, not optional. It was optional and defaulted to `false`, and
     *  `false` means "still choosable" — so a payload missing the field rendered
     *  a FROZEN episode's picker as enabled. A default on this field can only
     *  point the wrong way. */
    engineLocked: boolean;
    /** The catalogue row the episode asks for, or null for the engine's own
     *  default. Changeable for the episode's whole life. */
    model: string | null;
    /** What the last turn's parameters actually came to — the step budget the
     *  engine applied (or that it applies none) and the model that answered.
     *  Null until a turn has run. */
    lastTurnResolution?: TurnResolution | null;
}
/** What one turn's parameters resolved to, as the engine reported them.
 *
 * `steps.unsupported` is Codex, which reads no budget at all: a global setting
 * that silently does nothing on one engine in three is worse than one that
 * says so. `model.basis` separates "the engine told us what it ran" from "the
 * engine cannot say, so this is what it was asked for".
 */
export interface TurnResolution {
    readonly steps?: {
        readonly requested: number;
        readonly effective: number;
    } | {
        readonly unsupported: true;
    };
    readonly model?: {
        readonly value: string;
        readonly basis: "effective" | "requested";
    } | {
        readonly unavailable: true;
    };
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
    /** What the agent is doing. Never "archived" — that is a separate axis. */
    readonly status: string;
    /** The user threw it away. Independent of `status`, which survives it. */
    readonly is_archived: boolean;
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
    readonly is_archived: boolean;
    readonly message_count: number;
    readonly messages: readonly EpisodeMessage[];
    readonly linked_entities: readonly LinkedEntitySummary[];
    readonly created_at: string;
    readonly date?: string;
    readonly updated_at: string;
    /** The engine answering this episode. Absent only for a legacy episode
     *  nobody has chosen for and nothing has run. */
    readonly engine?: string | null;
    /** Whether the engine can still be changed — served, not derived.
     *
     *  Required: the backend always sends it, and every default a client could
     *  invent points at "choosable", which is the unsafe direction. */
    readonly engine_locked: boolean;
    /** The catalogue row the episode asks for. */
    readonly model?: string | null;
    /** What the last turn's parameters came to. */
    readonly last_turn_resolution?: TurnResolution;
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
