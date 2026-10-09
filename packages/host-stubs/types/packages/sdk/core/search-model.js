import { z } from "zod";
/** One embedding model offered by the search service and its local cache state. */
export const SearchModelAvailabilitySchema = z.strictObject({
    key: z.string(),
    downloaded: z.boolean(),
    downloadSize: z.string().nullable(),
    diskUsage: z.string().nullable(),
});
