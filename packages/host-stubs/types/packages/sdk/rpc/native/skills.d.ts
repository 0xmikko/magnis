import { z } from "zod";
export declare const skillListContract: import("../contract.js").RpcContract<"skills.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
}, z.core.$strict>>, "required">;
export declare const skillReadContract: import("../contract.js").RpcContract<"skills.read", z.ZodObject<{
    id: z.ZodString;
    path: z.ZodDefault<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    content: z.ZodString;
    truncated: z.ZodBoolean;
}, z.core.$strict>, "required">;
export declare const skillListFilesContract: import("../contract.js").RpcContract<"skills.list_files", z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    files: z.ZodArray<z.ZodString>;
}, z.core.$strict>, "required">;
export declare const skillsContracts: {
    readonly "skills.capabilities": import("../contract.js").RpcContract<"skills.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "skills.list": import("../contract.js").RpcContract<"skills.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "skills.list_files": import("../contract.js").RpcContract<"skills.list_files", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        files: z.ZodArray<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "skills.read": import("../contract.js").RpcContract<"skills.read", z.ZodObject<{
        id: z.ZodString;
        path: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        content: z.ZodString;
        truncated: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "skills.skill.list": {
        readonly method: "skills.skill.list";
        readonly input: z.ZodObject<{}, z.core.$strict>;
        readonly output: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
        }, z.core.$strict>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
    };
    readonly "skills.skill.get": {
        readonly method: "skills.skill.get";
        readonly input: z.ZodObject<{
            id: z.ZodString;
            path: z.ZodDefault<z.ZodString>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            content: z.ZodString;
            truncated: z.ZodBoolean;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
    };
    readonly "skills.skill.file.list": {
        readonly method: "skills.skill.file.list";
        readonly input: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            files: z.ZodArray<z.ZodString>;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../index.js").JsonObject>;
    };
};
//# sourceMappingURL=skills.d.ts.map