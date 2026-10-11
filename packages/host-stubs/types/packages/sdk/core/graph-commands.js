/** Graph writes: the batch a plugin sends, the batch the host applies once it
 * stamped each entity, and the entity updates the graph service takes. */
import { z } from "zod";
import { IdSchema, PersistentEntityIdSchema } from "./id.js";
import { validPeriod } from "./indexing.js";
import { JsonValueSchema } from "./json.js";
import { DateTimeSchema, SourceRefSchema } from "./statement.js";
const batchEntityInputShape = {
    /** Local batch key that wires links within the batch; never an id. */
    key: z.string(),
    schemaId: z.string(),
    name: z.string().nullable(),
    idx: z.string().nullable(),
    date: z.string().nullable(),
    /** The record's `source.externalId`, the key a re-sync lands on. */
    externalId: z.string().nullable(),
    /** The node's dictionary as this sync observed it; a re-apply replaces it wholesale. */
    properties: JsonValueSchema.nullable(),
    /** The module-owned exact key of the record, when it has one. */
    canonicalKey: z.string().min(1).exactOptional(),
    /** The user's sync choice, required when the schema is syncable and refused otherwise. */
    syncEnabled: z.boolean().exactOptional(),
};
/** An entity as a plugin sends it, before the host stamps its version and source. */
export const BatchEntityInputSchema = z.strictObject(batchEntityInputShape);
/** An entity as the host applies it. `source` is null for a curated write. */
export const BatchEntitySchema = z.strictObject({
    ...batchEntityInputShape,
    schemaVersion: z.int().positive(),
    source: SourceRefSchema.nullable(),
});
/** A pre-existing entity that links point to, resolved by its `externalId` and
 * never created; a ref that resolves to nothing drops its links. */
export const BatchRefSchema = z.strictObject({
    key: z.string(),
    externalId: z.string().nullable(),
});
/** A link wiring two batch keys. `declaredBy` is the key of the batch item
 * whose mapper emitted it. */
export const BatchLinkSchema = z.strictObject({
    fromKey: z.string(),
    toKey: z.string(),
    kind: z.string(),
    confidence: z.number().nullable(),
    metadata: JsonValueSchema.nullable(),
    declaredBy: z.string().nullable(),
    validFrom: DateTimeSchema.nullable(),
    validUntil: DateTimeSchema.nullable(),
}).refine(validPeriod, "validUntil must follow validFrom");
const graphRefSchemaId = z.string().min(1);
const canonicalGraphRefSchema = z.strictObject({
    kind: z.literal("canonical"),
    schemaId: graphRefSchemaId,
    canonicalKey: z.string().min(1),
});
const identityGraphRefSchema = z.strictObject({
    kind: z.literal("identity"),
    schemaId: graphRefSchemaId,
    /** The entity whose identity this one is, resolved first. */
    get identityRef() {
        return GraphRefSchema;
    },
});
/** A lookup description the graph resolves inside the batch transaction that
 * applies it: by canonical key, by source key, by id, or as the identity of
 * another reference. */
export const GraphRefSchema = z.union([
    canonicalGraphRefSchema,
    identityGraphRefSchema,
    z.strictObject({ kind: z.literal("source"), schemaId: graphRefSchemaId, externalId: z.string().min(1) }),
    z.strictObject({
        kind: z.literal("id"),
        schemaId: graphRefSchemaId,
        id: PersistentEntityIdSchema,
    }),
]);
/** An entity its schema's owner declares, created or updated where its
 * reference resolves. */
export const GraphEntityDeclarationSchema = z.strictObject({
    ref: z.union([canonicalGraphRefSchema, identityGraphRefSchema]),
    schemaVersion: z.int().positive(),
    name: z.string().nullable(),
    idx: z.string().nullable(),
    date: DateTimeSchema.nullable(),
    properties: JsonValueSchema,
    /** The user's sync choice, required when the schema is syncable and refused otherwise. */
    syncEnabled: z.boolean().exactOptional(),
});
/** A canonical link between two references. */
export const GraphLinkDeclarationSchema = z.strictObject({
    from: GraphRefSchema,
    to: GraphRefSchema,
    kind: z.string().min(1),
    confidence: z.null(),
    metadata: JsonValueSchema,
    declaredBy: GraphRefSchema.nullable(),
    validFrom: DateTimeSchema.nullable(),
    validUntil: DateTimeSchema.nullable(),
});
/** The entities and links one owner declares for a batch. */
export const GraphOwnerFragmentSchema = z.strictObject({
    entities: z.array(GraphEntityDeclarationSchema).readonly(),
    links: z.array(GraphLinkDeclarationSchema).readonly(),
});
/** A fragment the host collected from an owner's `ensure` answer, under the
 * owner it authenticated; never accepted from a plugin. */
