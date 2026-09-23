import { z } from "zod";
export declare const clientConfigContract: import("./contract.js").HttpContract<"GET", "/api/client-config", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    analytics: z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
}, z.core.$strip>>;
//# sourceMappingURL=client-config.d.ts.map