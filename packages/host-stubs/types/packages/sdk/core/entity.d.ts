import { z } from "zod";
import { type Id } from "./id.js";
import { type JsonValue } from "./json.js";
import { type AgentStatement, type DateTimeUtc, type SourceRef } from "./statement.js";
export type EntityId = Id;
export type UserId = Id;
export type SchemaId = string;
export type SchemaVersion = number;
interface EntityBase<P extends JsonValue = JsonValue> {
    id: EntityId;
    owner: UserId;
    schemaId: SchemaId;
    schemaVersion: SchemaVersion;
    createdAt: DateTimeUtc;
    name: string | null;
    indexed: boolean;
    date: DateTimeUtc;
    idx: string | null;
    isPinned: boolean | null;
    pinOrder: number | null;
    isArchived: boolean | null;
    properties: P;
}
/** An entity a connector delivered. Its names are its declared fields; its
 *  provenance is `source`, the connector's stamp —
 *  { source: "mock-gmail", account, externalId } — which 3756 of
 *  the 3757 entities in the bench world already carry. It has no statement:
 *  a record is not a claim. */
export interface CanonicalEntity<P extends JsonValue = JsonValue> extends EntityBase<P> {
    origin: "canonical";
    source: SourceRef;
}
/** An entity a model created: a project nobody named, an organisation living
 *  only in prose, a person known only by a nickname. Its names live in keys. */
export interface AgentEntity<P extends JsonValue = JsonValue> extends EntityBase<P>, AgentStatement {
    /** The names this identity goes by — "Миша", "Мишка", "Michael I.". Only
     *  on hub-role schemas: contacts.person, companies.company, projects.project. */
    keys: string[];
}
export type Entity<P extends JsonValue = JsonValue> = CanonicalEntity<P> | AgentEntity<P>;
export declare const entitySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    origin: z.ZodLiteral<"canonical">;
    source: z.ZodObject<{
        source: z.ZodString;
        account: z.ZodString;
        externalId: z.ZodString;
    }, z.core.$strict>;
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
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
    id: z.ZodString;
    owner: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
    createdAt: z.ZodISODateTime;
    name: z.ZodNullable<z.ZodString>;
    indexed: z.ZodBoolean;
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
    date: z.ZodISODateTime;
    idx: z.ZodNullable<z.ZodString>;
    isPinned: z.ZodNullable<z.ZodBoolean>;
    pinOrder: z.ZodNullable<z.ZodNumber>;
    isArchived: z.ZodNullable<z.ZodBoolean>;
    properties: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
}, z.core.$strict>], "origin">;
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EntityDetail = z.output<typeof EntityDetailSchema>;
export declare const EntitySearchHitSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
}, z.core.$strip>;
export type EntitySearchHit = z.output<typeof EntitySearchHitSchema>;
export declare const EntitySearchResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EntitySearchResult = z.output<typeof EntitySearchResultSchema>;
export declare const EntityBriefSchema: z.ZodObject<{
    id: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    date: z.ZodString;
    idx: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
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
    }, z.core.$strip>>;
    total: z.ZodNumber;
    hasMore: z.ZodBoolean;
}, z.core.$strip>;
export type GraphEntityPage = z.output<typeof GraphEntityPageSchema>;
/** Bounded graph.get projection. */
export declare const GraphEntityDetailSchema: z.ZodObject<{
    entity: z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        date: z.ZodString;
        idx: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
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
    }, z.core.$strip>>;
    linkCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
    linksTotal: z.ZodNumber;
    linksHasMore: z.ZodBoolean;
}, z.core.$strip>;
export type GraphEntityDetail = z.output<typeof GraphEntityDetailSchema>;
/** Relationship projection returned by graph.entity.links. */
export declare const GraphEntityLinksSchema: z.ZodObject<{
    entityId: z.ZodString;
    links: z.ZodArray<z.ZodObject<{
        direction: z.ZodEnum<{
            from: "from";
            to: "to";
        }>;
        kind: z.ZodString;
        targetId: z.ZodOptional<z.ZodString>;
        targetName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sourceId: z.ZodOptional<z.ZodString>;
        sourceName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export type GraphEntityLinks = z.output<typeof GraphEntityLinksSchema>;
export {};
//# sourceMappingURL=entity.d.ts.map