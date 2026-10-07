import { z } from "zod";
import { EpisodeSummarySchema } from "../../core/chat.js";
import { AgentStopReceiptSchema, AgentWaitResolutionReceiptSchema, CreateEpisodeRequestSchema, EpisodeAgentBindingSchema, EpisodeAgentSnapshotSchema, EpisodeCreatedSchema, EpisodeInputAdmissionSchema, EpisodeLinkSummarySchema, EpisodeListItemSchema, EpisodeMemoryGetRequestSchema, EpisodeMemoryResultSchema, EpisodeMemorySaveRequestSchema, EpisodeSearchResultSchema, EpisodeStatusSchema, EpisodeSubtreePageSchema, EpisodeSubtreeQuerySchema, EpisodeUpdateRequestSchema, ResolveAgentWaitRequestSchema, SendEpisodeMessageRequestSchema, SetEpisodeModelRequestSchema, StopEpisodeAgentRequestSchema, } from "../../core/episode.js";
import { EpisodeTodoItemSchema, EpisodeTodoListResultSchema, EpisodeWorkspaceTodoAddRequestSchema, EpisodeWorkspaceTodoListRequestSchema, EpisodeWorkspaceTodoListResultSchema, EpisodeWorkspaceTodoRemoveRequestSchema, EpisodeWorkspaceTodoUpdateRequestSchema, } from "../../core/episode-todo.js";
import { EpisodeUsageQueryResultSchema, EpisodeUsageQuerySchema } from "../../core/episode-usage.js";
import { JsonValueSchema } from "../../core/json.js";
import { PaginationSchema } from "../../core/pagination.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
const askUserContract = defineRpcContract({
    method: "episodes.ask_user",
    input: z.object({
        question: z.string().min(1),
        answerSchema: JsonValueSchema.default({}),
    }),
    output: z.strictObject({ status: z.literal("question_sent"), awaitingResponse: z.boolean() }),
});
const delegateContract = defineRpcContract({
    method: "episodes.delegate",
    input: z.object({ subagent: z.string().min(1), title: z.string().min(1), prompt: z.string().min(1), model: z.string().min(1).optional(), background: z.boolean().optional(), result: JsonValueSchema.optional() }).strict(),
    output: z.object({ childEpisodeId: z.string(), waitId: z.string().optional() }).strict(),
});
const getContract = defineRpcContract({
    method: "episodes.get",
    input: z.object({ episodeId: z.string().min(1) }),
    output: EpisodeAgentSnapshotSchema,
});
const linkEntityContract = defineRpcContract({
    method: "episodes.link_entity",
    input: z.object({ episodeId: z.string().min(1), entityId: z.string().min(1), kind: z.string().min(1) }),
    output: StatusAckSchema,
});
const listContract = defineRpcContract({
    method: "episodes.list",
    input: z.object({ includeChildren: z.boolean().optional(), search: z.string().optional(), status: z.string().optional(), archived: z.boolean().nullable().default(null), limit: z.number().int().positive().default(50), offset: z.number().int().nonnegative().default(0) }),
    output: z.strictObject({ items: z.array(EpisodeListItemSchema), total: z.number().int(), limit: z.number().int(), offset: z.number().int() }),
});
const listForEntityContract = defineRpcContract({
    method: "episodes.list_for_entity",
    input: PaginationSchema.extend({
        entityId: z.string().min(1),
        statuses: z.array(z.string()).optional(),
        archived: z.boolean().nullable().default(null),
    }),
    output: z.array(EpisodeLinkSummarySchema),
});
const reportContract = defineRpcContract({
    method: "episodes.report",
    input: z.object({ summary: z.string().min(1), result: JsonValueSchema.optional() }).strict(),
    output: z.object({ reported: z.literal(true) }).strict(),
});
const searchContract = defineRpcContract({
    method: "episodes.search",
    input: z.object({ query: z.string().min(1), status: z.string().optional(), archived: z.boolean().nullable().default(null), limit: z.number().int().positive().default(50) }),
    output: z.array(EpisodeSearchResultSchema),
});
export const episodesContracts = {
    "episodes.append_message": defineRpcContract({
        method: "episodes.append_message",
        input: SendEpisodeMessageRequestSchema,
        output: EpisodeInputAdmissionSchema,
    }),
    "episodes.archive": defineRpcContract({
        method: "episodes.archive",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "episodes.ask_user": askUserContract,
    "episodes.capabilities": defineRpcContract({
        method: "episodes.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "episodes.complete": defineRpcContract({
        method: "episodes.complete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "episodes.create": defineRpcContract({
        method: "episodes.create",
        input: CreateEpisodeRequestSchema,
        output: EpisodeCreatedSchema,
    }),
    "episodes.delegate": delegateContract,
    "episodes.get": getContract,
    "episodes.link_entity": linkEntityContract,
    "episodes.list": listContract,
    "episodes.list_for_entity": listForEntityContract,
    "episodes.model.set": defineRpcContract({
        method: "episodes.model.set",
        input: SetEpisodeModelRequestSchema,
        output: EpisodeAgentBindingSchema,
    }),
    "episodes.report": reportContract,
    "episodes.search": searchContract,
    "episodes.set_status": defineRpcContract({
        method: "episodes.set_status",
        input: z.object({ id: z.string().min(1), status: EpisodeStatusSchema }),
        output: StatusAckSchema,
    }),
    "episodes.set_title": defineRpcContract({
        method: "episodes.set_title",
        input: z.object({ episodeId: z.string().min(1), title: z.string() }),
        output: StatusAckSchema,
    }),
    "episodes.stop": defineRpcContract({
        method: "episodes.stop",
        input: StopEpisodeAgentRequestSchema,
        output: AgentStopReceiptSchema,
    }),
    "episodes.subtree": defineRpcContract({
        method: "episodes.subtree",
        input: EpisodeSubtreeQuerySchema,
        output: EpisodeSubtreePageSchema,
    }),
    "episodes.summary.get": defineRpcContract({
        method: "episodes.summary.get",
        input: z.object({ episodeId: z.string().min(1) }),
        output: EpisodeSummarySchema,
    }),
    "episodes.summary.refresh": defineRpcContract({
        method: "episodes.summary.refresh",
        input: z.object({ episodeId: z.string().min(1) }),
        output: EpisodeSummarySchema,
    }),
    "episodes.todo.get": defineRpcContract({
        method: "episodes.todo.get",
        input: z.object({ episodeId: z.string().min(1) }),
        output: EpisodeTodoListResultSchema,
    }),
    "episodes.todo.update": defineRpcContract({
        method: "episodes.todo.update",
        input: z.object({ episodeId: z.string().min(1), items: z.array(EpisodeTodoItemSchema) }),
        output: EpisodeTodoListResultSchema,
    }),
    "episodes.unarchive": defineRpcContract({
        method: "episodes.unarchive",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "episodes.usage.query": defineRpcContract({
        method: "episodes.usage.query",
        input: EpisodeUsageQuerySchema,
        output: EpisodeUsageQueryResultSchema,
    }),
    "episodes.wait.resolve": defineRpcContract({
        method: "episodes.wait.resolve",
        input: ResolveAgentWaitRequestSchema,
        output: AgentWaitResolutionReceiptSchema,
    }),
    // Bound operation names retain the existing client adapters for equivalent methods.
    "episodes.episode.ask_user": { ...askUserContract, method: "episodes.episode.ask_user" },
    "episodes.episode.create": { ...delegateContract, method: "episodes.episode.create" },
    "episodes.episode.get": { ...getContract, method: "episodes.episode.get" },
    "episodes.episode.link": { ...linkEntityContract, method: "episodes.episode.link" },
    "episodes.episode.report": { ...reportContract, method: "episodes.episode.report" },
    "episodes.episode.search": { ...searchContract, method: "episodes.episode.search" },
    "episodes.episode.list": defineRpcContract({
        method: "episodes.episode.list",
        input: z.union([listContract.input, listForEntityContract.input]),
        output: z.union([listContract.output, listForEntityContract.output]),
    }),
    "episodes.episode.update": defineRpcContract({
        method: "episodes.episode.update",
        input: EpisodeUpdateRequestSchema,
        output: StatusAckSchema,
    }),
    "episodes.workspace.todo.list": defineRpcContract({
        method: "episodes.workspace.todo.list",
        input: EpisodeWorkspaceTodoListRequestSchema,
        output: EpisodeWorkspaceTodoListResultSchema,
    }),
    "episodes.workspace.todo.add": defineRpcContract({
        method: "episodes.workspace.todo.add",
        input: EpisodeWorkspaceTodoAddRequestSchema,
        output: EpisodeWorkspaceTodoListResultSchema,
    }),
    "episodes.workspace.todo.rm": defineRpcContract({
        method: "episodes.workspace.todo.rm",
        input: EpisodeWorkspaceTodoRemoveRequestSchema,
        output: EpisodeWorkspaceTodoListResultSchema,
    }),
    "episodes.workspace.todo.update": defineRpcContract({
        method: "episodes.workspace.todo.update",
        input: EpisodeWorkspaceTodoUpdateRequestSchema,
        output: EpisodeWorkspaceTodoListResultSchema,
    }),
    "episodes.workspace.memory.get": defineRpcContract({
        method: "episodes.workspace.memory.get",
        input: EpisodeMemoryGetRequestSchema,
        output: EpisodeMemoryResultSchema,
    }),
    "episodes.workspace.memory.save": defineRpcContract({
        method: "episodes.workspace.memory.save",
        input: EpisodeMemorySaveRequestSchema,
        output: EpisodeMemoryResultSchema,
    }),
};
