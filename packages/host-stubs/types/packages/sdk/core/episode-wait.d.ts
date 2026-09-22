import { z } from "zod";
export declare const episodeWaitKinds: readonly ["tool_approval", "ask_user", "native_approval", "subagent"];
export declare const EpisodeWaitKindSchema: z.ZodEnum<{
    tool_approval: "tool_approval";
    ask_user: "ask_user";
    native_approval: "native_approval";
    subagent: "subagent";
}>;
export type EpisodeWaitKind = z.output<typeof EpisodeWaitKindSchema>;
export declare const EpisodeWaitSchema: z.ZodObject<{
    id: z.ZodString;
    executionId: z.ZodString;
    kind: z.ZodEnum<{
        tool_approval: "tool_approval";
        ask_user: "ask_user";
        native_approval: "native_approval";
        subagent: "subagent";
    }>;
    request: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type EpisodeWait = z.output<typeof EpisodeWaitSchema>;
export declare const EpisodeWaitListSchema: z.ZodObject<{
    waits: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        executionId: z.ZodString;
        kind: z.ZodEnum<{
            tool_approval: "tool_approval";
            ask_user: "ask_user";
            native_approval: "native_approval";
            subagent: "subagent";
        }>;
        request: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strip>;
export type EpisodeWaitList = z.output<typeof EpisodeWaitListSchema>;
//# sourceMappingURL=episode-wait.d.ts.map