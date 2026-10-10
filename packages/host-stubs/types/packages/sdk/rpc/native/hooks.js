import { z } from "zod";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
export const HookSchema = z.strictObject({
    id: z.string(),
    name: z.string(),
    triggerAction: z.string(),
    triggerScope: z.string().optional(),
    description: z.string().optional(),
    reviewAgentId: z.string().optional(),
    onWarning: z.string(),
    groupIds: z.array(z.string()),
    enabled: z.boolean(),
    createdAt: z.string(),
});
export const hooksContracts = {
    "hooks.create": defineRpcContract({
        method: "hooks.create",
        input: z.object({ name: z.string().min(1), triggerAction: z.string().min(1), triggerScope: z.string().nullable().optional(), description: z.string().nullable().optional(), reviewAgentId: z.string().nullable().optional(), onWarning: z.string().default("warn"), groupIds: z.array(z.string()).default([]) }),
        output: HookSchema,
    }),
    "hooks.delete": defineRpcContract({
        method: "hooks.delete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "hooks.list": defineRpcContract({
        method: "hooks.list",
        input: z.object({}),
        output: z.array(HookSchema),
    }),
    "hooks.update": defineRpcContract({
        method: "hooks.update",
        input: z.object({ id: z.string().min(1), name: z.string().optional(), triggerAction: z.string().optional(), triggerScope: z.string().nullable().optional(), description: z.string().nullable().optional(), reviewAgentId: z.string().nullable().optional(), onWarning: z.string().optional(), groupIds: z.array(z.string()).optional(), enabled: z.boolean().optional() }),
        output: HookSchema,
    }),
};
