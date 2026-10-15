import { z } from "zod";
import { EntityIdSchema, IdSchema, PersistentEntityIdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
import { LinkedEntitySummarySchema } from "./linked-entity.js";
import { LinkSchema, linkStatementProjectionShape } from "./link.js";
import { DerivedStatementSchema, DateTimeSchema, SourceRefSchema } from "./statement.js";
export { EntityIdSchema, PersistentEntityIdSchema } from "./id.js";
const updateStateParams = z.strictObject({
    entityId: PersistentEntityIdSchema, pinOrder: z.int().nullable().optional(), archived: z.boolean().optional(), indexed: z.boolean().optional(),
});
export const EntityUpdateStateRequestSchema = z.union([
    updateStateParams.required({ pinOrder: true }), updateStateParams.required({ archived: true }), updateStateParams.required({ indexed: true }),
]);
/** The graph-owned decimal revision of a saved sync choice. */
export const SyncRevisionSchema = z.string().regex(/^(0|[1-9]\d*)$/);
// The zod side stays at JsonValue: at the wire, `properties` is validated
// against the DECLARED JSON Schema of `schemaId`, which the graph already does.
const entityBaseShape = {
    id: EntityIdSchema,
    schemaId: z.string(),
    schemaVersion: z.int(),
    createdAt: DateTimeSchema,
    name: z.string().nullable(),
    date: DateTimeSchema,
    idx: z.string().nullable(),
    properties: JsonValueSchema,
};
export const EntitySchema = z.discriminatedUnion("origin", [
    z.strictObject({ ...entityBaseShape, origin: z.literal("canonical"), source: SourceRefSchema,
        canonicalKey: z.string().min(1).nullable() }),
    z.strictObject({ ...entityBaseShape, ...DerivedStatementSchema.shape, keys: z.array(z.string()) }),
]);
const _entityExact = true;
void _entityExact;
/** Storage and graph reads cannot return the unsaved sentinel. */
export const PersistentEntitySchema = z.discriminatedUnion("origin", [
    EntitySchema.options[0].safeExtend({ id: PersistentEntityIdSchema }),
    EntitySchema.options[1].safeExtend({ id: PersistentEntityIdSchema }),
]);
/** The existing graph_index outcome vocabulary; never a processing permission. */
export const IndexingStatusSchema = z.enum(["indexed", "pending", "refused"]);
const extrasBaseShape = {
    pinOrder: z.int().nullable(),
    archived: z.boolean(),
    private: z.boolean(),
    indexed: IndexingStatusSchema,
};
/** Required flat fields. Unsupported sync is two nulls; half pairs are invalid. */
export const EntityExtrasSchema = z.union([
    z.strictObject({ ...extrasBaseShape, syncEnabled: z.boolean(), syncRevision: SyncRevisionSchema }),
    z.strictObject({ ...extrasBaseShape, syncEnabled: z.null(), syncRevision: z.null() }),
]);
export const EntityReadSchema = z.strictObject({
    entity: PersistentEntitySchema,
    extras: EntityExtrasSchema,
});
/** No option means a domain-only read. */
export const EntityReadOptionsSchema = z.strictObject({ extras: z.literal(true).exactOptional() });
/** An entity with the links a plugin read asked for. */
export const EntityWithLinksSchema = z.strictObject({
    entity: PersistentEntitySchema,
    extras: EntityExtrasSchema.exactOptional(),
    links: z.array(LinkSchema).readonly(),
});
/** One row of a plugin's linked window: the entity and the link that reached it. */
export const LinkedEntitySchema = z.strictObject({
    entity: PersistentEntitySchema,
    extras: EntityExtrasSchema.exactOptional(),
    link: LinkSchema,
});
/** The index-backed entity columns a filter or an order names. The words are
 * values, not keys, and keep their spelling. */
export const EntityColSchema = z.enum([
    "idx",
    "date",
    "name",
    "created_at",
    "is_pinned",
    "pin_order",
    "confidence",
    "origin",
    "valid_from",
    "valid_until",
]);
/** Graph read projection with neighbouring entities. */
export const EntityDetailSchema = z.strictObject({
    id: IdSchema,
    schemaId: z.string(),
    name: z.string().nullable(),
    createdAt: z.string(),
    extras: EntityExtrasSchema.exactOptional(),
    properties: JsonValueSchema,
    linkedEntities: z.array(LinkedEntitySummarySchema),
});
export const EntitySearchHitSchema = z.strictObject({
    id: IdSchema,
    name: z.string().nullable(),
    schemaId: z.string(),
});
export const EntitySearchResultSchema = z.strictObject({
    items: z.array(EntitySearchHitSchema),
});
export const EntityBriefSchema = z.strictObject({
    extras: EntityExtrasSchema.exactOptional(),
    id: IdSchema,
    schemaId: z.string(),
    name: z.string().nullable(),
    date: z.string(),
    idx: z.string().nullable(),
});
/** Paged graph read result used by graph.find/search/links. */
export const GraphEntityPageSchema = z.strictObject({
    items: z.array(EntityBriefSchema.extend({ linkKind: z.string().optional() })),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
});
/** Bounded graph.get projection. */
export const GraphEntityDetailSchema = z.strictObject({
    entity: EntityBriefSchema,
    extras: EntityExtrasSchema.exactOptional(),
    links: z.array(z.strictObject({
        id: IdSchema,
        kind: z.string(),
        ...linkStatementProjectionShape,
        from: IdSchema,
        to: IdSchema,
    })),
    linkCounts: z.record(z.string(), z.number().int().nonnegative()),
    linksTotal: z.number().int().nonnegative(),
    linksHasMore: z.boolean(),
});
/** Relationship projection returned by graph.entity.links. */
export const GraphEntityLinksSchema = z.strictObject({
    entityId: IdSchema,
    links: z.array(z.discriminatedUnion("direction", [
        z.strictObject({
            id: IdSchema,
            ...linkStatementProjectionShape,
            direction: z.literal("from"),
            kind: z.string(),
            targetId: IdSchema,
            targetName: z.string().nullable(),
        }),
        z.strictObject({
            id: IdSchema,
            ...linkStatementProjectionShape,
            direction: z.literal("to"),
            kind: z.string(),
            sourceId: IdSchema,
            sourceName: z.string().nullable(),
        }),
    ])),
    total: z.number().int().nonnegative(),
});
