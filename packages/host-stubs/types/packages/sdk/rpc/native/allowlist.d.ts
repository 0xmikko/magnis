import { z } from "zod";
export declare const allowlistContracts: {
    readonly "allowlist.add": import("../contract.js").RpcContract<"allowlist.add", z.ZodObject<{
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        episodeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "allowlist.delete": import("../contract.js").RpcContract<"allowlist.delete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "allowlist.get": import("../contract.js").RpcContract<"allowlist.get", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
    readonly "allowlist.list": import("../contract.js").RpcContract<"allowlist.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "allowlist.update_access": import("../contract.js").RpcContract<"allowlist.update_access", z.ZodObject<{
        id: z.ZodString;
        accessLevel: z.ZodString;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        hookIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=allowlist.d.ts.map