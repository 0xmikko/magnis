import { z } from "zod";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { SubagentSchema } from "../../core/subagent.js";
import { defineRpcContract } from "../contract.js";
const rosterContract = defineRpcContract({
    method: "subagents.roster",
    input: z.object({}).strict(),
    output: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable() }).strict()),
});
export const subagentsContracts = {
    "subagents.create": defineRpcContract({
        method: "subagents.create",
        input: z.object({ name: z.string().min(1), description: z.string().optional(), systemPrompt: z.string().optional() }),
        output: SubagentSchema,
    }),
    "subagents.delete": defineRpcContract({
        method: "subagents.delete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "subagents.list": defineRpcContract({
        method: "subagents.list",
        input: z.object({}),
        output: z.array(SubagentSchema),
    }),
    "subagents.update": defineRpcContract({
        method: "subagents.update",
        input: z.object({ id: z.string().min(1), name: z.string().optional(), description: z.string().optional(), systemPrompt: z.string().optional(), status: z.string().optional() }),
        output: SubagentSchema,
    }),
    "subagents.roster": rosterContract,
    // Bound operation names retain the existing client adapters for equivalent methods.
    "subagents.profile.list": { ...rosterContract, method: "subagents.profile.list" },
};
