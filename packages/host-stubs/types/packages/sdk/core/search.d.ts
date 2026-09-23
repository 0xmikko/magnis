import { z } from "zod";
/** One entity returned by the search capability.
 *
 * `data` is intentionally opaque: its shape is supplied by the entity schema
 * that produced the result, while the envelope itself is a shared Magnis
 * contract. The wire adapter maps the legacy `schema_id`/`link_kind` keys to
 * these canonical properties before validation.
 */
export declare const SearchResultSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    score: z.ZodNumber;
    excerpt: z.ZodOptional<z.ZodString>;
    linkKind: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strip>;
export type SearchResult = z.output<typeof SearchResultSchema>;
export declare const MemoryCandidateSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodString;
    p: z.ZodNumber;
}, z.core.$strip>;
export type MemoryCandidate = z.output<typeof MemoryCandidateSchema>;
export declare const MemoryDiagnosticsSchema: z.ZodObject<{
    totalActive: z.ZodNumber;
    totalRejected: z.ZodNumber;
    totalStale: z.ZodNumber;
    byType: z.ZodRecord<z.ZodString, z.ZodNumber>;
    avgConfidence: z.ZodNumber;
    lastConsolidation: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type MemoryDiagnostics = z.output<typeof MemoryDiagnosticsSchema>;
//# sourceMappingURL=search.d.ts.map