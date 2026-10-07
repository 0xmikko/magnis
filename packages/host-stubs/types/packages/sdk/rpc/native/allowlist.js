import { z } from "zod";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
export const AllowlistEntrySchema = z.strictObject({
    id: z.string(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    targetLabel: z.string().optional(),
    accessLevel: z.string(),
    groupIds: z.array(z.string()),
    hookIds: z.array(z.string()),
    episodeId: z.string().nullable(),
    createdAt: z.string(),
});
export const allowlistContracts = {
    "allowlist.add": defineRpcContract({
        method: "allowlist.add",
        input: z.object({ action: z.string().min(1), targetType: z.string().min(1), targetId: z.string().min(1), targetLabel: z.string().nullable().optional(), episodeId: z.string().nullable().optional() }),
        output: AllowlistEntrySchema,
    }),
    "allowlist.delete": defineRpcContract({
        method: "allowlist.delete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "allowlist.get": defineRpcContract({
        method: "allowlist.get",
        input: z.object({ id: z.string().min(1) }),
        output: AllowlistEntrySchema,
    }),
    "allowlist.list": defineRpcContract({
        method: "allowlist.list",
        input: z.object({}),
        output: z.array(AllowlistEntrySchema),
    }),
    "allowlist.update_access": defineRpcContract({
        method: "allowlist.update_access",
        input: z.object({ id: z.string().min(1), accessLevel: z.string().min(1), groupIds: z.array(z.string()).default([]), hookIds: z.array(z.string()).default([]) }),
        output: AllowlistEntrySchema,
    }),
};
