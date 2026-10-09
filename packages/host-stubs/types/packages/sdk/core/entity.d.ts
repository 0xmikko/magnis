import { z } from "zod";
import { type EntityId, type NilId, type PersistentEntityId } from "./id.js";
import { type JsonValue } from "./json.js";
import { type DerivedStatement, type DateTimeUtc, type SourceRef } from "./statement.js";
export { EntityIdSchema, PersistentEntityIdSchema } from "./id.js";
export type { EntityId, PersistentEntityId } from "./id.js";
export type UserId = PersistentEntityId;
/** A Source as the catalog names it: "telegram", "google". */
export type SourceId = string;
/** One account of a user on one Source, as the Source binding names it. */
export type AccountId = string;
export type SchemaId = string;
export type SchemaVersion = number;
export declare const EntityUpdateStateRequestSchema: z.ZodUnion<readonly [z.ZodObject<{
    entityId: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    pinOrder: z.ZodNonOptional<z.ZodOptional<z.ZodNullable<z.ZodInt>>>;
    archived: z.ZodOptional<z.ZodBoolean>;
    indexed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    entityId: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    pinOrder: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
    archived: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    indexed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    entityId: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    pinOrder: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
    archived: z.ZodOptional<z.ZodBoolean>;
    indexed: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strict>]>;
interface EntityBase<P extends JsonValue = JsonValue> {
    id: EntityId;
    schemaId: SchemaId;
    schemaVersion: SchemaVersion;
    createdAt: DateTimeUtc;
    name: string | null;
    date: DateTimeUtc;
    idx: string | null;
    properties: P;
}
/** A saved sync choice and the graph-owned decimal revision of that choice. */
export interface Syncable {
    syncEnabled: boolean;
    syncRevision: string;
}
/** An entity a connector delivered. Its names are its declared fields; its
 *  provenance is `source`, the connector's stamp —
 *  { source: "mock-gmail", account, externalId } — which 3756 of
 *  the 3757 entities in the bench world already carry. It has no statement:
 *  a record is not a claim. */
export interface CanonicalEntity<P extends JsonValue = JsonValue> extends EntityBase<P> {
    origin: "canonical";
    source: SourceRef;
    /** Exact module-owned key; null when this record has no canonical key. */
    canonicalKey: string | null;
}
/** An entity a model created: a project nobody named, an organisation living
 *  only in prose, a person known only by a nickname. Its names live in keys. */
export interface DerivedEntity<P extends JsonValue = JsonValue> extends EntityBase<P>, DerivedStatement {
    /** The names this identity goes by — "Миша", "Мишка", "Michael I.". Only
     *  on hub-role schemas: contacts.person, companies.company, projects.project. */
    keys: string[];
}
export type Entity<P extends JsonValue = JsonValue> = CanonicalEntity<P> | DerivedEntity<P>;
export type PersistentEntity<P extends JsonValue = JsonValue> = Entity<P> & {
    id: PersistentEntityId;
};
export type TransientEntity<P extends JsonValue = JsonValue> = Entity<P> & {
    id: NilId;
};
/** The graph-owned decimal revision of a saved sync choice. */
export declare const SyncRevisionSchema: z.ZodString;
export declare const EntitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    source: z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>;
    canonicalKey: z.ZodNullable<z.ZodString>;
    id: z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">, z.ZodLiteral<"00000000-0000-0000-0000-000000000000">]>;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    keys: z.ZodArray<z.ZodString>;
    origin: z.ZodLiteral<"derived">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">, z.ZodLiteral<"00000000-0000-0000-0000-000000000000">]>;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>], "origin">;
/** Storage and graph reads cannot return the unsaved sentinel. */
export declare const PersistentEntitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    source: z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>;
    canonicalKey: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
}, z.core.$strict>, z.ZodObject<{
    keys: z.ZodArray<z.ZodString>;
    origin: z.ZodLiteral<"derived">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
}, z.core.$strict>], "origin">;
/** The existing graph_index outcome vocabulary; never a processing permission. */
export declare const IndexingStatusSchema: z.ZodEnum<{
    indexed: "indexed";
    pending: "pending";
    refused: "refused";
}>;
export type IndexingStatus = z.output<typeof IndexingStatusSchema>;
export interface EntityExtrasBase {
    pinOrder: number | null;
    archived: boolean;
    private: boolean;
    readonly indexed: IndexingStatus;
}
export type EntityExtras = EntityExtrasBase & (Syncable | {
    syncEnabled: null;
    syncRevision: null;
});
/** Required flat fields. Unsupported sync is two nulls; half pairs are invalid. */
export declare const EntityExtrasSchema: z.ZodUnion<readonly [z.ZodObject<{
    syncEnabled: z.ZodBoolean;
    syncRevision: z.ZodString;
    pinOrder: z.ZodNullable<z.ZodInt>;
    archived: z.ZodBoolean;
    private: z.ZodBoolean;
    indexed: z.ZodEnum<{
        indexed: "indexed";
        pending: "pending";
        refused: "refused";
    }>;
}, z.core.$strict>, z.ZodObject<{
    syncEnabled: z.ZodNull;
    syncRevision: z.ZodNull;
    pinOrder: z.ZodNullable<z.ZodInt>;
    archived: z.ZodBoolean;
    private: z.ZodBoolean;
    indexed: z.ZodEnum<{
        indexed: "indexed";
        pending: "pending";
        refused: "refused";
    }>;
}, z.core.$strict>]>;
export interface EntityRead<P extends JsonValue = JsonValue> {
    entity: PersistentEntity<P>;
    extras: EntityExtras;
}
export declare const EntityReadSchema: z.ZodObject<{
    entity: z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        canonicalKey: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"derived">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>], "origin">;
    extras: z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>;
}, z.core.$strict>;
/** No option means a domain-only read. */
export declare const EntityReadOptionsSchema: z.ZodObject<{
    extras: z.ZodExactOptional<z.ZodLiteral<true>>;
}, z.core.$strict>;
/** An entity with the links a plugin read asked for. */
export declare const EntityWithLinksSchema: z.ZodObject<{
    entity: z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        canonicalKey: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"derived">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>], "origin">;
    extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>>;
    links: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"derived">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin">>>;
}, z.core.$strict>;
export type EntityWithLinks = z.output<typeof EntityWithLinksSchema>;
/** One row of a plugin's linked window: the entity and the link that reached it. */
export declare const LinkedEntitySchema: z.ZodObject<{
    entity: z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        canonicalKey: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"derived">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        id: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
    }, z.core.$strict>], "origin">;
    extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>>;
    link: z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"derived">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">], z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        to: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin">;
}, z.core.$strict>;
export type LinkedEntity = z.output<typeof LinkedEntitySchema>;
/** The index-backed entity columns a filter or an order names. The words are
 * values, not keys, and keep their spelling. */
