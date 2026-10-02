/** Graph writes: the batch a plugin sends, the batch the host applies once it
 * stamped each entity, and the entity updates the graph service takes. */
import { z } from "zod";
/** An entity as a plugin sends it, before the host stamps its version and source. */
export declare const BatchEntityInputSchema: z.ZodObject<{
    key: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    idx: z.ZodNullable<z.ZodString>;
    date: z.ZodNullable<z.ZodString>;
    externalId: z.ZodNullable<z.ZodString>;
    properties: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type BatchEntityInput = z.output<typeof BatchEntityInputSchema>;
/** An entity as the host applies it. `source` is null for a curated write. */
export declare const BatchEntitySchema: z.ZodObject<{
    schemaVersion: z.ZodInt;
    source: z.ZodNullable<z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>>;
    key: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    idx: z.ZodNullable<z.ZodString>;
    date: z.ZodNullable<z.ZodString>;
    externalId: z.ZodNullable<z.ZodString>;
    properties: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type BatchEntity = z.output<typeof BatchEntitySchema>;
/** A pre-existing entity that links point to, resolved by its `externalId` and
 * never created; a ref that resolves to nothing drops its links. */
export declare const BatchRefSchema: z.ZodObject<{
    key: z.ZodString;
    externalId: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type BatchRef = z.output<typeof BatchRefSchema>;
/** A link wiring two batch keys. `declaredBy` is the key of the batch item
 * whose mapper emitted it. */
export declare const BatchLinkSchema: z.ZodObject<{
    fromKey: z.ZodString;
    toKey: z.ZodString;
    kind: z.ZodString;
    confidence: z.ZodNullable<z.ZodNumber>;
    metadata: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    declaredBy: z.ZodNullable<z.ZodString>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type BatchLink = z.output<typeof BatchLinkSchema>;
/** The batch a plugin sends to `apply_batch`. */
export declare const GraphBatchInputSchema: z.ZodObject<{
    refs: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        externalId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>>;
    links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        fromKey: z.ZodString;
        toKey: z.ZodString;
        kind: z.ZodString;
        confidence: z.ZodNullable<z.ZodNumber>;
        metadata: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        declaredBy: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>>>;
    entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        idx: z.ZodNullable<z.ZodString>;
        date: z.ZodNullable<z.ZodString>;
        externalId: z.ZodNullable<z.ZodString>;
        properties: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type GraphBatchInput = z.output<typeof GraphBatchInputSchema>;
/** A whole graph fragment the host applies atomically. */
export declare const GraphBatchSchema: z.ZodObject<{
    refs: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        externalId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>>;
    links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        fromKey: z.ZodString;
        toKey: z.ZodString;
        kind: z.ZodString;
        confidence: z.ZodNullable<z.ZodNumber>;
        metadata: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        declaredBy: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>>>;
    entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        schemaVersion: z.ZodInt;
        source: z.ZodNullable<z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>>;
        key: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        idx: z.ZodNullable<z.ZodString>;
        date: z.ZodNullable<z.ZodString>;
        externalId: z.ZodNullable<z.ZodString>;
        properties: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type GraphBatch = z.output<typeof GraphBatchSchema>;
/** What `apply_batch` answers a plugin: batch key to entity id, and counts. */
export declare const GraphBatchResultSchema: z.ZodObject<{
    ids: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
    created: z.ZodInt;
    updated: z.ZodInt;
    linksAdded: z.ZodInt;
    droppedKeys: z.ZodReadonly<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type GraphBatchResult = z.output<typeof GraphBatchResultSchema>;
/** One entity's curated write. An object `properties` merges top-level keys
 * and a null member removes its key; a null `pin` unpins. */
export declare const UpdateEntityCommandSchema: z.ZodObject<{
    userId: z.ZodString;
    entityId: z.ZodString;
    name: z.ZodExactOptional<z.ZodNullable<z.ZodString>>;
    date: z.ZodExactOptional<z.ZodString>;
    idx: z.ZodExactOptional<z.ZodNullable<z.ZodString>>;
    properties: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    pin: z.ZodExactOptional<z.ZodNullable<z.ZodObject<{
        order: z.ZodNullable<z.ZodInt>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type UpdateEntityCommand = z.output<typeof UpdateEntityCommandSchema>;
/** One entity's dictionary patch in a batch update; it merges as `UpdateEntityCommand.properties` does. */
export declare const PropertiesUpdateSchema: z.ZodObject<{
    entityId: z.ZodString;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type PropertiesUpdate = z.output<typeof PropertiesUpdateSchema>;
/** Dictionary patches for entities the caller resolved by id; one entity the
 * caller may not write refuses the whole command. */
export declare const UpdatePropertiesBatchCommandSchema: z.ZodObject<{
    userId: z.ZodString;
    updates: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type UpdatePropertiesBatchCommand = z.output<typeof UpdatePropertiesBatchCommandSchema>;
//# sourceMappingURL=graph-commands.d.ts.map