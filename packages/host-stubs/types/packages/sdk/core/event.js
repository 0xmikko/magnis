import { z } from "zod";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
export const WorkspaceIndexProgressEventSchema = z.strictObject({
    type: z.literal("app.indexProgress"),
    indexed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
});
const countSchema = z.int().nonnegative();
/** A graph write as a socket receives it, one member per event type. */
export const GraphEventPayloadSchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("entity_created"), entityId: IdSchema, schemaId: z.string(), schemaVersion: z.int() }),
    /** The node's dictionary changed; carries the new dictionary. */
    z.strictObject({ type: z.literal("entity_properties_updated"), entityId: IdSchema, properties: JsonValueSchema }),
    z.strictObject({ type: z.literal("entity_updated"), entityId: IdSchema, changes: JsonValueSchema }),
    z.strictObject({ type: z.literal("entity_archived"), entityId: IdSchema }),
    z.strictObject({ type: z.literal("entity_unarchived"), entityId: IdSchema }),
    z.strictObject({ type: z.literal("link_added"), linkId: IdSchema, from: IdSchema, to: IdSchema, linkType: z.string() }),
    z.strictObject({ type: z.literal("link_updated"), linkId: IdSchema, changes: JsonValueSchema }),
    z.strictObject({
        type: z.literal("link_evidence_recorded"),
        linkId: IdSchema,
        sign: z.number(),
        origin: z.string(),
        probability: z.number(),
        evidenceCount: countSchema,
        promoted: z.boolean(),
    }),
    z.strictObject({
        type: z.literal("override_applied"),
        entityId: IdSchema,
        propertyKey: z.string(),
        value: JsonValueSchema,
        reason: z.string().nullable(),
    }),
    z.strictObject({ type: z.literal("link_removed"), linkId: IdSchema }),
    z.strictObject({ type: z.literal("entity_deleted"), entityId: IdSchema }),
    /** Each duplicate edge the merge collapsed, with the dictionary the collapse produced. */
    z.strictObject({
        type: z.literal("entities_merged"),
        survivorId: IdSchema,
        retiredId: IdSchema,
        linksRepointed: countSchema,
        reason: z.string().nullable(),
        collapsedEdges: z.array(JsonValueSchema).readonly(),
    }),
]);
const composerModeSchema = z.enum(["email", "telegram"]);
/** The composer a client has mounted: apply events for it reach that view. */
export const ComposerPresenceParamsSchema = z.strictObject({
    mode: composerModeSchema,
    threadKey: z.string().min(1),
});
/** A plugin's write into the mounted composer, as the client receives it. */
export const ComposerApplyEventSchema = z.strictObject({
    mode: composerModeSchema,
    threadKey: z.string().min(1),
    revision: countSchema,
    op: z.enum(["set_text", "append_text", "set_attachments"]),
    text: z.string().exactOptional(),
    attachmentIds: z.array(z.string()).readonly().exactOptional(),
});
/** The bus event a synced or scheduled entity raises for the triggers that
 * watch it. `userId` owns it end to end, so the triggered episode is created
 * under the right tenant. An absent `context` is null, as the host reads it today. */
export const TriggerCheckEventSchema = z.strictObject({
    type: z.literal("trigger.check"),
    eventKind: z.string(),
    schemaId: z.string(),
    entityId: IdSchema,
    phase: z.enum(["live", "bootstrap", "catchup"]),
    touchedEntityIds: z.array(IdSchema).readonly(),
    context: JsonValueSchema.default(null),
    userId: IdSchema,
});
