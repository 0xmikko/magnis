import { z } from "zod";
import { SourceFixtureProvisionInputSchema } from "../core/source.js";
import { defineRpcContract } from "./contract.js";
/** Explicit test-composition contract. Production rpcContracts deliberately
 * do not include it. */
export const sourceFixtureProvisionContract = defineRpcContract({
    method: "source.fixtures.provision",
    input: SourceFixtureProvisionInputSchema,
    output: z.strictObject({
        ok: z.literal(true),
        accountId: z.string().min(1),
        generation: z.number().int().positive(),
    }),
});
