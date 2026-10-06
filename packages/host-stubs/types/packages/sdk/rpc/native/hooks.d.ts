import { z } from "zod";
export declare const HookSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    triggerAction: z.ZodString;
    triggerScope: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    reviewAgentId: z.ZodOptional<z.ZodString>;
    onWarning: z.ZodString;
    groupIds: z.ZodArray<z.ZodString>;
    enabled: z.ZodBoolean;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type Hook = z.output<typeof HookSchema>;
export declare const hooksContracts: {
    readonly "hooks.create": import("../contract.js").RpcContract<"hooks.create", z.ZodObject<{
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        reviewAgentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        onWarning: z.ZodDefault<z.ZodString>;
        groupIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "hooks.delete": import("../contract.js").RpcContract<"hooks.delete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "hooks.list": import("../contract.js").RpcContract<"hooks.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
        createdAt: z.ZodString;
    }, z.core.$strict>>, "required">;
    readonly "hooks.update": import("../contract.js").RpcContract<"hooks.update", z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        triggerAction: z.ZodOptional<z.ZodString>;
        triggerScope: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        reviewAgentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        onWarning: z.ZodOptional<z.ZodString>;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=hooks.d.ts.map