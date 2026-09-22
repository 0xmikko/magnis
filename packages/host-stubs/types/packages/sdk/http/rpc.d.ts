import { z } from "zod";
export declare const httpRpcContract: import("./contract.js").HttpContract<"POST", "/api/rpc", z.ZodObject<{
    method: z.ZodString;
    params: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
}, z.core.$strip>, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
//# sourceMappingURL=rpc.d.ts.map