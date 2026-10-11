import { z } from "zod";
import { EntityDetailSchema, EntityReadOptionsSchema, EntitySchema, EntityUpdateStateRequestSchema, GraphEntityDetailSchema, GraphEntityLinksSchema, GraphEntityPageSchema, } from "../../core/entity.js";
import { JsonObjectSchema } from "../../core/json.js";
import { LinkAddResultSchema, LinkSchema, LinkUnlinkRequestSchema } from "../../core/link.js";
import { PageOffsetSchema } from "../../core/pagination.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { OkAckSchema } from "../../core/rpc-response.js";
import { DerivedStatementSchema, DateTimeSchema } from "../../core/statement.js";
import { PersistentEntityIdSchema } from "../../core/id.js";
import { UuidShapeSchema } from "../../core/uuid.js";
import { defineRpcContract } from "../contract.js";
/** The core read tools answer at most this many items per page. */
const graphReadLimit = z.int().min(1).max(50).default(25).describe("Max items (default 25, hard cap 50)");
const entityLinksContract = defineRpcContract({
    method: "graph.entity.links",
    input: z.object({
        id: PersistentEntityIdSchema.describe("Entity UUID"),
        kind: z.string().optional().describe("Filter by link kind (optional)"),
        direction: z
            .enum(["from", "to", "both"])
            .default("both")
            .describe("Link direction: 'from' = outgoing, 'to' = incoming, 'both' = all (default)"),
    }),
    output: GraphEntityLinksSchema,
});
const linkAddContract = defineRpcContract({
    method: "graph.link.add",
    input: z.object({
        from: PersistentEntityIdSchema.describe("Source entity id"),
        to: PersistentEntityIdSchema.describe("Target entity id"),
        // Blankness is the one thing the published schema cannot state:
        // `minLength` counts spaces, and an all-whitespace edge kind is not a
        // kind. The refusal stays in the schema as a check.
        kind: z
            .string()
            .min(1)
            .refine((value) => value.trim() !== "", "kind must not be blank")
            .describe('Edge kind, e.g. "works_at"'),
        ...DerivedStatementSchema.omit({ origin: true }).shape,
    }),
    output: LinkAddResultSchema,
});
const linkEndContract = defineRpcContract({
    method: "graph.link.end",
    input: z.object({
        id: UuidShapeSchema.describe("The link to close, from list graph.entity.links"),
        validUntil: DateTimeSchema.describe("When it stopped being true, ISO 8601; after validFrom"),
        evidence: PersistentEntityIdSchema.describe("The entity that says the fact ended"),
    }),
    output: LinkSchema,
});
const entityRefInput = z.object({ entityId: PersistentEntityIdSchema });
/** `graph.relations`: the workspace's link-kind vocabulary. It is dispatched
 * beside the generated search tools rather than registered as a native
 * method, so it is not part of {@link graphContracts}. */
