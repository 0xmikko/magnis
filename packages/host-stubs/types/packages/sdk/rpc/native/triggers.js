import { z } from "zod";
import { JsonValueSchema } from "../../core/json.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { UuidShapeSchema } from "../../core/uuid.js";
import { defineRpcContract } from "../contract.js";
/** The event a manual fire names when its caller names none. */
const nilUuid = "00000000-0000-0000-0000-000000000000";
/** A linked entity whose schema is triggerable, so a trigger can watch it. */
export const WatchableEntitySchema = z.strictObject({
    id: z.string(),
    name: z.string().nullable(),
    schemaId: z.string(),
    linkKind: z.string(),
});
/** The create-time refusal: each named entity that produces no events, with
 * the neighbours it could watch instead. */
export const TriggerWatchClarificationSchema = z.strictObject({
    status: z.literal("clarification_needed"),
    message: z.string(),
    nonTriggerableEntities: z.array(z.strictObject({
        entity: z.strictObject({ id: z.string(), name: z.string().nullable(), schemaId: z.string() }),
        linkedWatchableEntities: z.array(WatchableEntitySchema),
    })),
});
export const triggersContracts = {
    "triggers.capabilities": defineRpcContract({
        method: "triggers.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "triggers.fire_history": defineRpcContract({
        method: "triggers.fire_history",
        input: z.object({ triggerId: UuidShapeSchema, limit: z.int().min(1).max(500).default(50) }),
        // A null gate result or episode is absent from its execution.
        output: z.array(z.strictObject({
            firedAt: z.string(),
            eventEntityId: z.string(),
            gateResult: z.string().exactOptional(),
            episodeId: z.string().exactOptional(),
            outcome: z.string(),
        })),
    }),
    "triggers.fire_now": defineRpcContract({
        method: "triggers.fire_now",
        input: z.object({
            triggerId: UuidShapeSchema,
            eventEntityId: UuidShapeSchema.default(nilUuid),
            context: z.record(z.string(), JsonValueSchema).default({}),
        }),
        output: z.strictObject({ fired: z.literal(true), episodeId: z.string().nullable() }),
    }),
    "triggers.invalidate_cache": defineRpcContract({
        method: "triggers.invalidate_cache",
        input: z.object({}),
        output: z.strictObject({ invalidated: z.literal(true) }),
    }),
    "triggers.resolve_watchable": defineRpcContract({
        method: "triggers.resolve_watchable",
        input: z.object({ entityId: UuidShapeSchema }),
        // A triggerable entity answers an empty list: nothing else to watch.
        output: z.strictObject({ watchable: z.array(WatchableEntitySchema) }),
    }),
    "triggers.validate_schedule": defineRpcContract({
        method: "triggers.validate_schedule",
        input: z.object({ cron: z.string(), timezone: z.string().nullable().default(null) }),
        // The cron verbatim, the timezone materialized, the activation stamped by the engine's clock.
        output: z.strictObject({ cron: z.string(), timezone: z.string(), activatedAt: z.string() }),
    }),
    "triggers.validate_watch": defineRpcContract({
        method: "triggers.validate_watch",
        input: z.object({ watchEntityIds: z.array(UuidShapeSchema) }),
        // Null when every named entity is watchable.
        output: TriggerWatchClarificationSchema.nullable(),
    }),
};
