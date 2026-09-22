import { z } from "zod";
export declare const searchAblationModelId = "search-ablation-bge-small-en-v1.5";
export declare const SearchAblationSha256Schema: z.ZodString;
export declare const SearchAblationSchemaSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodNumber;
    description: z.ZodString;
    jsonSchema: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type SearchAblationSchema = z.output<typeof SearchAblationSchemaSchema>;
export declare const SearchAblationDeclarationSchema: z.ZodObject<{
    prefix: z.ZodString;
    toml: z.ZodString;
}, z.core.$strict>;
export type SearchAblationDeclaration = z.output<typeof SearchAblationDeclarationSchema>;
export declare const SearchAblationEntitySchema: z.ZodObject<{
    ref: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    occurredAt: z.ZodNullable<z.ZodString>;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type SearchAblationEntity = z.output<typeof SearchAblationEntitySchema>;
export declare const SearchAblationLinkSchema: z.ZodObject<{
    fromRef: z.ZodString;
    toRef: z.ZodString;
    kind: z.ZodString;
}, z.core.$strict>;
export type SearchAblationLink = z.output<typeof SearchAblationLinkSchema>;
export declare const SearchAblationPrepareInputSchema: z.ZodObject<{
    stateSha256: z.ZodString;
    corpusSha256: z.ZodObject<{
        p1: z.ZodString;
        p235: z.ZodString;
    }, z.core.$strict>;
    modelId: z.ZodLiteral<"search-ablation-bge-small-en-v1.5">;
    schemas: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        version: z.ZodNumber;
        description: z.ZodString;
        jsonSchema: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>>;
    declarations: z.ZodArray<z.ZodObject<{
        prefix: z.ZodString;
        toml: z.ZodString;
    }, z.core.$strict>>;
    entityBatches: z.ZodArray<z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        occurredAt: z.ZodNullable<z.ZodString>;
        properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>>>;
    links: z.ZodArray<z.ZodObject<{
        fromRef: z.ZodString;
        toRef: z.ZodString;
        kind: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SearchAblationPrepareInput = z.output<typeof SearchAblationPrepareInputSchema>;
export declare const SearchAblationContextSchema: z.ZodObject<{
    userId: z.ZodString;
    generation: z.ZodNumber;
    modelId: z.ZodString;
    modelRevision: z.ZodString;
    dimensions: z.ZodNumber;
    embeddingProbeSha256: z.ZodString;
    indexPolicyFingerprint: z.ZodString;
    stateSha256: z.ZodString;
    indexed: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strict>;
export type SearchAblationContext = z.output<typeof SearchAblationContextSchema>;
export declare const SearchAblationPairInputSchema: z.ZodObject<{
    caseId: z.ZodString;
    query: z.ZodString;
    schemaIds: z.ZodArray<z.ZodString>;
    typedTool: z.ZodString;
    typedArguments: z.ZodNullable<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    topK: z.ZodNumber;
    contextByteCap: z.ZodNumber;
    expectedGeneration: z.ZodNumber;
}, z.core.$strict>;
export type SearchAblationPairInput = z.output<typeof SearchAblationPairInputSchema>;
export declare const SearchAblationChannelSchema: z.ZodEnum<{
    text: "text";
    semantic: "semantic";
    hybrid: "hybrid";
}>;
export type SearchAblationChannel = z.output<typeof SearchAblationChannelSchema>;
export declare const SearchAblationHitSchema: z.ZodObject<{
    ref: z.ZodString;
    rank: z.ZodNumber;
    score: z.ZodNumber;
    channel: z.ZodEnum<{
        text: "text";
        semantic: "semantic";
        hybrid: "hybrid";
    }>;
    chunkIndex: z.ZodNumber;
    excerpt: z.ZodString;
    contextBytes: z.ZodNumber;
}, z.core.$strict>;
export type SearchAblationHit = z.output<typeof SearchAblationHitSchema>;
export declare const SearchAblationArmResultSchema: z.ZodObject<{
    generation: z.ZodNumber;
    modelId: z.ZodString;
    modelRevision: z.ZodString;
    dimensions: z.ZodNumber;
    embeddingProbeSha256: z.ZodString;
    indexPolicyFingerprint: z.ZodString;
    query: z.ZodString;
    topK: z.ZodNumber;
    contextByteCap: z.ZodNumber;
    hits: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        rank: z.ZodNumber;
        score: z.ZodNumber;
        channel: z.ZodEnum<{
            text: "text";
            semantic: "semantic";
            hybrid: "hybrid";
        }>;
        chunkIndex: z.ZodNumber;
        excerpt: z.ZodString;
        contextBytes: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SearchAblationArmResult = z.output<typeof SearchAblationArmResultSchema>;
export declare const SearchAblationPairResultSchema: z.ZodObject<{
    caseId: z.ZodString;
    flat: z.ZodObject<{
        generation: z.ZodNumber;
        modelId: z.ZodString;
        modelRevision: z.ZodString;
        dimensions: z.ZodNumber;
        embeddingProbeSha256: z.ZodString;
        indexPolicyFingerprint: z.ZodString;
        query: z.ZodString;
        topK: z.ZodNumber;
        contextByteCap: z.ZodNumber;
        hits: z.ZodArray<z.ZodObject<{
            ref: z.ZodString;
            rank: z.ZodNumber;
            score: z.ZodNumber;
            channel: z.ZodEnum<{
                text: "text";
                semantic: "semantic";
                hybrid: "hybrid";
            }>;
            chunkIndex: z.ZodNumber;
            excerpt: z.ZodString;
            contextBytes: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    typed: z.ZodObject<{
        generation: z.ZodNumber;
        modelId: z.ZodString;
        modelRevision: z.ZodString;
        dimensions: z.ZodNumber;
        embeddingProbeSha256: z.ZodString;
        indexPolicyFingerprint: z.ZodString;
        query: z.ZodString;
        topK: z.ZodNumber;
        contextByteCap: z.ZodNumber;
        hits: z.ZodArray<z.ZodObject<{
            ref: z.ZodString;
            rank: z.ZodNumber;
            score: z.ZodNumber;
            channel: z.ZodEnum<{
                text: "text";
                semantic: "semantic";
                hybrid: "hybrid";
            }>;
            chunkIndex: z.ZodNumber;
            excerpt: z.ZodString;
            contextBytes: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type SearchAblationPairResult = z.output<typeof SearchAblationPairResultSchema>;
//# sourceMappingURL=search-ablation.d.ts.map