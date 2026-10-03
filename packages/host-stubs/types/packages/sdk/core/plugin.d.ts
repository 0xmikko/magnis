/** What a plugin and the agent tool surface share with the host: the plugin
 * context, the tools and rpc() methods a plugin declares, the tool answers,
 * the capability answer and every plugin operation input. An optional field
 * is `exactOptional`: absent, never undefined, so its output is `field?: T`. */
import { z } from "zod";
/** Who a plugin call runs for and which extension makes it. */
export declare const PluginContextSchema: z.ZodObject<{
    userId: z.ZodString;
    extensionKind: z.ZodString;
    extensionId: z.ZodString;
}, z.core.$strict>;
export type PluginContext = z.output<typeof PluginContextSchema>;
/** Which argument of a tool call holds the target the allowlist checks. */
export declare const AllowlistGateSchema: z.ZodObject<{
    targetType: z.ZodString;
    targetArg: z.ZodString;
    batchArg: z.ZodExactOptional<z.ZodString>;
}, z.core.$strict>;
export type AllowlistGate = z.output<typeof AllowlistGateSchema>;
/** A tool the agent is offered. `binding` is present for entity operations;
 * `linkKind` auto-links the result entity to the episode. */
export declare const ToolDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    binding: z.ZodExactOptional<z.ZodObject<{
        entity: z.ZodString;
        operation: z.ZodString;
    }, z.core.$strict>>;
    description: z.ZodString;
    inputSchema: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    requiresApproval: z.ZodBoolean;
    allowlistGate: z.ZodNullable<z.ZodObject<{
        targetType: z.ZodString;
        targetArg: z.ZodString;
        batchArg: z.ZodExactOptional<z.ZodString>;
    }, z.core.$strict>>;
    linkKind: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type ToolDefinition = z.output<typeof ToolDefinitionSchema>;
