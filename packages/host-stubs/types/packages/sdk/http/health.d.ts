import { z } from "zod";
export declare const healthContract: import("./contract.js").HttpContract<"GET", "/health", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    service: z.ZodLiteral<"magnis-core">;
    status: z.ZodEnum<{
        unavailable: "unavailable";
        ok: "ok";
    }>;
}, z.core.$strip>>;
//# sourceMappingURL=health.d.ts.map