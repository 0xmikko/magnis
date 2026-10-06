import { z } from "zod";
/** A linked entity whose schema is triggerable, so a trigger can watch it. */
export declare const WatchableEntitySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    linkKind: z.ZodString;
}, z.core.$strict>;
export type WatchableEntity = z.output<typeof WatchableEntitySchema>;
/** The create-time refusal: each named entity that produces no events, with
 * the neighbours it could watch instead. */
export declare const TriggerWatchClarificationSchema: z.ZodObject<{
    status: z.ZodLiteral<"clarification_needed">;
    message: z.ZodString;
    nonTriggerableEntities: z.ZodArray<z.ZodObject<{
        entity: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
        }, z.core.$strict>;
        linkedWatchableEntities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type TriggerWatchClarification = z.output<typeof TriggerWatchClarificationSchema>;
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
        triggerId: z.ZodGUID;
        limit: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        firedAt: z.ZodString;
        eventEntityId: z.ZodString;
        gateResult: z.ZodExactOptional<z.ZodString>;
        episodeId: z.ZodExactOptional<z.ZodString>;
        outcome: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "triggers.fire_now": import("../contract.js").RpcContract<"triggers.fire_now", z.ZodObject<{
        triggerId: z.ZodGUID;
        eventEntityId: z.ZodDefault<z.ZodGUID>;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>;
    }, z.core.$strip>, z.ZodObject<{
        fired: z.ZodLiteral<true>;
        episodeId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "triggers.invalidate_cache": import("../contract.js").RpcContract<"triggers.invalidate_cache", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        invalidated: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "triggers.resolve_watchable": import("../contract.js").RpcContract<"triggers.resolve_watchable", z.ZodObject<{
        entityId: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        watchable: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>, "required">;
    readonly "triggers.validate_schedule": import("../contract.js").RpcContract<"triggers.validate_schedule", z.ZodObject<{
        cron: z.ZodString;
        timezone: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        cron: z.ZodString;
        timezone: z.ZodString;
        activatedAt: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "triggers.validate_watch": import("../contract.js").RpcContract<"triggers.validate_watch", z.ZodObject<{
        watchEntityIds: z.ZodArray<z.ZodGUID>;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        status: z.ZodLiteral<"clarification_needed">;
        message: z.ZodString;
        nonTriggerableEntities: z.ZodArray<z.ZodObject<{
            entity: z.ZodObject<{
                id: z.ZodString;
                name: z.ZodNullable<z.ZodString>;
                schemaId: z.ZodString;
            }, z.core.$strict>;
            linkedWatchableEntities: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodNullable<z.ZodString>;
                schemaId: z.ZodString;
                linkKind: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>, "required">;
};
//# sourceMappingURL=triggers.d.ts.map