export declare const EntityColSchema: z.ZodEnum<{
    name: "name";
    date: "date";
    idx: "idx";
    origin: "origin";
    confidence: "confidence";
    created_at: "created_at";
    is_pinned: "is_pinned";
    pin_order: "pin_order";
    valid_from: "valid_from";
    valid_until: "valid_until";
}>;
export type EntityCol = z.output<typeof EntityColSchema>;
/** Graph read projection with neighbouring entities. */
export declare const EntityDetailSchema: z.ZodObject<{
    id: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    linkedEntities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        linkKind: z.ZodString;
        direction: z.ZodEnum<{
            in: "in";
            out: "out";
        }>;
        createdAt: z.ZodString;
        data: z.ZodOptional<z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            derived: "derived";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EntityDetail = z.output<typeof EntityDetailSchema>;
export declare const EntitySearchHitSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
}, z.core.$strict>;
export type EntitySearchHit = z.output<typeof EntitySearchHitSchema>;
export declare const EntitySearchResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EntitySearchResult = z.output<typeof EntitySearchResultSchema>;
export declare const EntityBriefSchema: z.ZodObject<{
    extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>>;
    id: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodString;
    idx: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type EntityBrief = z.output<typeof EntityBriefSchema>;
/** Paged graph read result used by graph.find/search/links. */
export declare const GraphEntityPageSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
            syncEnabled: z.ZodBoolean;
            syncRevision: z.ZodString;
            pinOrder: z.ZodNullable<z.ZodInt>;
            archived: z.ZodBoolean;
            private: z.ZodBoolean;
            indexed: z.ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            syncEnabled: z.ZodNull;
            syncRevision: z.ZodNull;
            pinOrder: z.ZodNullable<z.ZodInt>;
            archived: z.ZodBoolean;
            private: z.ZodBoolean;
            indexed: z.ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, z.core.$strict>]>>;
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodString;
        idx: z.ZodNullable<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    total: z.ZodNumber;
    hasMore: z.ZodBoolean;
}, z.core.$strict>;
export type GraphEntityPage = z.output<typeof GraphEntityPageSchema>;
/** Bounded graph.get projection. */
export declare const GraphEntityDetailSchema: z.ZodObject<{
    entity: z.ZodObject<{
        extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
            syncEnabled: z.ZodBoolean;
            syncRevision: z.ZodString;
            pinOrder: z.ZodNullable<z.ZodInt>;
            archived: z.ZodBoolean;
            private: z.ZodBoolean;
            indexed: z.ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            syncEnabled: z.ZodNull;
            syncRevision: z.ZodNull;
            pinOrder: z.ZodNullable<z.ZodInt>;
            archived: z.ZodBoolean;
            private: z.ZodBoolean;
            indexed: z.ZodEnum<{
                indexed: "indexed";
                pending: "pending";
                refused: "refused";
            }>;
        }, z.core.$strict>]>>;
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodString;
        idx: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    extras: z.ZodExactOptional<z.ZodUnion<readonly [z.ZodObject<{
        syncEnabled: z.ZodBoolean;
        syncRevision: z.ZodString;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        syncEnabled: z.ZodNull;
        syncRevision: z.ZodNull;
        pinOrder: z.ZodNullable<z.ZodInt>;
        archived: z.ZodBoolean;
        private: z.ZodBoolean;
        indexed: z.ZodEnum<{
            indexed: "indexed";
            pending: "pending";
            refused: "refused";
        }>;
    }, z.core.$strict>]>>;
    links: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            derived: "derived";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        kind: z.ZodString;
    }, z.core.$strict>>;
    linkCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    linksTotal: z.ZodNumber;
    linksHasMore: z.ZodBoolean;
}, z.core.$strict>;
export type GraphEntityDetail = z.output<typeof GraphEntityDetailSchema>;
/** Relationship projection returned by graph.entity.links. */
export declare const GraphEntityLinksSchema: z.ZodObject<{
    entityId: z.ZodString;
    links: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        direction: z.ZodLiteral<"from">;
        kind: z.ZodString;
        targetId: z.ZodString;
        targetName: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            derived: "derived";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        direction: z.ZodLiteral<"to">;
        kind: z.ZodString;
        sourceId: z.ZodString;
        sourceName: z.ZodNullable<z.ZodString>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            derived: "derived";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
    }, z.core.$strict>], "direction">>;
    total: z.ZodNumber;
}, z.core.$strict>;
export type GraphEntityLinks = z.output<typeof GraphEntityLinksSchema>;
//# sourceMappingURL=entity.d.ts.map