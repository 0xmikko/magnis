import { z } from "zod";
import { JsonValueSchema } from "../../core/json.js";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
export const userEventsContracts = {
    "user_events.track": defineRpcContract({
        method: "user_events.track",
        input: z.object({ eventName: z.string().min(1), source: z.string().min(1), properties: JsonValueSchema.optional() }),
        output: StatusAckSchema,
    }),
};
