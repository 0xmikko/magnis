import { z } from "zod";
export const JsonPrimitiveSchema = z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
]);
/** Recursive runtime counterpart of {@link JsonValue}. */
export const JsonValueSchema = z.lazy(() => z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
]));
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
