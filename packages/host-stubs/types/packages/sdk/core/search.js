import { z } from "zod";
import { EntitySchema, EntityExtrasSchema } from "./entity.js";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
/** One entity returned by the search capability.
 *
 * `data` is intentionally opaque: its shape is supplied by the entity schema
 * that produced the result, while the envelope itself is a shared Magnis
 * contract.
 */
export const SearchResultSchema = z.strictObject({
    extras: EntityExtrasSchema.exactOptional(),
    id: IdSchema,
    name: z.string().nullable(),
    schemaId: z.string(),
    score: z.number(),
    excerpt: z.string().optional(),
    linkKind: z.string().optional(),
    data: JsonValueSchema.optional(),
});
export const MemoryCandidateSchema = z.strictObject({
    id: IdSchema,
    from: IdSchema,
    to: IdSchema,
    kind: z.string(),
    p: z.number().min(0).max(1),
});
export const MemoryDiagnosticsSchema = z.strictObject({
    totalActive: z.number().int().nonnegative(),
    totalRejected: z.number().int().nonnegative(),
    totalStale: z.number().int().nonnegative(),
    byType: z.record(z.string(), z.number().int().nonnegative()),
    avgConfidence: z.number(),
    lastConsolidation: z.string().nullable(),
});
/** Ranked evidence attached only when a declared search used retrieval. */
export const SearchExecutionEvidenceSchema = z.strictObject({
    score: z.number(),
    channel: z.enum(["semantic", "text", "hybrid"]),
    chunkIndex: z.int().nonnegative(),
    excerpt: z.string(),
});
/** One item of the agent search tool: the entity and, when the search ranked
 * by meaning, why it ranked. A list or a search with no `means` ranks nothing,
 * so its items carry no relevance. */
export const EntitySearchItemSchema = z.strictObject({
    entity: EntitySchema,
    extras: EntityExtrasSchema.exactOptional(),
    relevance: SearchExecutionEvidenceSchema.exactOptional(),
});
