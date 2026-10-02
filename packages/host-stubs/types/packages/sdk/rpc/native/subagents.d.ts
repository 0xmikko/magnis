import { z } from "zod";
export declare const subagentsContracts: {
    readonly "subagents.create": import("../contract.js").RpcContract<"subagents.create", z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        systemPrompt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "subagents.delete": import("../contract.js").RpcContract<"subagents.delete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "subagents.list": import("../contract.js").RpcContract<"subagents.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "subagents.update": import("../contract.js").RpcContract<"subagents.update", z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        systemPrompt: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "subagents.roster": import("../contract.js").RpcContract<"subagents.roster", z.ZodObject<{}, z.core.$strict>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>, "required">;
    readonly "subagents.profile.list": {
        readonly method: "subagents.profile.list";
        readonly input: z.ZodObject<{}, z.core.$strict>;
        readonly output: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
};
//# sourceMappingURL=subagents.d.ts.map