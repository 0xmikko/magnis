import { z } from "zod";
export declare const AllowlistEntrySchema: z.ZodObject<{
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
}, z.core.$strict>;
export type AllowlistEntry = z.output<typeof AllowlistEntrySchema>;
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
    }, z.core.$strict>, "required">;
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
    }, z.core.$strict>, "required">;
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
    }, z.core.$strict>>, "required">;
    readonly "allowlist.update_access": import("../contract.js").RpcContract<"allowlist.update_access", z.ZodObject<{
        id: z.ZodString;
        accessLevel: z.ZodString;
        groupIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        hookIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
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
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=allowlist.d.ts.map