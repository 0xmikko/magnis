import { z } from "zod";
import { SetupStepAnswerSchema, SetupViewSchema } from "../../core/setup-state.js";
import { defineRpcContract } from "../contract.js";
export const setupContracts = {
    "setup.get": defineRpcContract({
        method: "setup.get",
        input: z.object({}),
        output: SetupViewSchema,
    }),
    // One step's answer, not the whole document: the server records the step
    // and answers where the person stands next.
    "setup.update": defineRpcContract({
        method: "setup.update",
        input: SetupStepAnswerSchema,
        output: SetupViewSchema,
    }),
};
