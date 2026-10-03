import { z } from "zod";
/** One entity returned by the search capability.
 *
 * `data` is intentionally opaque: its shape is supplied by the entity schema
 * that produced the result, while the envelope itself is a shared Magnis
 * contract.
 */
export declare const SearchResultSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    score: z.ZodNumber;
    excerpt: z.ZodOptional<z.ZodString>;
    linkKind: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type SearchResult = z.output<typeof SearchResultSchema>;
export declare const MemoryCandidateSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodString;
    p: z.ZodNumber;
}, z.core.$strict>;
export type MemoryCandidate = z.output<typeof MemoryCandidateSchema>;
export declare const MemoryDiagnosticsSchema: z.ZodObject<{
    totalActive: z.ZodNumber;
    totalRejected: z.ZodNumber;
    totalStale: z.ZodNumber;
    byType: z.ZodRecord<z.ZodString, z.ZodNumber>;
    avgConfidence: z.ZodNumber;
    lastConsolidation: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type MemoryDiagnostics = z.output<typeof MemoryDiagnosticsSchema>;
/** Ranked evidence attached only when a declared search used retrieval. */
export declare const SearchExecutionEvidenceSchema: z.ZodObject<{
    score: z.ZodNumber;
    channel: z.ZodEnum<{
        text: "text";
        semantic: "semantic";
        hybrid: "hybrid";
    }>;
    chunkIndex: z.ZodInt;
    excerpt: z.ZodString;
}, z.core.$strict>;
export type SearchExecutionEvidence = z.output<typeof SearchExecutionEvidenceSchema>;
/** One item of the agent search tool: the entity and, when the search ranked
 * by meaning, why it ranked. A list or a search with no `means` ranks nothing,
 * so its items carry no relevance. */
export declare const EntitySearchItemSchema: z.ZodObject<{
    entity: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
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
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>], "origin">;
    relevance: z.ZodExactOptional<z.ZodObject<{
        score: z.ZodNumber;
        channel: z.ZodEnum<{
            text: "text";
            semantic: "semantic";
            hybrid: "hybrid";
        }>;
        chunkIndex: z.ZodInt;
        excerpt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EntitySearchItem = z.output<typeof EntitySearchItemSchema>;
//# sourceMappingURL=search.d.ts.map