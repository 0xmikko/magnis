import { z } from "zod";
/** A stored subagent as the host answers it: a missing description or system
 * prompt is omitted, and the stored avatar colour is a presentation preference
 * the answer does not carry. */
export declare const SubagentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    systemPrompt: z.ZodOptional<z.ZodString>;
    status: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type Subagent = z.output<typeof SubagentSchema>;
export declare const NewSubagentSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type NewSubagent = z.input<typeof NewSubagentSchema>;
export declare const UpdateSubagentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    systemPrompt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type UpdateSubagent = z.input<typeof UpdateSubagentSchema>;
//# sourceMappingURL=subagent.d.ts.map