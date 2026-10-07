import { z } from "zod";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
export const EntityOperationBindingSchema = z.strictObject({
    entity: z.string().min(1),
    operation: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/),
});
export const approvalStatuses = ["pending", "approved", "denied"];
export const ApprovalStatusSchema = z.enum(approvalStatuses);
export const PendingToolCallSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    // @tested-by: tst_bts_tools_wire_004
    toolBinding: EntityOperationBindingSchema.optional(),
    args: JsonValueSchema,
    approvalId: IdSchema.optional(),
    chatName: z.string().optional(),
    status: ApprovalStatusSchema,
});
export const ApprovalDecisionSchema = z.strictObject({
    toolCallId: IdSchema,
    status: z.enum(["approved", "denied"]),
    toolName: z.string(),
    args: JsonValueSchema,
    result: JsonValueSchema.optional(),
});
