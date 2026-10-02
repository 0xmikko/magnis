import { z } from "zod";
export declare const groupsContracts: {
    readonly "groups.add_member": import("../contract.js").RpcContract<"groups.add_member", z.ZodObject<{
        groupId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "groups.capabilities": import("../contract.js").RpcContract<"groups.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "groups.create": import("../contract.js").RpcContract<"groups.create", z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        memory: z.ZodOptional<z.ZodString>;
        clientId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "groups.delete": import("../contract.js").RpcContract<"groups.delete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "groups.get": import("../contract.js").RpcContract<"groups.get", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        id: z.ZodString;
        description: z.ZodString;
        createdAt: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfiles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            contentPreview: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "groups.list": import("../contract.js").RpcContract<"groups.list", z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodNumber>;
        offset: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            memory: z.ZodString;
            memberCount: z.ZodNumber;
            identityProfileName: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
    }, z.core.$strip>, "required">;
    readonly "groups.list_for_entity": import("../contract.js").RpcContract<"groups.list_for_entity", z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "groups.list_members": import("../contract.js").RpcContract<"groups.list_members", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "groups.remove_member": import("../contract.js").RpcContract<"groups.remove_member", z.ZodObject<{
        groupId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "groups.resolve_identity": import("../contract.js").RpcContract<"groups.resolve_identity", z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        groupId: z.ZodString;
        groupName: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        identityProfiles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            contentPreview: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>, "required">;
    readonly "groups.update": import("../contract.js").RpcContract<"groups.update", z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        memory: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "groups.update_bio": import("../contract.js").RpcContract<"groups.update_bio", z.ZodObject<{
        groupId: z.ZodString;
        content: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "groups.update_memory": import("../contract.js").RpcContract<"groups.update_memory", z.ZodObject<{
        groupId: z.ZodString;
        memory: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "groups.group.create": {
        readonly method: "groups.group.create";
        readonly input: z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            memory: z.ZodOptional<z.ZodString>;
            clientId: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            memory: z.ZodString;
            memberCount: z.ZodNumber;
            identityProfileName: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.group.get": {
        readonly method: "groups.group.get";
        readonly input: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            name: z.ZodString;
            id: z.ZodString;
            description: z.ZodString;
            createdAt: z.ZodString;
            memory: z.ZodString;
            memberCount: z.ZodNumber;
            identityProfiles: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                contentPreview: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.group.link": {
        readonly method: "groups.group.link";
        readonly input: z.ZodObject<{
            groupId: z.ZodString;
            entityId: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            status: z.ZodString;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.group.list": {
        readonly method: "groups.group.list";
        readonly input: z.ZodObject<{
            search: z.ZodOptional<z.ZodString>;
            limit: z.ZodDefault<z.ZodNumber>;
            offset: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            items: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                description: z.ZodString;
                memory: z.ZodString;
                memberCount: z.ZodNumber;
                identityProfileName: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodString;
            }, z.core.$strip>>;
            total: z.ZodNumber;
            limit: z.ZodNumber;
            offset: z.ZodNumber;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.group.memory.update": {
        readonly method: "groups.group.memory.update";
        readonly input: z.ZodObject<{
            groupId: z.ZodString;
            memory: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            memory: z.ZodString;
            memberCount: z.ZodNumber;
            identityProfileName: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.group.unlink": {
        readonly method: "groups.group.unlink";
        readonly input: z.ZodObject<{
            groupId: z.ZodString;
            entityId: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            status: z.ZodString;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "groups.identity.bio.update": {
        readonly method: "groups.identity.bio.update";
        readonly input: z.ZodObject<{
            groupId: z.ZodString;
            content: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            status: z.ZodString;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
};
//# sourceMappingURL=groups.d.ts.map