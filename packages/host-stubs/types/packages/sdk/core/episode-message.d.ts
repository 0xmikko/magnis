import { z } from "zod";
export declare const EpisodeMessageSchema: z.ZodObject<{
    id: z.ZodString;
    episodeId: z.ZodString;
    ordinal: z.ZodInt;
    role: z.ZodString;
    content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolBinding: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        entity: z.ZodString;
        operation: z.ZodString;
    }, z.core.$strict>>>;
    toolCallId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolArgs: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodString;
    createdAt: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type EpisodeMessage = z.output<typeof EpisodeMessageSchema>;
export declare const NewEpisodeMessageSchema: z.ZodObject<{
    status: z.ZodString;
    toolBinding: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        entity: z.ZodString;
        operation: z.ZodString;
    }, z.core.$strict>>>;
    toolCallId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    role: z.ZodString;
    content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolArgs: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    toolResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type NewEpisodeMessage = z.output<typeof NewEpisodeMessageSchema>;
//# sourceMappingURL=episode-message.d.ts.map