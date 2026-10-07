import { z } from "zod";
import { type Id } from "./id.js";
import { type JsonValue } from "./json.js";
import { type AgentStatement, type DateTimeUtc, type SourceRef } from "./statement.js";
export type EntityId = Id;
export type UserId = Id;
/** A Source as the catalog names it: "telegram", "google". */
export type SourceId = string;
/** One account of a user on one Source, as the Source binding names it. */
export type AccountId = string;
export type SchemaId = string;
export type SchemaVersion = number;
export declare const EntityUpdateStateRequestSchema: z.ZodUnion<readonly [z.ZodObject<{
    entityId: z.ZodGUID;
    pinOrder: z.ZodNonOptional<z.ZodOptional<z.ZodNullable<z.ZodInt>>>;
    archived: z.ZodOptional<z.ZodBoolean>;
    indexed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    entityId: z.ZodGUID;
    pinOrder: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
    archived: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    indexed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    entityId: z.ZodGUID;
    pinOrder: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
    archived: z.ZodOptional<z.ZodBoolean>;
    indexed: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strict>]>;
interface EntityBase<P extends JsonValue = JsonValue> {
    id: EntityId;
    owner: UserId;
    schemaId: SchemaId;
    schemaVersion: SchemaVersion;
    createdAt: DateTimeUtc;
    name: string | null;
    indexed: boolean;
    /** Present only when the registered schema supports synchronization. */
    syncEnabled?: boolean;
    /** Graph-owned decimal revision; accompanies a persisted sync choice. */
    syncRevision?: string;
    date: DateTimeUtc;
    idx: string | null;
    isPinned: boolean | null;
    pinOrder: number | null;
    isArchived: boolean | null;
    properties: P;
}
/** An entity of a schema that supports synchronization: it always carries the
 * user's saved choice and its revision. */
export interface Syncable extends EntityBase {
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
export interface AgentEntity<P extends JsonValue = JsonValue> extends EntityBase<P>, AgentStatement {
    /** The names this identity goes by — "Миша", "Мишка", "Michael I.". Only
     *  on hub-role schemas: contacts.person, companies.company, projects.project. */
    keys: string[];
}
export type Entity<P extends JsonValue = JsonValue> = CanonicalEntity<P> | AgentEntity<P>;
/** The graph-owned decimal revision of a saved sync choice. */
export declare const syncRevisionSchema: z.ZodString;
export declare const entitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    source: z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>;
    canonicalKey: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    syncRevision: z.ZodExactOptional<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    keys: z.ZodArray<z.ZodString>;
    origin: z.ZodLiteral<"agent">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    syncRevision: z.ZodExactOptional<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>], "origin">;
export declare const EntitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    source: z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>;
    canonicalKey: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    syncRevision: z.ZodExactOptional<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    keys: z.ZodArray<z.ZodString>;
    origin: z.ZodLiteral<"agent">;
    confidence: z.ZodNumber;
    evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
    validFrom: z.ZodNullable<z.ZodISODateTime>;
    validUntil: z.ZodNullable<z.ZodISODateTime>;
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
    syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
    syncRevision: z.ZodExactOptional<z.ZodString>;
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>], "origin">;
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
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    }, z.core.$strict>], "origin">;
    links: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
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
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        syncEnabled: z.ZodExactOptional<z.ZodBoolean>;
        syncRevision: z.ZodExactOptional<z.ZodString>;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    }, z.core.$strict>], "origin">;
    link: z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
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
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    linkedEntities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        linkKind: z.ZodString;
        createdAt: z.ZodString;
        data: z.ZodOptional<z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
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
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodString;
        idx: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    links: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
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
            agent: "agent";
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
            agent: "agent";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
    }, z.core.$strict>], "direction">>;
    total: z.ZodNumber;
}, z.core.$strict>;
export type GraphEntityLinks = z.output<typeof GraphEntityLinksSchema>;
export {};
//# sourceMappingURL=entity.d.ts.map