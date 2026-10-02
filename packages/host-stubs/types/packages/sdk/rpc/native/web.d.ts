import { z } from "zod";
export declare const webContracts: {
    readonly "web.capabilities": import("../contract.js").RpcContract<"web.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "web.link.get": import("../contract.js").RpcContract<"web.link.get", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        domain: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        ogImageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        hasContent: z.ZodBoolean;
        contentExtractedAt: z.ZodNullable<z.ZodString>;
        linkedEntities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
            createdAt: z.ZodString;
            data: z.ZodOptional<z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "web.link.open": import("../contract.js").RpcContract<"web.link.open", z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        forceRefresh: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        contentMarkdown: z.ZodString;
        contentLength: z.ZodNumber;
        extractedAt: z.ZodString;
        fromCache: z.ZodBoolean;
    }, z.core.$strip>, "required">;
    readonly "web.search": import("../contract.js").RpcContract<"web.search", z.ZodObject<{
        query: z.ZodString;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        query: z.ZodString;
        results: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            url: z.ZodString;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "web.page.search": {
        readonly method: "web.page.search";
        readonly input: z.ZodObject<{
            query: z.ZodString;
            limit: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            query: z.ZodString;
            results: z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                url: z.ZodString;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
};
//# sourceMappingURL=web.d.ts.map