import { z } from "zod";
export declare const identityContracts: {
    readonly "identity.create": import("../contract.js").RpcContract<"identity.create", z.ZodObject<{
        name: z.ZodString;
        content: z.ZodDefault<z.ZodString>;
        isDefault: z.ZodDefault<z.ZodBoolean>;
        groupIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "identity.delete": import("../contract.js").RpcContract<"identity.delete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "identity.list": import("../contract.js").RpcContract<"identity.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "identity.update": import("../contract.js").RpcContract<"identity.update", z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        content: z.ZodOptional<z.ZodString>;
        isDefault: z.ZodOptional<z.ZodBoolean>;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=identity.d.ts.map