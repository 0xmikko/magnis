import { z } from "zod";
/** One embedding model offered by the search service and its local cache state. */
export declare const SearchModelAvailabilitySchema: z.ZodObject<{
    key: z.ZodString;
    downloaded: z.ZodBoolean;
    downloadSize: z.ZodNullable<z.ZodString>;
    diskUsage: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type SearchModelAvailability = z.output<typeof SearchModelAvailabilitySchema>;
//# sourceMappingURL=search-model.d.ts.map