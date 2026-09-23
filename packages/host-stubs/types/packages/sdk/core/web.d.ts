import { z } from "zod";
export declare const WebSearchResultSchema: z.ZodObject<{
    title: z.ZodString;
    url: z.ZodString;
    snippet: z.ZodString;
}, z.core.$strip>;
export type WebSearchResult = z.output<typeof WebSearchResultSchema>;
export declare const WebSearchParamsSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodNumber;
}, z.core.$strip>;
export type WebSearchParams = z.input<typeof WebSearchParamsSchema>;
export declare const WebSearchResultsSchema: z.ZodObject<{
    query: z.ZodString;
    results: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        url: z.ZodString;
        snippet: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WebSearchResults = z.output<typeof WebSearchResultsSchema>;
export declare const WebLinkListItemSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    domain: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ogImageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type WebLinkListItem = z.output<typeof WebLinkListItemSchema>;
export declare const WebLinkDetailViewSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    domain: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ogImageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    hasContent: z.ZodBoolean;
    contentExtractedAt: z.ZodNullable<z.ZodString>;
    linkedEntities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        linkKind: z.ZodString;
        createdAt: z.ZodString;
        data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type WebLinkDetailView = z.output<typeof WebLinkDetailViewSchema>;
export declare const WebLinkOpenResultSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    contentMarkdown: z.ZodString;
    contentLength: z.ZodNumber;
    extractedAt: z.ZodString;
    fromCache: z.ZodBoolean;
}, z.core.$strip>;
export type WebLinkOpenResult = z.output<typeof WebLinkOpenResultSchema>;
//# sourceMappingURL=web.d.ts.map