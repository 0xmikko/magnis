import { z } from "zod";
export declare const memoryContracts: {
    readonly "memory.capabilities": import("../contract.js").RpcContract<"memory.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "memory.confirm": import("../contract.js").RpcContract<"memory.confirm", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodLiteral<"ok">;
        confidence: z.ZodNumber;
    }, z.core.$strip>, "required">;
    readonly "memory.diagnostics": import("../contract.js").RpcContract<"memory.diagnostics", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        totalActive: z.ZodNumber;
        totalRejected: z.ZodNumber;
        totalStale: z.ZodNumber;
        byType: z.ZodRecord<z.ZodString, z.ZodNumber>;
        avgConfidence: z.ZodNumber;
        lastConsolidation: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "memory.forget": import("../contract.js").RpcContract<"memory.forget", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodLiteral<"forgotten">;
    }, z.core.$strip>, "required">;
    readonly "memory.list": import("../contract.js").RpcContract<"memory.list", z.ZodObject<{
        memoryType: z.ZodOptional<z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        subjectEntityId: z.ZodOptional<z.ZodString>;
        projectEntityId: z.ZodOptional<z.ZodString>;
        sourceEpisodeId: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        memoryType: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        confidence: z.ZodNumber;
        status: z.ZodString;
        origin: z.ZodString;
        sourceKind: z.ZodString;
        sourceEpisodeId: z.ZodNullable<z.ZodString>;
        sourceMessageIds: z.ZodArray<z.ZodString>;
        subjectEntityId: z.ZodNullable<z.ZodString>;
        projectEntityId: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodString;
        lastVerifiedAt: z.ZodString;
        supersededBy: z.ZodNullable<z.ZodString>;
        archivedAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "memory.reject": import("../contract.js").RpcContract<"memory.reject", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodLiteral<"rejected">;
    }, z.core.$strip>, "required">;
    readonly "memory.save": import("../contract.js").RpcContract<"memory.save", z.ZodObject<{
        memoryType: z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>;
        title: z.ZodString;
        body: z.ZodString;
        subjectEntityId: z.ZodOptional<z.ZodString>;
        projectEntityId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        status: z.ZodLiteral<"saved">;
    }, z.core.$strip>, "required">;
    readonly "memory.search": import("../contract.js").RpcContract<"memory.search", z.ZodObject<{
        query: z.ZodString;
        memoryType: z.ZodOptional<z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        memoryType: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        confidence: z.ZodNumber;
        status: z.ZodString;
        origin: z.ZodString;
        sourceKind: z.ZodString;
        sourceEpisodeId: z.ZodNullable<z.ZodString>;
        sourceMessageIds: z.ZodArray<z.ZodString>;
        subjectEntityId: z.ZodNullable<z.ZodString>;
        projectEntityId: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodString;
        lastVerifiedAt: z.ZodString;
        supersededBy: z.ZodNullable<z.ZodString>;
        archivedAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>, "required">;
};
//# sourceMappingURL=memory.d.ts.map