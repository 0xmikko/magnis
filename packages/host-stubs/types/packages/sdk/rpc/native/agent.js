import { z } from "zod";
import { AgentImplementationIdSchema, AgentModelOptionSchema } from "../../core/episode.js";
import { defineRpcContract } from "../contract.js";
export const agentContracts = {
    "agent.implementations": defineRpcContract({
        method: "agent.implementations",
        input: z.object({}),
        output: z.strictObject({
            implementations: z.array(z.strictObject({
                id: AgentImplementationIdSchema,
                displayName: z.string(),
                nativeSession: z.boolean(),
                usesLlmRuntime: z.boolean(),
                available: z.boolean().optional(),
                unavailableReason: z.string().nullable().optional(),
            })),
            defaultImplementationId: AgentImplementationIdSchema,
        }),
    }),
    "agent.limits.get": defineRpcContract({
        method: "agent.limits.get",
        input: z.object({}),
        output: z.strictObject({ maxSteps: z.number().int() }),
    }),
    "agent.models.list": defineRpcContract({
        method: "agent.models.list",
        input: z.object({ implementationId: z.string().min(1) }),
        output: z.strictObject({
            implementationId: z.string(),
            models: z.array(AgentModelOptionSchema),
            available: z.boolean().optional(),
            unavailableReason: z.string().nullable().optional(),
        }),
    }),
};
