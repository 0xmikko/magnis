import { z } from "zod";
import { EpisodeReasoningSelectionSchema, LlmModelInfoSchema, ReasoningCapabilitiesSchema } from "./ai-model.js";
import { IdSchema } from "./id.js";
import { LinkedEntitySummarySchema } from "./linked-entity.js";
import { EpisodeMessageSchema } from "./episode-message.js";
import { EpisodeTodoItemSchema } from "./episode-todo.js";
import { EpisodeWaitSchema } from "./episode-wait.js";
import { JsonValueSchema } from "./json.js";
export const episodeStatuses = ["active", "needs_input", "idle", "completed"];
export const EpisodeStatusSchema = z.enum(episodeStatuses);
export const EpisodeUpdateRequestSchema = z.strictObject({
    id: z.string().min(1), title: z.string().trim().min(1).optional(),
    status: EpisodeStatusSchema.optional(), archived: z.boolean().optional(),
}).refine(args => args.title !== undefined || args.status !== undefined || args.archived !== undefined, "An episode change is required");
export const EpisodeMemoryGetRequestSchema = z.strictObject({});
export const EpisodeMemorySaveRequestSchema = z.strictObject({ body: z.string() });
export const EpisodeMemoryResultSchema = z.strictObject({ body: z.string().nullable() });
export const episodeLinkKindRanks = [
    "started_with",
    "created",
    "modified",
    "mentions",
    "reply_to",
];
export const EpisodeListItemSchema = z.strictObject({
    id: IdSchema,
    title: z.string(),
    rootEpisodeId: IdSchema,
    parentEpisodeId: IdSchema.nullable(),
    rootTitle: z.string(),
    openDelegations: z.int().nonnegative(),
    status: EpisodeStatusSchema.or(z.string()),
    isArchived: z.boolean(),
    messageCount: z.int().nonnegative(),
    createdAt: z.string(),
    date: z.string(),
    updatedAt: z.string(),
    lastMessageAt: z.string().optional(),
});
export const EpisodeSubtreeQuerySchema = z.object({
    episodeId: IdSchema,
    limit: z.int().min(1).max(100).default(50),
    cursor: z.string().min(1).optional(),
    openOnly: z.boolean().optional(),
    directOnly: z.boolean().optional(),
}).strict();
export const EpisodeSubtreeItemSchema = z.object({
    episodeId: IdSchema,
    parentEpisodeId: IdSchema,
    rootEpisodeId: IdSchema,
    title: z.string(),
    status: EpisodeStatusSchema,
    depth: z.int().positive(),
}).strict();
export const EpisodeSubtreePageSchema = z.object({
    items: z.array(EpisodeSubtreeItemSchema),
    nextCursor: z.string().nullable(),
}).strict();
export const EpisodeLinkSummarySchema = z.strictObject({
    episodeId: IdSchema,
    title: z.string(),
    status: z.string(),
    isArchived: z.boolean(),
    linkKinds: z.array(z.string()),
    updatedAt: z.string(),
    isEmpty: z.boolean(),
});
/** Search result over episode titles and durable summaries. */
export const EpisodeSearchResultSchema = z.strictObject({
    id: IdSchema,
    title: z.string(),
    status: z.string(),
    isArchived: z.boolean(),
    objective: z.string().nullable(),
});
export const EpisodeDetailViewSchema = z.strictObject({
    id: IdSchema,
    title: z.string(),
    status: z.string(),
    isArchived: z.boolean(),
    messageCount: z.int().nonnegative(),
    messages: z.array(EpisodeMessageSchema),
    linkedEntities: z.array(LinkedEntitySummarySchema),
    todos: z.array(EpisodeTodoItemSchema).optional(),
    waits: z.array(EpisodeWaitSchema).optional(),
    createdAt: z.string(),
    date: z.string(),
    updatedAt: z.string(),
    lastTurnResolution: JsonValueSchema.optional(),
});
export const EpisodeCreateParamsSchema = z.strictObject({ title: z.string() });
export const agentImplementationIds = ["magnis", "codex", "claude"];
export const AgentImplementationIdSchema = z.enum(agentImplementationIds);
/** One concrete model the selected Agent implementation can bind next. */
export const AgentModelOptionSchema = z.object({
    id: IdSchema,
    modelId: z.string().min(1),
    name: z.string().min(1),
    providerConnectionId: z.string().nullable().optional(),
    providerDisplayName: z.string().nullable().optional(),
    dataBoundary: LlmModelInfoSchema.shape.dataBoundary.optional(),
    available: z.boolean().optional(),
    unavailableReason: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
    reasoning: ReasoningCapabilitiesSchema.optional(),
}).strict();
export const episodeAgentStates = ["idle", "active", "needs_input"];
export const EpisodeAgentStateSchema = z.enum(episodeAgentStates);
export const AgentProfileSnapshotSchema = z.object({
    profileId: IdSchema,
    configurationHash: z.string().min(1),
    instructions: z.string(),
    allowedToolNames: z.array(z.string()),
    contextBudgetTokens: z.number().int().positive(),
}).strict();
export const AgentSessionBindingSchema = z.object({
    id: IdSchema,
    implementationId: AgentImplementationIdSchema,
}).strict();
export const EpisodeAgentBindingSchema = z.object({
    revision: z.number().int().nonnegative(),
    implementationId: AgentImplementationIdSchema,
    modelId: z.string().min(1),
    reasoning: EpisodeReasoningSelectionSchema.optional(),
    profile: AgentProfileSnapshotSchema,
    session: AgentSessionBindingSchema.nullable(),
}).strict();
export const EpisodeWorkingMemorySchema = z.object({
    agentMemory: z.string().nullable(),
    objective: z.string().nullable(),
    currentState: z.string().nullable(),
    recentDecisions: z.array(z.string()),
    summary: z.string().nullable(),
    transcriptWindow: z.array(EpisodeMessageSchema),
    todos: z.array(EpisodeTodoItemSchema),
    waits: z.array(EpisodeWaitSchema),
    deniedToolCallIds: z.array(IdSchema),
    activeEntityIds: z.array(IdSchema),
}).strict();
/** A current terminal failure persisted by the Episode execution owner. */
export const EpisodeExecutionErrorSchema = z.object({
    executionId: IdSchema,
    code: z.string().min(1),
    message: z.string().min(1),
}).strict();
/** The single durable hydration document for an Episode Agent surface. */
export const EpisodeAgentSnapshotSchema = z.object({
    episodeId: IdSchema,
    rootEpisodeId: IdSchema,
    parentEpisodeId: IdSchema.nullable(),
    openDelegations: z.int().nonnegative(),
    hasUnfinishedDescendants: z.boolean(),
    title: z.string(),
    isArchived: z.boolean(),
    linkedEntities: z.array(LinkedEntitySummarySchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    state: EpisodeAgentStateSchema,
    binding: EpisodeAgentBindingSchema,
    workingMemory: EpisodeWorkingMemorySchema,
    activeExecutionId: IdSchema.nullable(),
    executionError: EpisodeExecutionErrorSchema.optional(),
}).strict();
export const SendEpisodeMessageRequestSchema = z.object({
    episodeId: IdSchema,
    requestId: IdSchema,
    messageId: IdSchema,
    content: z.string(),
    attachmentIds: z.array(IdSchema),
}).strict();
export const EpisodeInputAdmissionSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("appended"),
        episodeId: IdSchema,
        inputId: IdSchema,
        sequence: z.number().int().nonnegative(),
        messageId: IdSchema,
        state: z.literal("active"),
    }).strict(),
    z.object({
        kind: z.literal("queued"),
        episodeId: IdSchema,
        inputId: IdSchema,
        sequence: z.number().int().nonnegative(),
        state: z.enum(["active", "needs_input"]),
    }).strict(),
]);
/** One answer to an Episode wait: an approval decides, a question is
 * answered. Each member is strict, so a decision and an answer exclude each
 * other; only a tool approval may edit the call's arguments. `z.union`
 * rather than `z.discriminatedUnion`, because an RPC input publishes its
 * forms as `anyOf` (tst_sdk_native_registry_003). `exactOptional`: an absent
 * key, never an undefined value, so the output is `argumentsOverride?: JsonValue`. */
