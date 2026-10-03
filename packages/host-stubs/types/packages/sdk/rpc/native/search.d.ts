import { z } from "zod";
export declare const searchIndexingStatusContract: import("../contract.js").RpcContract<"search.indexing_status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    indexed: z.ZodInt;
    total: z.ZodInt;
    pending: z.ZodInt;
    percent: z.ZodInt;
    model: z.ZodString;
    status: z.ZodEnum<{
        idle: "idle";
        indexing: "indexing";
    }>;
    activeModelId: z.ZodNullable<z.ZodString>;
    lifecycleState: z.ZodEnum<{
        ready: "ready";
        failed: "failed";
        unconfigured: "unconfigured";
        catching_up: "catching_up";
        reconfiguring: "reconfiguring";
    }>;
    generation: z.ZodInt;
    lastFailure: z.ZodNullable<z.ZodString>;
}, z.core.$strict>, "required">;
export declare const searchModelStatusContract: import("../contract.js").RpcContract<"search.model_status", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    key: z.ZodString;
    downloaded: z.ZodBoolean;
    downloadSize: z.ZodNullable<z.ZodString>;
    diskUsage: z.ZodNullable<z.ZodString>;
}, z.core.$strict>>, "required">;
export declare const searchContracts: {
    readonly "search.by_graph": import("../contract.js").RpcContract<"search.by_graph", z.ZodObject<{
        entityId: z.ZodGUID;
        depth: z.ZodDefault<z.ZodInt>;
        linkKind: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>, "required">;
    readonly "search.capabilities": import("../contract.js").RpcContract<"search.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "search.combined": import("../contract.js").RpcContract<"search.combined", z.ZodObject<{
        query: z.ZodString;
        relatedTo: z.ZodDefault<z.ZodArray<z.ZodGUID>>;
        schemaIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>, "required">;
    /** `search.combined` for the client's own search box: its page size and the
     * `{results}` wrapper. */
    readonly "search.fast": import("../contract.js").RpcContract<"search.fast", z.ZodObject<{
        query: z.ZodString;
        mentionIds: z.ZodDefault<z.ZodArray<z.ZodGUID>>;
        schemaIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        retrieval: z.ZodDefault<z.ZodEnum<{
            text: "text";
            hybrid: "hybrid";
        }>>;
        limit: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodObject<{
        results: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            score: z.ZodNumber;
            excerpt: z.ZodOptional<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
            data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, "required">;
    readonly "search.hybrid": import("../contract.js").RpcContract<"search.hybrid", z.ZodObject<{
        query: z.ZodString;
        limit: z.ZodDefault<z.ZodInt>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
    }, z.core.$strict>>, "required">;
    readonly "search.indexing_status": import("../contract.js").RpcContract<"search.indexing_status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        indexed: z.ZodInt;
        total: z.ZodInt;
        pending: z.ZodInt;
        percent: z.ZodInt;
        model: z.ZodString;
        status: z.ZodEnum<{
            idle: "idle";
            indexing: "indexing";
        }>;
        activeModelId: z.ZodNullable<z.ZodString>;
        lifecycleState: z.ZodEnum<{
            ready: "ready";
            failed: "failed";
            unconfigured: "unconfigured";
            catching_up: "catching_up";
            reconfiguring: "reconfiguring";
        }>;
        generation: z.ZodInt;
        lastFailure: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "search.model_status": import("../contract.js").RpcContract<"search.model_status", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        downloaded: z.ZodBoolean;
        downloadSize: z.ZodNullable<z.ZodString>;
        diskUsage: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, "required">;
    readonly "search.entities.search": {
        readonly method: "search.entities.search";
        readonly input: z.ZodObject<{
            query: z.ZodString;
            relatedTo: z.ZodDefault<z.ZodArray<z.ZodGUID>>;
            schemaIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
            limit: z.ZodDefault<z.ZodInt>;
        }, z.core.$strict>;
        readonly output: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            score: z.ZodNumber;
            excerpt: z.ZodOptional<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
            data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
        }, z.core.$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
    };
    readonly "search.neighborhood.list": {
        readonly method: "search.neighborhood.list";
        readonly input: z.ZodObject<{
            entityId: z.ZodGUID;
            depth: z.ZodDefault<z.ZodInt>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly output: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            score: z.ZodNumber;
            excerpt: z.ZodOptional<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
            data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
        }, z.core.$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
    };
};
//# sourceMappingURL=search.d.ts.map