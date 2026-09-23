import { z } from "zod";
export declare const episodeTodoStatuses: readonly ["pending", "in_progress", "completed", "cancelled"];
export declare const EpisodeTodoStatusSchema: z.ZodEnum<{
    completed: "completed";
    cancelled: "cancelled";
    pending: "pending";
    in_progress: "in_progress";
}>;
export type EpisodeTodoStatus = z.output<typeof EpisodeTodoStatusSchema>;
export declare const EpisodeTodoItemSchema: z.ZodObject<{
    content: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        cancelled: "cancelled";
        pending: "pending";
        in_progress: "in_progress";
    }>;
    externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type EpisodeTodoItem = z.output<typeof EpisodeTodoItemSchema>;
export declare const EpisodeTodoListResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            pending: "pending";
            in_progress: "in_progress";
        }>;
        externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EpisodeTodoListResult = z.output<typeof EpisodeTodoListResultSchema>;
//# sourceMappingURL=episode-todo.d.ts.map