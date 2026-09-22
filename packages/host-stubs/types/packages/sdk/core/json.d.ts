import { z } from "zod";
/** A JSON scalar. */
export type JsonPrimitive = null | boolean | number | string;
/** A JSON object with recursively JSON-safe values. */
export type JsonObject = {
    readonly [key: string]: JsonValue;
};
/** An arbitrary JSON payload. */
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export declare const JsonPrimitiveSchema: z.ZodUnion<readonly [z.ZodNull, z.ZodBoolean, z.ZodNumber, z.ZodString]>;
/** Recursive runtime counterpart of {@link JsonValue}. */
export declare const JsonValueSchema: z.ZodType<JsonValue>;
export declare const JsonObjectSchema: z.ZodType<JsonObject>;
//# sourceMappingURL=json.d.ts.map