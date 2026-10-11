import { z } from "zod";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { EntityReadOptionsSchema } from "../../core/entity.js";
import { SearchResultSchema } from "../../core/search.js";
import { SearchModelAvailabilitySchema } from "../../core/search-model.js";
import { SearchStatusSchema } from "../../core/search-status.js";
import { PersistentEntityIdSchema } from "../../core/id.js";
import { defineRpcContract } from "../contract.js";
export const searchIndexingStatusContract = defineRpcContract({
    method: "search.indexing_status",
    input: z.object({}),
    output: SearchStatusSchema,
});
export const searchModelStatusContract = defineRpcContract({
    method: "search.model_status",
    input: z.object({}),
    output: z.array(SearchModelAvailabilitySchema),
});
/** One page of scored results: at most fifty, ten unless the caller says. */
const searchLimit = z.int().min(1).max(50).default(10);
/** An entity type id. An OPEN set — a schema id is whatever the installed
 * modules declare — so it stays a string, never an enum. */
const schemaIds = z.array(z.string());
const byGraphContract = defineRpcContract({
    method: "search.by_graph",
    input: z.object({
        ...EntityReadOptionsSchema.shape,
        entityId: PersistentEntityIdSchema.describe("Entity to start traversal from"),
        // The traversal fans out per hop, so three is the enforced ceiling.
        depth: z.int().min(1).max(3).default(1).describe("How many hops to traverse"),
        linkKind: z
            .string()
            .optional()
            .describe("Filter by link kind (e.g. 'reply', 'sent_to', 'participant')"),
    }),
    output: z.array(SearchResultSchema),
});
const combinedContract = defineRpcContract({
    method: "search.combined",
    input: z.object({
        ...EntityReadOptionsSchema.shape,
        query: z.string().describe("Natural language search query"),
        relatedTo: z
            .array(PersistentEntityIdSchema)
            .default([])
            .describe("Entity IDs to use as graph context (mentions). Results must be connected to these entities."),
        schemaIds: schemaIds.optional().describe("Filter by entity types"),
        limit: searchLimit,
    }),
    output: z.array(SearchResultSchema),
});
export const searchContracts = {
    "search.by_graph": byGraphContract,
    "search.capabilities": defineRpcContract({
        method: "search.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "search.combined": combinedContract,
    /** `search.combined` for the client's own search box: its page size and the
     * `{results}` wrapper. */
    "search.fast": defineRpcContract({
        method: "search.fast",
        input: z.object({
            ...EntityReadOptionsSchema.shape,
            query: z.string(),
            mentionIds: z.array(PersistentEntityIdSchema).default([]),
            schemaIds: schemaIds.optional(),
            retrieval: z.enum(["hybrid", "text"]).default("hybrid"),
            limit: z.int().min(1).max(50).default(20),
        }),
        output: z.strictObject({ results: z.array(SearchResultSchema) }),
    }),
    "search.hybrid": defineRpcContract({
        method: "search.hybrid",
        input: z.object({
            ...EntityReadOptionsSchema.shape,
            query: z.string().describe("Natural language search query"),
            limit: searchLimit,
        }),
        output: z.array(SearchResultSchema),
    }),
    "search.indexing_status": searchIndexingStatusContract,
    "search.model_status": searchModelStatusContract,
    // Bound operation names retain the existing client adapters for equivalent methods.
    "search.entities.search": { ...combinedContract, method: "search.entities.search" },
    "search.neighborhood.list": { ...byGraphContract, method: "search.neighborhood.list" },
};
