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
    canonicalKey: z.ZodExactOptional<z.ZodString>;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
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
    canonicalKey: z.ZodExactOptional<z.ZodString>;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
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
/** A lookup description the graph resolves inside the batch transaction that
 * applies it: by canonical key, by source key, by id, or as the identity of
 * another reference. */
export declare const GraphRefSchema: z.ZodUnion<readonly [z.ZodObject<{
    kind: z.ZodLiteral<"canonical">;
    schemaId: z.ZodString;
    canonicalKey: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"identity">;
    schemaId: z.ZodString;
    identityRef: typeof GraphRefSchema;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"source">;
    schemaId: z.ZodString;
    externalId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"id">;
    schemaId: z.ZodString;
    id: z.ZodUUID;
}, z.core.$strict>]>;
export type GraphRef = z.output<typeof GraphRefSchema>;
/** An entity its schema's owner declares, created or updated where its
 * reference resolves. */
export declare const GraphEntityDeclarationSchema: z.ZodObject<{
    ref: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>]>;
    schemaVersion: z.ZodInt;
    name: z.ZodNullable<z.ZodString>;
    idx: z.ZodNullable<z.ZodString>;
    date: z.ZodNullable<z.ZodISODateTime>;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type GraphEntityDeclaration = z.output<typeof GraphEntityDeclarationSchema>;
/** A canonical link between two references. */
export declare const GraphLinkDeclarationSchema: z.ZodObject<{
    from: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>;
    to: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>;
    kind: z.ZodString;
    confidence: z.ZodNull;
    metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export type GraphLinkDeclaration = z.output<typeof GraphLinkDeclarationSchema>;
/** The entities and links one owner declares for a batch. */
export declare const GraphOwnerFragmentSchema: z.ZodObject<{
    entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        ref: z.ZodUnion<readonly [z.ZodObject<{
            kind: z.ZodLiteral<"canonical">;
            schemaId: z.ZodString;
            canonicalKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"identity">;
            schemaId: z.ZodString;
            identityRef: typeof GraphRefSchema;
        }, z.core.$strict>]>;
        schemaVersion: z.ZodInt;
        name: z.ZodNullable<z.ZodString>;
        idx: z.ZodNullable<z.ZodString>;
        date: z.ZodNullable<z.ZodISODateTime>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    }, z.core.$strict>>>;
    links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        from: z.ZodUnion<readonly [z.ZodObject<{
            kind: z.ZodLiteral<"canonical">;
            schemaId: z.ZodString;
            canonicalKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"identity">;
            schemaId: z.ZodString;
            identityRef: typeof GraphRefSchema;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"source">;
            schemaId: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"id">;
            schemaId: z.ZodString;
            id: z.ZodUUID;
        }, z.core.$strict>]>;
        to: z.ZodUnion<readonly [z.ZodObject<{
            kind: z.ZodLiteral<"canonical">;
            schemaId: z.ZodString;
            canonicalKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"identity">;
            schemaId: z.ZodString;
            identityRef: typeof GraphRefSchema;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"source">;
            schemaId: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"id">;
            schemaId: z.ZodString;
            id: z.ZodUUID;
        }, z.core.$strict>]>;
        kind: z.ZodString;
        confidence: z.ZodNull;
        metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
            kind: z.ZodLiteral<"canonical">;
            schemaId: z.ZodString;
            canonicalKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"identity">;
            schemaId: z.ZodString;
            identityRef: typeof GraphRefSchema;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"source">;
            schemaId: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"id">;
            schemaId: z.ZodString;
            id: z.ZodUUID;
        }, z.core.$strict>]>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type GraphOwnerFragment = z.output<typeof GraphOwnerFragmentSchema>;
/** A fragment the host collected from an owner's `ensure` answer, under the
 * owner it authenticated; never accepted from a plugin. */
