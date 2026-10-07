import { z } from "zod";
import { ComposerPresenceParamsSchema } from "../../core/event.js";
import { OkAckSchema } from "../../core/rpc-response.js";
import { defineRpcContract } from "../contract.js";
export const runtimeContracts = {
    "runtime.composer.setPresence": defineRpcContract({
        method: "runtime.composer.setPresence",
        input: z.object({ presence: ComposerPresenceParamsSchema.nullable() }),
        output: OkAckSchema,
    }),
};
