import { z } from "zod";
export declare const userEventsContracts: {
    readonly "user_events.track": import("../contract.js").RpcContract<"user_events.track", z.ZodObject<{
        eventName: z.ZodString;
        source: z.ZodString;
        properties: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=user-events.d.ts.map