export declare const GraphPreparedFragmentSchema: z.ZodObject<{
    owner: z.ZodString;
    fragment: z.ZodObject<{
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            ref: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>]>;
            schemaVersion: z.ZodInt;
            name: z.ZodNullable<z.ZodString>;
            idx: z.ZodNullable<z.ZodString>;
            date: z.ZodNullable<z.ZodISODateTime>;
            properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        }, z.core.$strict>>>;
        links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            from: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            to: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            kind: z.ZodString;
            confidence: z.ZodNull;
            metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type GraphPreparedFragment = z.output<typeof GraphPreparedFragmentSchema>;
/** What `rpc.ensure` asks a schema's owner: references for these items. */
export declare const EnsureRequestSchema: z.ZodObject<{
    schemaId: z.ZodString;
    items: z.ZodReadonly<z.ZodArray<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>>;
}, z.core.$strict>;
export type EnsureRequest = z.output<typeof EnsureRequestSchema>;
/** What `rpc.ensure` answers its caller: one reference per item, in order,
 * or null for an item the owner refused. */
export declare const EnsureResultSchema: z.ZodObject<{
    refs: z.ZodReadonly<z.ZodArray<z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>>>>;
}, z.core.$strict>;
export type EnsureResult = z.output<typeof EnsureResultSchema>;
/** What an owner's `<schemaId>.ensure` method answers: the references and the
 * fragment that declares them. */
export declare const EnsureHandlerResultSchema: z.ZodObject<{
    refs: z.ZodReadonly<z.ZodArray<z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>>>>;
    fragment: z.ZodObject<{
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            ref: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>]>;
            schemaVersion: z.ZodInt;
            name: z.ZodNullable<z.ZodString>;
            idx: z.ZodNullable<z.ZodString>;
            date: z.ZodNullable<z.ZodISODateTime>;
            properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        }, z.core.$strict>>>;
        links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            from: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            to: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            kind: z.ZodString;
            confidence: z.ZodNull;
            metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type EnsureHandlerResult = z.output<typeof EnsureHandlerResultSchema>;
/** The batch a plugin sends to `applyBatch`. */
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
    fragment: z.ZodExactOptional<z.ZodObject<{
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            ref: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>]>;
            schemaVersion: z.ZodInt;
            name: z.ZodNullable<z.ZodString>;
            idx: z.ZodNullable<z.ZodString>;
            date: z.ZodNullable<z.ZodISODateTime>;
            properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        }, z.core.$strict>>>;
        links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            from: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            to: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            kind: z.ZodString;
            confidence: z.ZodNull;
            metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        idx: z.ZodNullable<z.ZodString>;
        date: z.ZodNullable<z.ZodString>;
        externalId: z.ZodNullable<z.ZodString>;
        properties: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        canonicalKey: z.ZodExactOptional<z.ZodString>;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type GraphBatchInput = z.output<typeof GraphBatchInputSchema>;
