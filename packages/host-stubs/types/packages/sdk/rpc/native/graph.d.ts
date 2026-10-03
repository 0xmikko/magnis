import { z } from "zod";
/** `graph.relations`: the workspace's link-kind vocabulary. It is dispatched
 * beside the generated search tools rather than registered as a native
 * method, so it is not part of {@link graphContracts}. */
export declare const graphRelationsContract: import("../contract.js").RpcContract<"graph.relations", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    relations: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        description: z.ZodString;
        state: z.ZodString;
        symmetric: z.ZodBoolean;
        fromRole: z.ZodNullable<z.ZodString>;
        toRole: z.ZodNullable<z.ZodString>;
        owner: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>, "required">;
export declare const graphContracts: {
    readonly "graph.approve": import("../contract.js").RpcContract<"graph.approve", z.ZodObject<{
        id: z.ZodGUID;
        episodeId: z.ZodGUID;
    }, z.core.$strip>, z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
    }, z.core.$strict>], "origin">, z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin">]>, "required">;
    readonly "graph.capabilities": import("../contract.js").RpcContract<"graph.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.archive": import("../contract.js").RpcContract<"graph.entity.archive", z.ZodObject<{
        entityId: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.get": import("../contract.js").RpcContract<"graph.entity.get", z.ZodObject<{
        id: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
        linkedEntities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
            createdAt: z.ZodString;
            data: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strict>>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.links": import("../contract.js").RpcContract<"graph.entity.links", z.ZodObject<{
        id: z.ZodGUID;
        kind: z.ZodOptional<z.ZodString>;
        direction: z.ZodDefault<z.ZodEnum<{
            from: "from";
            to: "to";
            both: "both";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        entityId: z.ZodString;
        links: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            direction: z.ZodLiteral<"from">;
            kind: z.ZodString;
            targetId: z.ZodString;
            targetName: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            direction: z.ZodLiteral<"to">;
            kind: z.ZodString;
            sourceId: z.ZodString;
            sourceName: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
        }, z.core.$strict>], "direction">>;
        total: z.ZodNumber;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.pin": import("../contract.js").RpcContract<"graph.entity.pin", z.ZodObject<{
        entityId: z.ZodGUID;
        pinOrder: z.ZodOptional<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.unarchive": import("../contract.js").RpcContract<"graph.entity.unarchive", z.ZodObject<{
        entityId: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.unpin": import("../contract.js").RpcContract<"graph.entity.unpin", z.ZodObject<{
        entityId: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.update_properties": import("../contract.js").RpcContract<"graph.entity.update_properties", z.ZodObject<{
        entityId: z.ZodGUID;
        properties: z.ZodType<import("../../core/json.js").JsonObject, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonObject, unknown>>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.find": import("../contract.js").RpcContract<"graph.find", z.ZodObject<{
        type: z.ZodString;
        chatId: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodInt>;
        offset: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "graph.get": import("../contract.js").RpcContract<"graph.get", z.ZodObject<{
        id: z.ZodGUID;
    }, z.core.$strip>, z.ZodObject<{
        entity: z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>;
        links: z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
            kind: z.ZodString;
        }, z.core.$strict>>;
        linkCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
        linksTotal: z.ZodNumber;
        linksHasMore: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "graph.link.add": import("../contract.js").RpcContract<"graph.link.add", z.ZodObject<{
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        from: z.ZodGUID;
        to: z.ZodGUID;
        kind: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        created: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "graph.link.end": import("../contract.js").RpcContract<"graph.link.end", z.ZodObject<{
        id: z.ZodGUID;
        validUntil: z.ZodISODateTime;
        evidence: z.ZodGUID;
    }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin">, "required">;
    readonly "graph.links": import("../contract.js").RpcContract<"graph.links", z.ZodObject<{
        id: z.ZodGUID;
        kind: z.ZodString;
        direction: z.ZodDefault<z.ZodEnum<{
            in: "in";
            out: "out";
        }>>;
        childType: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodInt>;
        offset: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "graph.search": import("../contract.js").RpcContract<"graph.search", z.ZodObject<{
        query: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "graph.withdraw": import("../contract.js").RpcContract<"graph.withdraw", z.ZodObject<{
        evidenceIds: z.ZodArray<z.ZodGUID>;
    }, z.core.$strip>, z.ZodObject<{
        entities: z.ZodNumber;
        links: z.ZodNumber;
    }, z.core.$strict>, "required">;
    readonly "graph.entity.links.list": {
        readonly method: "graph.entity.links.list";
        readonly input: z.ZodObject<{
            id: z.ZodGUID;
            kind: z.ZodOptional<z.ZodString>;
            direction: z.ZodDefault<z.ZodEnum<{
                from: "from";
                to: "to";
                both: "both";
            }>>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            entityId: z.ZodString;
            links: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                direction: z.ZodLiteral<"from">;
                kind: z.ZodString;
                targetId: z.ZodString;
                targetName: z.ZodNullable<z.ZodString>;
                confidence: z.ZodNullable<z.ZodNumber>;
                origin: z.ZodEnum<{
                    canonical: "canonical";
                    agent: "agent";
                }>;
                validUntil: z.ZodNullable<z.ZodISODateTime>;
                id: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                direction: z.ZodLiteral<"to">;
                kind: z.ZodString;
                sourceId: z.ZodString;
                sourceName: z.ZodNullable<z.ZodString>;
                confidence: z.ZodNullable<z.ZodNumber>;
                origin: z.ZodEnum<{
                    canonical: "canonical";
                    agent: "agent";
                }>;
                validUntil: z.ZodNullable<z.ZodISODateTime>;
                id: z.ZodString;
            }, z.core.$strict>], "direction">>;
            total: z.ZodNumber;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
    };
    readonly "graph.link.link": {
        readonly method: "graph.link.link";
        readonly input: z.ZodObject<{
            confidence: z.ZodNumber;
            evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            from: z.ZodGUID;
            to: z.ZodGUID;
            kind: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodString;
            from: z.ZodString;
            to: z.ZodString;
            created: z.ZodBoolean;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
    };
    readonly "graph.link.update": {
        readonly method: "graph.link.update";
        readonly input: z.ZodObject<{
            id: z.ZodGUID;
            validUntil: z.ZodISODateTime;
            evidence: z.ZodGUID;
        }, z.core.$strict>;
        readonly output: z.ZodDiscriminatedUnion<[z.ZodObject<{
            origin: z.ZodLiteral<"canonical">;
            metadata: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
            owner: z.ZodString;
            from: z.ZodString;
            to: z.ZodString;
            kind: z.ZodString;
            createdAt: z.ZodISODateTime;
        }, z.core.$strict>, z.ZodObject<{
            origin: z.ZodLiteral<"agent">;
            confidence: z.ZodNumber;
            evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
            validFrom: z.ZodNullable<z.ZodISODateTime>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
            owner: z.ZodString;
            from: z.ZodString;
            to: z.ZodString;
            kind: z.ZodString;
            createdAt: z.ZodISODateTime;
        }, z.core.$strict>], "origin">;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
    };
    readonly "graph.entity.update": import("../contract.js").RpcContract<"graph.entity.update", z.ZodUnion<readonly [z.ZodObject<{
        entityId: z.ZodGUID;
        pinOrder: z.ZodNonOptional<z.ZodOptional<z.ZodNullable<z.ZodInt>>>;
        archived: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        entityId: z.ZodGUID;
        pinOrder: z.ZodOptional<z.ZodNullable<z.ZodInt>>;
        archived: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    }, z.core.$strict>]>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "graph.link.unlink": import("../contract.js").RpcContract<"graph.link.unlink", z.ZodObject<{
        id: z.ZodGUID;
    }, z.core.$strict>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=graph.d.ts.map