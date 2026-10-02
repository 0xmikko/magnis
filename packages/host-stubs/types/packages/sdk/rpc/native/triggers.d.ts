import { z } from "zod";
export declare const triggersContracts: {
    readonly "triggers.capabilities": import("../contract.js").RpcContract<"triggers.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "triggers.fire_history": import("../contract.js").RpcContract<"triggers.fire_history", z.ZodObject<{
        triggerId: z.ZodString;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodArray<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>, "required">;
    readonly "triggers.fire_now": import("../contract.js").RpcContract<"triggers.fire_now", z.ZodObject<{
        triggerId: z.ZodString;
        eventEntityId: z.ZodDefault<z.ZodString>;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>;
    }, z.core.$strip>, z.ZodObject<{
        fired: z.ZodLiteral<true>;
        episodeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, "required">;
    readonly "triggers.invalidate_cache": import("../contract.js").RpcContract<"triggers.invalidate_cache", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        invalidated: z.ZodLiteral<true>;
    }, z.core.$strip>, "required">;
    readonly "triggers.resolve_watchable": import("../contract.js").RpcContract<"triggers.resolve_watchable", z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>, "required">;
    readonly "triggers.validate_schedule": import("../contract.js").RpcContract<"triggers.validate_schedule", z.ZodObject<{
        cron: z.ZodString;
        timezone: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>, "required">;
    readonly "triggers.validate_watch": import("../contract.js").RpcContract<"triggers.validate_watch", z.ZodObject<{
        watchEntityIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>, "required">;
};
//# sourceMappingURL=triggers.d.ts.map