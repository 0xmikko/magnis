import { z } from "zod";
export declare const ToolCallEventSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    args: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strip>;
export type ToolCallEvent = z.output<typeof ToolCallEventSchema>;
export declare const ToolResultEventSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    result: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strip>;
export type ToolResultEvent = z.output<typeof ToolResultEventSchema>;
export declare const ContentBlockSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"thinking">;
    text: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"toolCall">;
    toolCallId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"text">;
    text: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"userMessage">;
    text: z.ZodString;
}, z.core.$strip>], "type">;
export type ContentBlock = z.output<typeof ContentBlockSchema>;
//# sourceMappingURL=tool-event.d.ts.map