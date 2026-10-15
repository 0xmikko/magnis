import { z } from "zod";
import { JsonValueSchema } from "../core/json.js";
import { defineHttpContract } from "./contract.js";
/** `POST /api/rpc`: one RPC call over HTTP. An envelope without params calls
 * the method with `{}`; the answer is the `{id?, result}` or `{id?, error}`
 * envelope, whose result is the method's own answer. */
export const httpRpcContract = defineHttpContract({
    method: "POST",
    path: "/api/rpc",
    input: z.object({
        id: JsonValueSchema.optional(),
        method: z.string(),
        params: JsonValueSchema.default({}),
    }),
    output: JsonValueSchema,
});