export const graphRelationsContract = defineRpcContract({
    method: "graph.relations",
    input: z.object({}),
    output: z.strictObject({
        relations: z.array(z.strictObject({
            kind: z.string(),
            description: z.string(),
            state: z.string(),
            symmetric: z.boolean(),
            fromRole: z.string().nullable(),
            toRole: z.string().nullable(),
            owner: z.string().nullable(),
        })),
    }),
});
export const graphContracts = {
    "graph.approve": defineRpcContract({
        method: "graph.approve",
        input: z.object({ id: UuidShapeSchema, episodeId: PersistentEntityIdSchema }),
        output: z.union([EntitySchema, LinkSchema]),
    }),
    "graph.capabilities": defineRpcContract({
        method: "graph.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "graph.entity.archive": defineRpcContract({
        method: "graph.entity.archive",
        input: entityRefInput,
        output: OkAckSchema,
    }),
    "graph.entity.get": defineRpcContract({
        method: "graph.entity.get",
        input: z.object({ id: PersistentEntityIdSchema.describe("Entity UUID"), ...EntityReadOptionsSchema.shape }),
        output: EntityDetailSchema,
    }),
    "graph.entity.links": entityLinksContract,
    "graph.entity.pin": defineRpcContract({
        method: "graph.entity.pin",
        input: z.object({
            entityId: PersistentEntityIdSchema,
            // The safe-integer bounds `z.int()` publishes are noise in a sort
            // order the model reads; the override drops them from the published
            // schema and keeps the runtime check, as `UuidShapeSchema` does with
            // `pattern`.
            pinOrder: z
                .int()
                .meta({ minimum: undefined, maximum: undefined })
                .describe("Sort order (lower = higher priority)"),
        }),
        output: OkAckSchema,
    }),
    "graph.entity.unarchive": defineRpcContract({
        method: "graph.entity.unarchive",
        input: entityRefInput,
        output: OkAckSchema,
    }),
    "graph.entity.unpin": defineRpcContract({
        method: "graph.entity.unpin",
        input: entityRefInput,
        output: OkAckSchema,
    }),
    "graph.entity.update_properties": defineRpcContract({
        method: "graph.entity.update_properties",
        input: z.object({ entityId: PersistentEntityIdSchema, properties: JsonObjectSchema }),
        output: OkAckSchema,
    }),
    "graph.find": defineRpcContract({
        method: "graph.find",
        input: z.object({
            ...EntityReadOptionsSchema.shape,
            type: z.string().min(1).describe("Entity schema id, e.g. telegram.message, telegram.chat, contacts.person"),
            chatId: z.string().optional().describe("Filter to one chat/container (entity idx). Wins over `name`."),
            name: z.string().optional().describe("Filter by exact entity name"),
            after: z.string().optional().describe("ISO-8601 lower bound on date (inclusive)"),
            before: z.string().optional().describe("ISO-8601 upper bound on date (inclusive)"),
            limit: graphReadLimit,
            offset: PageOffsetSchema,
        }),
        output: GraphEntityPageSchema,
    }),
    "graph.get": defineRpcContract({
        method: "graph.get",
        input: z.object({
            ...EntityReadOptionsSchema.shape, id: PersistentEntityIdSchema.describe("Entity UUID")
        }),
        output: GraphEntityDetailSchema,
    }),
    "graph.link.add": linkAddContract,
    "graph.link.end": linkEndContract,
    "graph.links": defineRpcContract({
        method: "graph.links",
        input: z.object({
            ...EntityReadOptionsSchema.shape,
            id: PersistentEntityIdSchema.describe("Parent entity UUID"),
            kind: z.string().min(1).describe("Link kind, e.g. project:task"),
            direction: z
                .enum(["out", "in"])
                .default("out")
                .describe("out = parent is from-side (default); in = parent is to-side"),
            childType: z.string().optional().describe("Restrict neighbours to this schema id"),
            after: z.string().optional().describe("ISO-8601 lower bound on the neighbour's date"),
            before: z.string().optional().describe("ISO-8601 upper bound on the neighbour's date"),
            limit: graphReadLimit,
            offset: PageOffsetSchema,
        }),
        output: GraphEntityPageSchema,
    }),
    "graph.search": defineRpcContract({
        method: "graph.search",
        input: z.object({
            ...EntityReadOptionsSchema.shape,
            query: z.string().min(1).describe("Natural-language / keyword query"),
            type: z.string().optional().describe("Restrict to an entity schema id, e.g. telegram.message"),
            after: z.string().optional().describe("ISO-8601 lower bound on date (inclusive)"),
            before: z.string().optional().describe("ISO-8601 upper bound on date (inclusive)"),
            limit: graphReadLimit,
        }),
        output: GraphEntityPageSchema,
    }),
    "graph.withdraw": defineRpcContract({
        method: "graph.withdraw",
        input: z.object({ evidenceIds: z.array(PersistentEntityIdSchema).min(1) }),
        output: z.strictObject({ entities: z.number().int().nonnegative(), links: z.number().int().nonnegative() }),
    }),
    // Bound operation names retain the existing client adapters for equivalent methods.
    "graph.entity.links.list": { ...entityLinksContract, method: "graph.entity.links.list" },
    "graph.link.link": { ...linkAddContract, method: "graph.link.link" },
    "graph.link.update": { ...linkEndContract, method: "graph.link.update" },
    "graph.entity.update": defineRpcContract({
        method: "graph.entity.update",
        input: EntityUpdateStateRequestSchema,
        output: OkAckSchema,
    }),
    "graph.link.unlink": defineRpcContract({
        method: "graph.link.unlink",
        input: LinkUnlinkRequestSchema,
        output: OkAckSchema,
    }),
};
