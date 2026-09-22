import { z } from "zod";
/** Default number of rows returned by a general list contract. */
export declare const pageLimitDefault = 50;
/** Maximum number of rows accepted by a general list contract. */
export declare const pageLimitMax = 200;
export declare const PageLimitSchema: z.ZodDefault<z.ZodInt>;
export declare const PageOffsetSchema: z.ZodDefault<z.ZodInt>;
export declare const PaginationSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodInt>;
    offset: z.ZodDefault<z.ZodInt>;
}, z.core.$strip>;
export type PaginationParams = z.input<typeof PaginationSchema>;
export type Pagination = z.output<typeof PaginationSchema>;
/** Create the canonical paginated response schema for one item type. */
export declare function paginatedResponseSchema<const ItemSchema extends z.ZodType>(itemSchema: ItemSchema): z.ZodObject<{
    items: z.ZodArray<ItemSchema>;
    total: z.ZodInt;
    limit: z.ZodInt;
    offset: z.ZodInt;
}, z.core.$strip>;
export type PaginatedResponse<Item> = z.output<ReturnType<typeof paginatedResponseSchema<z.ZodType<Item>>>>;
/** Create a named endpoint-specific limit without changing the general limit. */
export declare function boundedPageLimit(maximum: number, fallback: number): z.ZodType<number>;
//# sourceMappingURL=pagination.d.ts.map