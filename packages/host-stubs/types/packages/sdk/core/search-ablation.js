import { z } from "zod";
import { JsonValueSchema } from "./json.js";
export const searchAblationModelId = "search-ablation-bge-small-en-v1.5";
export const SearchAblationSha256Schema = z
    .string()
    .regex(/^[0-9a-f]{64}$/u);
export const SearchAblationSchemaSchema = z.strictObject({
    id: z.string().min(1),
    version: z.number().int().positive(),
    description: z.string(),
    jsonSchema: JsonValueSchema,
});
export const SearchAblationDeclarationSchema = z.strictObject({
    prefix: z.string().min(1),
    toml: z.string().min(1),
});
export const SearchAblationEntitySchema = z.strictObject({
    ref: z.string().min(1),
    schemaId: z.string().min(1),
    name: z.string().nullable(),
    occurredAt: z.string().nullable(),
    properties: JsonValueSchema,
});
export const SearchAblationLinkSchema = z.strictObject({
    fromRef: z.string().min(1),
    toRef: z.string().min(1),
    kind: z.string().min(1),
});
export const SearchAblationPrepareInputSchema = z.strictObject({
    stateSha256: SearchAblationSha256Schema,
    corpusSha256: z.strictObject({
        p1: SearchAblationSha256Schema,
        p235: SearchAblationSha256Schema,
    }),
    modelId: z.literal(searchAblationModelId),
    schemas: z.array(SearchAblationSchemaSchema).min(1),
    declarations: z.array(SearchAblationDeclarationSchema).min(1),
    entityBatches: z.array(z.array(SearchAblationEntitySchema).min(1)).min(1),
    links: z.array(SearchAblationLinkSchema),
});
export const SearchAblationContextSchema = z.strictObject({
    userId: z.string().min(1),
    generation: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    modelRevision: z.string().min(1),
    dimensions: z.number().int().positive(),
    embeddingProbeSha256: SearchAblationSha256Schema,
    indexPolicyFingerprint: SearchAblationSha256Schema,
    stateSha256: SearchAblationSha256Schema,
    indexed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
});
export const SearchAblationPairInputSchema = z.strictObject({
    caseId: z.string().min(1),
    query: z.string().min(1),
    schemaIds: z.array(z.string().min(1)).min(1),
    typedTool: z.string().min(1),
    typedArguments: JsonValueSchema.nullable(),
    topK: z.number().int().positive(),
    contextByteCap: z.number().int().positive(),
    expectedGeneration: z.number().int().nonnegative(),
});
export const SearchAblationChannelSchema = z.enum([
    "text",
    "semantic",
    "hybrid",
]);
export const SearchAblationHitSchema = z.strictObject({
    ref: z.string().min(1),
    rank: z.number().int().positive(),
    score: z.number().finite(),
    channel: SearchAblationChannelSchema,
    chunkIndex: z.number().int().nonnegative(),
    excerpt: z.string(),
    contextBytes: z.number().int().nonnegative(),
});
export const SearchAblationArmResultSchema = z.strictObject({
    generation: z.number().int().nonnegative(),
    modelId: z.string().min(1),
    modelRevision: z.string().min(1),
    dimensions: z.number().int().positive(),
    embeddingProbeSha256: SearchAblationSha256Schema,
    indexPolicyFingerprint: SearchAblationSha256Schema,
    query: z.string().min(1),
    topK: z.number().int().positive(),
    contextByteCap: z.number().int().positive(),
    hits: z.array(SearchAblationHitSchema),
});
export const SearchAblationPairResultSchema = z.strictObject({
    caseId: z.string().min(1),
    flat: SearchAblationArmResultSchema,
    typed: SearchAblationArmResultSchema,
});
