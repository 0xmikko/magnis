import { z } from "zod";
import { IdentityProfileSchema } from "../../core/identity.js";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
export const identityContracts = {
    "identity.create": defineRpcContract({
        method: "identity.create",
        input: z.object({ name: z.string().min(1), content: z.string().default(""), isDefault: z.boolean().default(false), groupIds: z.array(z.string()).default([]) }),
        output: IdentityProfileSchema,
    }),
    "identity.delete": defineRpcContract({
        method: "identity.delete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "identity.list": defineRpcContract({
        method: "identity.list",
        input: z.object({}),
        output: z.array(IdentityProfileSchema),
    }),
    "identity.update": defineRpcContract({
        method: "identity.update",
        input: z.object({ id: z.string().min(1), name: z.string().optional(), content: z.string().optional(), isDefault: z.boolean().optional(), groupIds: z.array(z.string()).optional() }),
        output: IdentityProfileSchema,
    }),
};
