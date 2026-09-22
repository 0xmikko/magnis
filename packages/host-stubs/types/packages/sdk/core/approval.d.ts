import { z } from "zod";
export interface EntityOperationBinding {
    readonly entity: string;
    readonly operation: string;
}
export declare const EntityOperationBindingSchema: z.ZodObject<{
    entity: z.ZodString;
    operation: z.ZodString;
}, z.core.$strict>;
export declare const approvalStatuses: readonly ["pending", "approved", "denied"];
export declare const ApprovalStatusSchema: z.ZodEnum<{
    pending: "pending";
    approved: "approved";
    denied: "denied";
}>;
export type ApprovalStatus = z.output<typeof ApprovalStatusSchema>;
export declare const PendingToolCallSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    toolBinding: z.ZodOptional<z.ZodObject<{
        entity: z.ZodString;
        operation: z.ZodString;
    }, z.core.$strict>>;
    args: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    approvalId: z.ZodOptional<z.ZodString>;
    chatName: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        pending: "pending";
        approved: "approved";
        denied: "denied";
    }>;
}, z.core.$strip>;
export type PendingToolCall = z.output<typeof PendingToolCallSchema>;
export declare const ApprovalDecisionSchema: z.ZodObject<{
    toolCallId: z.ZodString;
    status: z.ZodEnum<{
        approved: "approved";
        denied: "denied";
    }>;
    toolName: z.ZodString;
    args: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    result: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strip>;
export type ApprovalDecision = z.output<typeof ApprovalDecisionSchema>;
//# sourceMappingURL=approval.d.ts.map