import { z } from "zod";
export declare const WorkspaceIndexProgressEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"app.indexProgress">;
    indexed: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strict>;
export type WorkspaceIndexProgressEvent = z.output<typeof WorkspaceIndexProgressEventSchema>;
/** A graph write as a socket receives it, one member per event type. */
export declare const GraphEventPayloadSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"entity_created">;
    entityId: z.ZodString;
    schemaId: z.ZodString;
    schemaVersion: z.ZodInt;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entity_properties_updated">;
    entityId: z.ZodString;
    properties: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entity_updated">;
    entityId: z.ZodString;
    changes: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entity_archived">;
    entityId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entity_unarchived">;
    entityId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"link_added">;
    linkId: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    linkType: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"link_updated">;
    linkId: z.ZodString;
    changes: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"link_evidence_recorded">;
    linkId: z.ZodString;
    sign: z.ZodNumber;
    origin: z.ZodString;
    probability: z.ZodNumber;
    evidenceCount: z.ZodInt;
    promoted: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"override_applied">;
    entityId: z.ZodString;
    propertyKey: z.ZodString;
    value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    reason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"link_removed">;
    linkId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entity_deleted">;
    entityId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"entities_merged">;
    survivorId: z.ZodString;
    retiredId: z.ZodString;
    linksRepointed: z.ZodInt;
    reason: z.ZodNullable<z.ZodString>;
    collapsedEdges: z.ZodReadonly<z.ZodArray<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>>;
}, z.core.$strict>], "type">;
export type GraphEventPayload = z.output<typeof GraphEventPayloadSchema>;
/** The composer a client has mounted: apply events for it reach that view. */
export declare const ComposerPresenceParamsSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        email: "email";
        telegram: "telegram";
    }>;
    threadKey: z.ZodString;
}, z.core.$strict>;
export type ComposerPresenceParams = z.output<typeof ComposerPresenceParamsSchema>;
/** A plugin's write into the mounted composer, as the client receives it. */
export declare const ComposerApplyEventSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        email: "email";
        telegram: "telegram";
    }>;
    threadKey: z.ZodString;
    revision: z.ZodInt;
    op: z.ZodEnum<{
        set_text: "set_text";
        append_text: "append_text";
        set_attachments: "set_attachments";
    }>;
    text: z.ZodExactOptional<z.ZodString>;
    attachmentIds: z.ZodExactOptional<z.ZodReadonly<z.ZodArray<z.ZodString>>>;
}, z.core.$strict>;
export type ComposerApplyEvent = z.output<typeof ComposerApplyEventSchema>;
/** The bus event a synced or scheduled entity raises for the triggers that
 * watch it. `userId` owns it end to end, so the triggered episode is created
 * under the right tenant. An absent `context` is null, as the host reads it today. */
export declare const TriggerCheckEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"trigger.check">;
    eventKind: z.ZodString;
    schemaId: z.ZodString;
    entityId: z.ZodString;
    phase: z.ZodEnum<{
        live: "live";
        bootstrap: "bootstrap";
        catchup: "catchup";
    }>;
    touchedEntityIds: z.ZodReadonly<z.ZodArray<z.ZodString>>;
    context: z.ZodDefault<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    userId: z.ZodString;
}, z.core.$strict>;
export type TriggerCheckEvent = z.output<typeof TriggerCheckEventSchema>;
//# sourceMappingURL=event.d.ts.map