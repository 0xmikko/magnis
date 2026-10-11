import { z } from "zod";
/** Default number of rows returned by a general list contract. */
export const pageLimitDefault = 50;
/** Maximum number of rows accepted by a general list contract. */
export const pageLimitMax = 200;
export const PageLimitSchema = z
    .int()
    .min(1)
    .max(pageLimitMax)
    .default(pageLimitDefault);
export const PageOffsetSchema = z.int().min(0).default(0);
export const PaginationSchema = z.strictObject({
    limit: PageLimitSchema,
    offset: PageOffsetSchema,
});
/** Create the canonical paginated response schema for one item type. */
export function paginatedResponseSchema(itemSchema) {
    return z.strictObject({
        items: z.array(itemSchema),
        total: z.int().min(0),
        limit: z.int().min(1),
        offset: z.int().min(0),
    });
}
/** Create a named endpoint-specific limit without changing the general limit. */
export function boundedPageLimit(maximum, fallback) {
    return z.int().min(1).max(maximum).default(fallback);
}