export const ResolveAgentWaitRequestSchema = z.union([
    z.strictObject({
        kind: z.enum(["tool_approval", "native_approval"]),
        episodeId: IdSchema,
        waitId: IdSchema,
        resolutionId: IdSchema,
        decision: z.enum(["approved", "denied"]),
        argumentsOverride: JsonValueSchema.exactOptional(),
    }).refine((request) => request.argumentsOverride === undefined || request.kind === "tool_approval", "Only tool approvals accept edited arguments"),
    z.strictObject({
        kind: z.literal("ask_user"),
        episodeId: IdSchema,
        waitId: IdSchema,
        resolutionId: IdSchema,
        answer: JsonValueSchema,
    }),
]);
export const AgentWaitResolutionReceiptSchema = z.object({
    episodeId: IdSchema,
    waitId: IdSchema,
    inputId: IdSchema,
    state: z.enum(["active", "needs_input"]),
}).strict();
export const StopEpisodeAgentRequestSchema = z.object({
    episodeId: IdSchema,
    requestId: IdSchema,
}).strict();
export const AgentStopReceiptSchema = z.object({
    episodeId: IdSchema,
    executionId: IdSchema.nullable(),
    state: z.literal("idle"),
    alreadyStopped: z.boolean(),
}).strict();
export const EpisodeAgentSelectionInputSchema = z.object({
    implementationId: AgentImplementationIdSchema.optional(),
    modelId: z.string().min(1).optional(),
    reasoning: EpisodeReasoningSelectionSchema.optional(),
}).strict();
export const CreateEpisodeRequestSchema = z.object({
    requestId: IdSchema,
    title: z.string(),
    selection: EpisodeAgentSelectionInputSchema.optional(),
    profileId: IdSchema.optional(),
}).strict();
export const EpisodeCreatedSchema = z.object({
    episodeId: IdSchema,
    binding: EpisodeAgentBindingSchema,
    state: z.literal("idle"),
}).strict();
export const SetEpisodeModelRequestSchema = z.object({
    episodeId: IdSchema,
    requestId: IdSchema,
    expectedRevision: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    reasoning: EpisodeReasoningSelectionSchema.optional(),
}).strict();
