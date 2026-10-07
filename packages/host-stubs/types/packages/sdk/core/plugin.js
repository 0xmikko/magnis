/** What a plugin and the agent tool surface share with the host: the plugin
 * context, the tools and rpc() methods a plugin declares, the tool answers,
 * the capability answer, every plugin operation input and the answers of the
 * sync operations. An optional field is `exactOptional`: absent, never
 * undefined, so its output is `field?: T`. */
import { z } from "zod";
import { EntityOperationBindingSchema } from "./approval.js";
import { EntityColSchema, SyncRevisionSchema } from "./entity.js";
import { IdSchema, PersistentEntityIdSchema } from "./id.js";
import { validPeriod } from "./indexing.js";
import { JsonObjectSchema, JsonValueSchema } from "./json.js";
import { DateTimeSchema } from "./statement.js";
import { AccountSyncStateSchema } from "./sync.js";
/** Who a plugin call runs for and which extension makes it. */
export const PluginContextSchema = z.strictObject({
    userId: IdSchema,
    extensionKind: z.string(),
    extensionId: z.string(),
});
/** Which argument of a tool call holds the target the allowlist checks. */
export const AllowlistGateSchema = z.strictObject({
    targetType: z.string(),
    targetArg: z.string(),
    batchArg: z.string().exactOptional(),
});
/** A tool the agent is offered. `binding` is present for entity operations;
 * `linkKind` auto-links the result entity to the episode. */
export const ToolDefinitionSchema = z.strictObject({
    name: z.string(),
    binding: EntityOperationBindingSchema.exactOptional(),
    description: z.string(),
    inputSchema: JsonValueSchema,
    requiresApproval: z.boolean(),
    allowlistGate: AllowlistGateSchema.nullable(),
    linkKind: z.string().nullable(),
});
/** A tool a plugin declares; the host turns it into a `ToolDefinition`. */
export const PluginToolDeclarationSchema = z.strictObject({
    name: z.string(),
    binding: EntityOperationBindingSchema,
    description: z.string(),
    inputSchema: JsonValueSchema,
    requiresApproval: z.boolean(),
    allowlistGate: AllowlistGateSchema.exactOptional(),
});
/** An rpc() method a plugin publishes beside its tools, so the host registers
 * it with its input schema. */
export const PluginRpcDeclarationSchema = z.strictObject({
    name: z.string(),
    description: z.string(),
    params: JsonValueSchema,
});
/** What a module's `capabilities` tool answers: each entity's operations and
 * the required-argument forms of the operations that have alternatives. */
export const EntityCapabilitiesSchema = z.strictObject({
    module: z.string(),
    entities: z.array(z.strictObject({
        entity: z.string(),
        operations: z.array(z.string()).readonly(),
        forms: z.record(z.string(), JsonValueSchema).readonly().exactOptional(),
    })).readonly(),
});
/** A gated tool call parked instead of run: an approval the user answers, or
 * the durable wait an agent execution stops on. */
export const PendingToolAnswerSchema = z.union([
    z.strictObject({
        pendingApproval: z.literal(true),
        approvalId: IdSchema,
        toolName: z.string(),
        arguments: JsonValueSchema,
        message: z.string(),
    }),
    z.strictObject({
        pendingApproval: z.literal(true),
        waitId: IdSchema,
        toolCallId: z.string(),
    }),
]);
/** The tool call that ended the agent's turn, with its output. */
export const FinishedToolAnswerSchema = z.strictObject({
    agentFinished: z.literal(true),
    toolCallId: z.string(),
    output: JsonValueSchema,
});
/** A tool call that failed, with the code the agent reads. */
export const FailedToolAnswerSchema = z.strictObject({
    isError: z.literal(true),
    text: z.string(),
    code: z.string(),
    toolCallId: z.string(),
});
const pageBoundSchema = z.int().nonnegative();
/** `graph.createEntity`. */
export const CreateEntityParamsSchema = z.strictObject({
    schemaId: z.string(),
    name: z.string(),
    clientId: PersistentEntityIdSchema.exactOptional(),
    idx: z.string().exactOptional(),
    date: z.string().exactOptional(),
    /** The user's sync choice, required when the schema is syncable and refused otherwise. */
    syncEnabled: z.boolean().exactOptional(),
});
/** `graph.updateEntitySyncEnabled`: the user's sync choice for one entity. */
export const SetSyncEnabledParamsSchema = z.strictObject({
    id: PersistentEntityIdSchema,
    syncEnabled: z.boolean(),
});
/** What `graph.updateEntitySyncEnabled` answers: the revision the saved choice now has. */
export const UpdateEntitySyncEnabledResultSchema = z.strictObject({
    syncRevision: SyncRevisionSchema,
});
/** `graph.admitSyncEntities`: an entity and the page's events it owns. */
export const SyncAdmissionSubjectSchema = z.strictObject({
    entityId: PersistentEntityIdSchema,
    remoteIds: z.array(z.string().min(1)).readonly(),
});
/** What `graph.admitSyncEntities` answers: the page's remote ids whose owning entity syncs. */
export const AdmitSyncEntitiesResultSchema = z.array(z.string().min(1)).readonly();
/** `graph.listSyncMigrationEntities`: one page of a schema's entities with
 * their stored sync choice, in id order after the id `after`. */
export const ListSyncMigrationEntitiesParamsSchema = z.strictObject({
    schemaId: z.string(),
    after: z.string().nullable(),
    limit: z.number(),
});
/** An entity of a syncable schema as the sync migration reads it: its saved
 * choice and revision are null until the owning module initializes them. */
