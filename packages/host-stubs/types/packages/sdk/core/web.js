import { z } from "zod";
import { IdSchema } from "./id.js";
import { LinkedEntitySummarySchema } from "./linked-entity.js";
export const WebSearchResultSchema = z.strictObject({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
});
export const WebSearchParamsSchema = z.strictObject({
    query: z.string(),
    limit: z.number().int().min(1),
});
export const WebSearchResultsSchema = z.strictObject({
    query: z.string(),
    results: z.array(WebSearchResultSchema),
});
export const WebLinkListItemSchema = z.strictObject({
    id: IdSchema,
    url: z.string(),
    domain: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    faviconUrl: z.string().nullable().optional(),
    ogImageUrl: z.string().nullable().optional(),
    createdAt: z.string(),
});
export const WebLinkDetailViewSchema = WebLinkListItemSchema.extend({
    hasContent: z.boolean(),
    contentExtractedAt: z.string().nullable(),
    linkedEntities: z.array(LinkedEntitySummarySchema),
});
export const WebLinkOpenResultSchema = z.strictObject({
    id: IdSchema,
    url: z.string(),
    title: z.string().nullable(),
    contentMarkdown: z.string(),
    contentLength: z.number().int().nonnegative(),
    extractedAt: z.string(),
    fromCache: z.boolean(),
});
