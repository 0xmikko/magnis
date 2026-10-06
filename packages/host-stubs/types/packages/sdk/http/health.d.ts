import { z } from "zod";
/** A live backend answers 200 with this; an unavailable one answers 503. */
export declare const healthContract: import("./contract.js").HttpContract<"GET", "/health", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    service: z.ZodLiteral<"magnis-core">;
    status: z.ZodLiteral<"ok">;
}, z.core.$strict>>;
//# sourceMappingURL=health.d.ts.map