export const SyncMigrationEntitySchema = z.strictObject({
    id: PersistentEntityIdSchema,
    schemaId: z.string(),
    name: z.string().nullable(),
    indexed: z.boolean(),
    isPinned: z.boolean().nullable(),
    properties: JsonObjectSchema,
    syncEnabled: z.boolean().nullable(),
    syncRevision: SyncRevisionSchema.nullable(),
});
/** What `graph.listSyncMigrationEntities` answers: one page, and the id the
 * next page starts after, or null at the end. */
export const ListSyncMigrationEntitiesResultSchema = z.strictObject({
    items: z.array(SyncMigrationEntitySchema).readonly(),
    next: z.string().nullable(),
});
/** What `graph.moduleSettings` answers: the module's setting values by key. */
export const ModuleSettingsResultSchema = z.record(z.string(), z.string()).readonly();
/** What `graph.syncState("status")` answers: each account of the calling
 * module's surface, and the sync its worker reports, null without a worker. */
export const SyncStateStatusResultSchema = z.strictObject({
    accounts: z.array(z.strictObject({
        accountId: z.string(),
        sync: AccountSyncStateSchema.nullable(),
    })).readonly(),
});
/** What `graph.syncState("apply")` answers: the surface's worker was asked to
 * apply the saved choices. */
export const SyncStateApplyResultSchema = z.strictObject({
    pending: z.literal(true),
});
/** What `graph.syncState("reset")` answers: the schema's records were archived
 * and the surface's sync rows reset. */
export const SyncStateResetResultSchema = z.strictObject({
    status: z.literal("ok"),
    deletedMessages: z.int().nonnegative(),
});
/** `graph.listEntities`. */
export const ListEntitiesParamsSchema = z.strictObject({
    extras: z.literal(true).exactOptional(),
    schemaId: z.string(),
    limit: pageBoundSchema.exactOptional(),
    offset: pageBoundSchema.exactOptional(),
    order: z.enum(["idx", "date"]).exactOptional(),
    showArchived: z.boolean().exactOptional(),
});
/** `graph.searchEntitiesByName`. */
export const SearchEntitiesParamsSchema = z.strictObject({
    extras: z.literal(true).exactOptional(),
    query: z.string(),
    schemaIds: z.array(z.string()).readonly().exactOptional(),
    limit: pageBoundSchema.exactOptional(),
});
/** A filter or order field: an entity column, a dictionary path, or an edge
 * dictionary path seen by one observer. */
export const FieldRefDtoSchema = z.strictObject({
    entityField: EntityColSchema.exactOptional(),
    propertyPath: z.string().exactOptional(),
    edgeKind: z.string().exactOptional(),
    observerExternalId: z.string().exactOptional(),
    edgePath: z.string().exactOptional(),
});
export const OrderKeyDtoSchema = z.strictObject({
    field: FieldRefDtoSchema,
    desc: z.boolean().exactOptional(),
});
const orderSchema = z.array(OrderKeyDtoSchema).readonly();
/** `graph.listEntitiesWindow`. */
export const WindowSpecSchema = z.strictObject({
    extras: z.literal(true).exactOptional(),
    schema: z.string(),
    filterField: FieldRefDtoSchema.exactOptional(),
    filterEq: z.string().exactOptional(),
    filterOp: z.enum(["eq", "distinct", "exists"]).exactOptional(),
    order: orderSchema.exactOptional(),
    showArchived: z.boolean().exactOptional(),
    limit: pageBoundSchema,
    offset: pageBoundSchema,
});
/** `graph.listLinked`. */
export const LinkedSpecSchema = z.strictObject({
    extras: z.literal(true).exactOptional(),
    parentId: PersistentEntityIdSchema,
    linkKind: z.string(),
    direction: z.enum(["out", "in"]),
    childSchema: z.string().exactOptional(),
    order: orderSchema.exactOptional(),
    limit: pageBoundSchema,
    offset: pageBoundSchema,
});
/** `graph.addLink`: a canonical link, with an optional validity interval. */
export const AddLinkParamsSchema = z.strictObject({
    from: PersistentEntityIdSchema,
    to: PersistentEntityIdSchema,
    kind: z.string(),
    metadata: JsonValueSchema.exactOptional(),
    validFrom: DateTimeSchema.exactOptional(),
    validUntil: DateTimeSchema.exactOptional(),
}).refine((link) => validPeriod({ validFrom: link.validFrom ?? null, validUntil: link.validUntil ?? null }), "validUntil must follow validFrom");
/** `fileRegister`: a downloadable media file; its bytes never cross the plugin boundary. */
export const FileRegisterParamsSchema = z.strictObject({
    externalId: z.string(),
    parentExternalId: z.string(),
    linkKind: z.string(),
    name: z.string().exactOptional(),
    mimeType: z.string(),
    sizeBytes: z.int().nonnegative().exactOptional(),
    localPath: z.string().exactOptional(),
    cloudUrl: z.string().exactOptional(),
    sourceRef: JsonValueSchema.exactOptional(),
    sourceModule: z.string(),
    sourceSurface: z.string(),
    download: z.boolean().exactOptional(),
});
/** `webRegister`: a URL the host normalizes; one it cannot is skipped. */
export const WebRegisterParamsSchema = z.strictObject({
    url: z.string(),
    // A skipped URL never uses its parent. The host validates the persistent
    // reference after URL admission, preserving per-row skip behavior.
    parentEntityId: IdSchema.exactOptional(),
    linkKind: z.string().exactOptional(),
});
/** `graph.listEntitiesByPropertyField`. */
export const ListEntitiesByPropertyFieldParamsSchema = z.strictObject({
    extras: z.literal(true).exactOptional(),
    entitySchema: z.string(),
    key: z.string(),
    value: z.string(),
    limit: pageBoundSchema.exactOptional(),
    offset: pageBoundSchema.exactOptional(),
});
