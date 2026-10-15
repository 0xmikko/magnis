import { z } from "zod";
import { linkStatementProjectionShape } from "./link.js";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
/** A compact projection of an entity attached to another read model. */
export const LinkedEntitySummarySchema = z.strictObject({
    ...linkStatementProjectionShape,
    id: IdSchema,
    name: z.string().nullable(),
    schemaId: z.string(),
    linkKind: z.string(),
    direction: z.enum(["out", "in"]),
    createdAt: z.string(),
    data: JsonValueSchema.optional(),
});
