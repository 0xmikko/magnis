import { z } from "zod";
/** `POST /api/rpc`: one RPC call over HTTP. An envelope without params calls
 * the method with `{}`; the answer is the `{id?, result}` or `{id?, error}`
 * envelope, whose result is the method's own answer. */
export declare const httpRpcContract: import("./contract.js").HttpContract<"POST", "/api/rpc", z.ZodObject<{
    id: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    method: z.ZodString;
    params: z.ZodDefault<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
}, z.core.$strip>, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
/** The POST /api/rpc body, the input of the SDK httpRpcContract. */
export type RpcHttpRequest = z.input<typeof httpRpcContract.input>;
//# sourceMappingURL=rpc.d.ts.map