/** A tool a plugin declares; the host turns it into a `ToolDefinition`. */
export declare const PluginToolDeclarationSchema: z.ZodObject<{
    name: z.ZodString;
    binding: z.ZodObject<{
        entity: z.ZodString;
        operation: z.ZodString;
    }, z.core.$strict>;
    description: z.ZodString;
    inputSchema: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    requiresApproval: z.ZodBoolean;
    allowlistGate: z.ZodExactOptional<z.ZodObject<{
        targetType: z.ZodString;
        targetArg: z.ZodString;
        batchArg: z.ZodExactOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PluginToolDeclaration = z.output<typeof PluginToolDeclarationSchema>;
/** An rpc() method a plugin publishes beside its tools, so the host registers
 * it with its input schema. */
export declare const PluginRpcDeclarationSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    params: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type PluginRpcDeclaration = z.output<typeof PluginRpcDeclarationSchema>;
/** What a module's `capabilities` tool answers: each entity's operations and
 * the required-argument forms of the operations that have alternatives. */
export declare const EntityCapabilitiesSchema: z.ZodObject<{
    module: z.ZodString;
    entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        entity: z.ZodString;
        operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
        forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type EntityCapabilities = z.output<typeof EntityCapabilitiesSchema>;
/** A gated tool call parked instead of run: an approval the user answers, or
 * the durable wait an agent execution stops on. */
export declare const PendingToolAnswerSchema: z.ZodUnion<readonly [z.ZodObject<{
    pendingApproval: z.ZodLiteral<true>;
    approvalId: z.ZodString;
    toolName: z.ZodString;
    arguments: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    message: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    pendingApproval: z.ZodLiteral<true>;
    waitId: z.ZodString;
    toolCallId: z.ZodString;
}, z.core.$strict>]>;
export type PendingToolAnswer = z.output<typeof PendingToolAnswerSchema>;
/** The tool call that ended the agent's turn, with its output. */
export declare const FinishedToolAnswerSchema: z.ZodObject<{
    agentFinished: z.ZodLiteral<true>;
    toolCallId: z.ZodString;
    output: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type FinishedToolAnswer = z.output<typeof FinishedToolAnswerSchema>;
/** A tool call that failed, with the code the agent reads. */
export declare const FailedToolAnswerSchema: z.ZodObject<{
    isError: z.ZodLiteral<true>;
    text: z.ZodString;
    code: z.ZodString;
    toolCallId: z.ZodString;
}, z.core.$strict>;
export type FailedToolAnswer = z.output<typeof FailedToolAnswerSchema>;
/** `graph.createEntity`. */
export declare const CreateEntityParamsSchema: z.ZodObject<{
    schemaId: z.ZodString;
    name: z.ZodString;
    clientId: z.ZodExactOptional<z.ZodString>;
    idx: z.ZodExactOptional<z.ZodString>;
    date: z.ZodExactOptional<z.ZodString>;
}, z.core.$strict>;
export type CreateEntityParams = z.output<typeof CreateEntityParamsSchema>;
/** `graph.listEntities`. */
export declare const ListEntitiesParamsSchema: z.ZodObject<{
    schemaId: z.ZodString;
    limit: z.ZodExactOptional<z.ZodInt>;
    offset: z.ZodExactOptional<z.ZodInt>;
    order: z.ZodExactOptional<z.ZodEnum<{
        date: "date";
        idx: "idx";
    }>>;
    showArchived: z.ZodExactOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type ListEntitiesParams = z.output<typeof ListEntitiesParamsSchema>;
/** `graph.searchEntitiesByName`. */
export declare const SearchEntitiesParamsSchema: z.ZodObject<{
    query: z.ZodString;
    schemaIds: z.ZodExactOptional<z.ZodReadonly<z.ZodArray<z.ZodString>>>;
    limit: z.ZodExactOptional<z.ZodInt>;
}, z.core.$strict>;
export type SearchEntitiesParams = z.output<typeof SearchEntitiesParamsSchema>;
/** A filter or order field: an entity column, a dictionary path, or an edge
 * dictionary path seen by one observer. */
export declare const FieldRefDtoSchema: z.ZodObject<{
    entityField: z.ZodExactOptional<z.ZodEnum<{
        name: "name";
        date: "date";
        idx: "idx";
        origin: "origin";
        confidence: "confidence";
        created_at: "created_at";
        is_pinned: "is_pinned";
        pin_order: "pin_order";
        valid_from: "valid_from";
        valid_until: "valid_until";
    }>>;
    propertyPath: z.ZodExactOptional<z.ZodString>;
    edgeKind: z.ZodExactOptional<z.ZodString>;
    observerExternalId: z.ZodExactOptional<z.ZodString>;
    edgePath: z.ZodExactOptional<z.ZodString>;
}, z.core.$strict>;
export type FieldRefDto = z.output<typeof FieldRefDtoSchema>;
export declare const OrderKeyDtoSchema: z.ZodObject<{
    field: z.ZodObject<{
        entityField: z.ZodExactOptional<z.ZodEnum<{
            name: "name";
            date: "date";
            idx: "idx";
            origin: "origin";
            confidence: "confidence";
            created_at: "created_at";
            is_pinned: "is_pinned";
            pin_order: "pin_order";
            valid_from: "valid_from";
            valid_until: "valid_until";
        }>>;
        propertyPath: z.ZodExactOptional<z.ZodString>;
        edgeKind: z.ZodExactOptional<z.ZodString>;
        observerExternalId: z.ZodExactOptional<z.ZodString>;
        edgePath: z.ZodExactOptional<z.ZodString>;
    }, z.core.$strict>;
    desc: z.ZodExactOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type OrderKeyDto = z.output<typeof OrderKeyDtoSchema>;
/** `graph.listEntitiesWindow`. */
export declare const WindowSpecSchema: z.ZodObject<{
    schema: z.ZodString;
    filterField: z.ZodExactOptional<z.ZodObject<{
        entityField: z.ZodExactOptional<z.ZodEnum<{
            name: "name";
            date: "date";
            idx: "idx";
            origin: "origin";
            confidence: "confidence";
            created_at: "created_at";
            is_pinned: "is_pinned";
            pin_order: "pin_order";
            valid_from: "valid_from";
            valid_until: "valid_until";
        }>>;
        propertyPath: z.ZodExactOptional<z.ZodString>;
        edgeKind: z.ZodExactOptional<z.ZodString>;
        observerExternalId: z.ZodExactOptional<z.ZodString>;
        edgePath: z.ZodExactOptional<z.ZodString>;
    }, z.core.$strict>>;
    filterEq: z.ZodExactOptional<z.ZodString>;
    filterOp: z.ZodExactOptional<z.ZodEnum<{
        eq: "eq";
        distinct: "distinct";
        exists: "exists";
    }>>;
    order: z.ZodExactOptional<z.ZodReadonly<z.ZodArray<z.ZodObject<{
        field: z.ZodObject<{
            entityField: z.ZodExactOptional<z.ZodEnum<{
                name: "name";
                date: "date";
                idx: "idx";
                origin: "origin";
                confidence: "confidence";
                created_at: "created_at";
                is_pinned: "is_pinned";
                pin_order: "pin_order";
                valid_from: "valid_from";
                valid_until: "valid_until";
            }>>;
            propertyPath: z.ZodExactOptional<z.ZodString>;
            edgeKind: z.ZodExactOptional<z.ZodString>;
            observerExternalId: z.ZodExactOptional<z.ZodString>;
            edgePath: z.ZodExactOptional<z.ZodString>;
        }, z.core.$strict>;
        desc: z.ZodExactOptional<z.ZodBoolean>;
    }, z.core.$strict>>>>;
    showArchived: z.ZodExactOptional<z.ZodBoolean>;
    limit: z.ZodInt;
    offset: z.ZodInt;
}, z.core.$strict>;
export type WindowSpec = z.output<typeof WindowSpecSchema>;
/** `graph.listLinked`. */
export declare const LinkedSpecSchema: z.ZodObject<{
    parentId: z.ZodString;
    linkKind: z.ZodString;
    direction: z.ZodEnum<{
        in: "in";
        out: "out";
    }>;
    childSchema: z.ZodExactOptional<z.ZodString>;
    order: z.ZodExactOptional<z.ZodReadonly<z.ZodArray<z.ZodObject<{
        field: z.ZodObject<{
            entityField: z.ZodExactOptional<z.ZodEnum<{
                name: "name";
                date: "date";
                idx: "idx";
                origin: "origin";
                confidence: "confidence";
                created_at: "created_at";
                is_pinned: "is_pinned";
                pin_order: "pin_order";
                valid_from: "valid_from";
                valid_until: "valid_until";
            }>>;
            propertyPath: z.ZodExactOptional<z.ZodString>;
            edgeKind: z.ZodExactOptional<z.ZodString>;
            observerExternalId: z.ZodExactOptional<z.ZodString>;
            edgePath: z.ZodExactOptional<z.ZodString>;
        }, z.core.$strict>;
        desc: z.ZodExactOptional<z.ZodBoolean>;
    }, z.core.$strict>>>>;
    limit: z.ZodInt;
    offset: z.ZodInt;
}, z.core.$strict>;
export type LinkedSpec = z.output<typeof LinkedSpecSchema>;
/** `graph.addLink`: a canonical link, with an optional validity interval. */
export declare const AddLinkParamsSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    kind: z.ZodString;
    metadata: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    validFrom: z.ZodExactOptional<z.ZodISODateTime>;
    validUntil: z.ZodExactOptional<z.ZodISODateTime>;
}, z.core.$strict>;
export type AddLinkParams = z.output<typeof AddLinkParamsSchema>;
/** `fileRegister`: a downloadable media file; its bytes never cross the plugin boundary. */
export declare const FileRegisterParamsSchema: z.ZodObject<{
    externalId: z.ZodString;
    parentExternalId: z.ZodString;
    linkKind: z.ZodString;
    name: z.ZodExactOptional<z.ZodString>;
    mimeType: z.ZodString;
    sizeBytes: z.ZodExactOptional<z.ZodInt>;
    localPath: z.ZodExactOptional<z.ZodString>;
    cloudUrl: z.ZodExactOptional<z.ZodString>;
    sourceRef: z.ZodExactOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    sourceModule: z.ZodString;
    sourceSurface: z.ZodString;
    download: z.ZodExactOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type FileRegisterParams = z.output<typeof FileRegisterParamsSchema>;
/** `webRegister`: a URL the host normalizes; one it cannot is skipped. */
export declare const WebRegisterParamsSchema: z.ZodObject<{
    url: z.ZodString;
    parentEntityId: z.ZodExactOptional<z.ZodString>;
    linkKind: z.ZodExactOptional<z.ZodString>;
}, z.core.$strict>;
export type WebRegisterParams = z.output<typeof WebRegisterParamsSchema>;
/** `graph.listEntitiesByPropertyField`. */
export declare const ListEntitiesByPropertyFieldParamsSchema: z.ZodObject<{
    entitySchema: z.ZodString;
    key: z.ZodString;
    value: z.ZodString;
    limit: z.ZodExactOptional<z.ZodInt>;
    offset: z.ZodExactOptional<z.ZodInt>;
}, z.core.$strict>;
export type ListEntitiesByPropertyFieldParams = z.output<typeof ListEntitiesByPropertyFieldParamsSchema>;
//# sourceMappingURL=plugin.d.ts.map