/** A whole graph fragment the host applies atomically. */
export declare const GraphBatchSchema: z.ZodObject<{
    prepared: z.ZodExactOptional<z.ZodReadonly<z.ZodArray<z.ZodObject<{
        owner: z.ZodString;
        fragment: z.ZodObject<{
            entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                ref: z.ZodUnion<readonly [z.ZodObject<{
                    kind: z.ZodLiteral<"canonical">;
                    schemaId: z.ZodString;
                    canonicalKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"identity">;
                    schemaId: z.ZodString;
                    identityRef: typeof GraphRefSchema;
                }, z.core.$strict>]>;
                schemaVersion: z.ZodInt;
                name: z.ZodNullable<z.ZodString>;
                idx: z.ZodNullable<z.ZodString>;
                date: z.ZodNullable<z.ZodISODateTime>;
                properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
                syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
            }, z.core.$strict>>>;
            links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                from: z.ZodUnion<readonly [z.ZodObject<{
                    kind: z.ZodLiteral<"canonical">;
                    schemaId: z.ZodString;
                    canonicalKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"identity">;
                    schemaId: z.ZodString;
                    identityRef: typeof GraphRefSchema;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"source">;
                    schemaId: z.ZodString;
                    externalId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"id">;
                    schemaId: z.ZodString;
                    id: z.ZodUUID;
                }, z.core.$strict>]>;
                to: z.ZodUnion<readonly [z.ZodObject<{
                    kind: z.ZodLiteral<"canonical">;
                    schemaId: z.ZodString;
                    canonicalKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"identity">;
                    schemaId: z.ZodString;
                    identityRef: typeof GraphRefSchema;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"source">;
                    schemaId: z.ZodString;
                    externalId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"id">;
                    schemaId: z.ZodString;
                    id: z.ZodUUID;
                }, z.core.$strict>]>;
                kind: z.ZodString;
                confidence: z.ZodNull;
                metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
                declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
                    kind: z.ZodLiteral<"canonical">;
                    schemaId: z.ZodString;
                    canonicalKey: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"identity">;
                    schemaId: z.ZodString;
                    identityRef: typeof GraphRefSchema;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"source">;
                    schemaId: z.ZodString;
                    externalId: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"id">;
                    schemaId: z.ZodString;
                    id: z.ZodUUID;
                }, z.core.$strict>]>>;
                validFrom: z.ZodNullable<z.ZodISODateTime>;
                validUntil: z.ZodNullable<z.ZodISODateTime>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>>>>;
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
    fragment: z.ZodExactOptional<z.ZodObject<{
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            ref: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>]>;
            schemaVersion: z.ZodInt;
            name: z.ZodNullable<z.ZodString>;
            idx: z.ZodNullable<z.ZodString>;
            date: z.ZodNullable<z.ZodISODateTime>;
            properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        }, z.core.$strict>>>;
        links: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            from: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            to: z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>;
            kind: z.ZodString;
            confidence: z.ZodNull;
            metadata: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            declaredBy: z.ZodNullable<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"canonical">;
                schemaId: z.ZodString;
                canonicalKey: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"identity">;
                schemaId: z.ZodString;
                identityRef: typeof GraphRefSchema;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"source">;
                schemaId: z.ZodString;
                externalId: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"id">;
                schemaId: z.ZodString;
                id: z.ZodUUID;
            }, z.core.$strict>]>>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
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
        canonicalKey: z.ZodExactOptional<z.ZodString>;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type GraphBatch = z.output<typeof GraphBatchSchema>;
/** A reference the batch resolved, and whether resolving it created the entity. */
export declare const GraphResolvedRefSchema: z.ZodObject<{
    ref: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"canonical">;
        schemaId: z.ZodString;
        canonicalKey: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"identity">;
        schemaId: z.ZodString;
        identityRef: typeof GraphRefSchema;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"source">;
        schemaId: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"id">;
        schemaId: z.ZodString;
        id: z.ZodUUID;
    }, z.core.$strict>]>;
    id: z.ZodString;
    created: z.ZodBoolean;
}, z.core.$strict>;
export type GraphResolvedRef = z.output<typeof GraphResolvedRefSchema>;
/** What `applyBatch` answers a plugin: batch key to entity id, and counts. */
export declare const GraphBatchResultSchema: z.ZodObject<{
    ids: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodString>>;
    created: z.ZodInt;
    updated: z.ZodInt;
    linksAdded: z.ZodInt;
    droppedKeys: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    resolved: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        ref: z.ZodUnion<readonly [z.ZodObject<{
            kind: z.ZodLiteral<"canonical">;
            schemaId: z.ZodString;
            canonicalKey: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"identity">;
            schemaId: z.ZodString;
            identityRef: typeof GraphRefSchema;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"source">;
            schemaId: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"id">;
            schemaId: z.ZodString;
            id: z.ZodUUID;
        }, z.core.$strict>]>;
        id: z.ZodString;
        created: z.ZodBoolean;
    }, z.core.$strict>>>;
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
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    indexed: z.ZodExactOptional<z.ZodBoolean>;
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