export const GraphPreparedFragmentSchema = z.strictObject({
    owner: z.string().min(1),
    fragment: GraphOwnerFragmentSchema,
});
/** What `rpc.ensure` asks a schema's owner: references for these items. */
export const EnsureRequestSchema = z.strictObject({
    schemaId: graphRefSchemaId,
    items: z.array(JsonValueSchema).readonly(),
});
/** What `rpc.ensure` answers its caller: one reference per item, in order,
 * or null for an item the owner refused. */
export const EnsureResultSchema = z.strictObject({
    refs: z.array(GraphRefSchema.nullable()).readonly(),
});
/** What an owner's `<schemaId>.ensure` method answers: the references and the
 * fragment that declares them. */
export const EnsureHandlerResultSchema = z.strictObject({
    refs: z.array(GraphRefSchema.nullable()).readonly(),
    fragment: GraphOwnerFragmentSchema,
});
const batchLinksShape = {
    refs: z.array(BatchRefSchema).readonly(),
    links: z.array(BatchLinkSchema).readonly(),
    /** The calling module's own declarations, applied with the batch. */
    fragment: GraphOwnerFragmentSchema.exactOptional(),
};
/** The batch a plugin sends to `applyBatch`. */
export const GraphBatchInputSchema = z.strictObject({
    entities: z.array(BatchEntityInputSchema).readonly(),
    ...batchLinksShape,
});
/** A whole graph fragment the host applies atomically. */
export const GraphBatchSchema = z.strictObject({
    entities: z.array(BatchEntitySchema).readonly(),
    ...batchLinksShape,
    /** The fragments the host collected through `rpc.ensure` for this batch. */
    prepared: z.array(GraphPreparedFragmentSchema).readonly().exactOptional(),
});
/** A reference the batch resolved, and whether resolving it created the entity. */
export const GraphResolvedRefSchema = z.strictObject({
    ref: GraphRefSchema,
    id: PersistentEntityIdSchema,
    created: z.boolean(),
});
const countSchema = z.int().nonnegative();
/** What `applyBatch` answers a plugin: batch key to entity id, and counts. */
export const GraphBatchResultSchema = z.strictObject({
    ids: z.record(z.string(), PersistentEntityIdSchema).readonly(),
    created: countSchema,
    updated: countSchema,
    linksAdded: countSchema,
    droppedKeys: z.array(z.string()).readonly(),
    resolved: z.array(GraphResolvedRefSchema).readonly(),
});
/** One entity's curated write. An object `properties` merges top-level keys
 * and a null member removes its key; a null `pin` unpins. */
export const UpdateEntityCommandSchema = z.strictObject({
    userId: IdSchema,
    entityId: PersistentEntityIdSchema,
    name: z.string().nullable().exactOptional(),
    date: z.string().exactOptional(),
    idx: z.string().nullable().exactOptional(),
    properties: JsonValueSchema.exactOptional(),
    pin: z.strictObject({ order: z.int() }).nullable().exactOptional(),
    /** The user's sync choice; only a syncable schema takes it. */
    syncEnabled: z.boolean().exactOptional(),
    indexed: z.boolean().exactOptional(),
});
/** One entity's dictionary patch in a batch update; it merges as `UpdateEntityCommand.properties` does. */
export const PropertiesUpdateSchema = z.strictObject({
    entityId: PersistentEntityIdSchema,
    properties: JsonValueSchema,
});
/** Dictionary patches for entities the caller resolved by id; one entity the
 * caller may not write refuses the whole command. */
export const UpdatePropertiesBatchCommandSchema = z.strictObject({
    userId: IdSchema,
    updates: z.array(PropertiesUpdateSchema).readonly(),
});
