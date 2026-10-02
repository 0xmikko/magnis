import { z } from "zod";
export declare const episodeTodoStatuses: readonly ["pending", "in_progress", "completed", "cancelled"];
export declare const EpisodeTodoStatusSchema: z.ZodEnum<{
    pending: "pending";
    completed: "completed";
    cancelled: "cancelled";
    in_progress: "in_progress";
}>;
export type EpisodeTodoStatus = z.output<typeof EpisodeTodoStatusSchema>;
export declare const EpisodeTodoItemSchema: z.ZodObject<{
    content: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        completed: "completed";
        cancelled: "cancelled";
        in_progress: "in_progress";
    }>;
    externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type EpisodeTodoItem = z.output<typeof EpisodeTodoItemSchema>;
export declare const EpisodeTodoListResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<{
            pending: "pending";
            completed: "completed";
            cancelled: "cancelled";
            in_progress: "in_progress";
        }>;
        externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EpisodeTodoListResult = z.output<typeof EpisodeTodoListResultSchema>;
export declare const EpisodeWorkspaceTodoListRequestSchema: z.ZodObject<{}, z.core.$strip>;
export declare const EpisodeWorkspaceTodoAddRequestSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const EpisodeWorkspaceTodoRemoveRequestSchema: z.ZodObject<{
    id: z.ZodUUID;
}, z.core.$strip>;
export declare const EpisodeWorkspaceTodoUpdateRequestSchema: z.ZodObject<{
    id: z.ZodUUID;
    content: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        completed: "completed";
        cancelled: "cancelled";
        in_progress: "in_progress";
    }>>;
}, z.core.$strip>;
export declare const EpisodeWorkspaceTodoListResultSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<{
            pending: "pending";
            completed: "completed";
            cancelled: "cancelled";
            in_progress: "in_progress";
        }>;
        externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        id: z.ZodUUID;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=episode-todo.d.ts.map