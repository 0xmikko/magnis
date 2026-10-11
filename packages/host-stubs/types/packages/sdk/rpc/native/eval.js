import { z } from "zod";
import { IdSchema } from "../../core/id.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { DateTimeSchema } from "../../core/statement.js";
import { defineRpcContract } from "../contract.js";
export const evalContracts = {
    "eval.capabilities": defineRpcContract({
        method: "eval.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "eval.fixture.invoke": defineRpcContract({
        method: "eval.fixture.invoke",
        input: z.object({ actionId: z.string(), idempotencyKey: z.string() }),
        /** A successful invocation is already at its terminal phase; every other outcome is an error. */
        output: z.strictObject({
            invocationId: IdSchema,
            actionId: z.string(),
            phase: z.literal("trigger_evaluated"),
            actionTime: DateTimeSchema,
            eventEntityId: IdSchema.nullable(),
            episodeId: z.null(),
            failureCode: z.null(),
            failureDetail: z.null(),
        }),
    }),
};
