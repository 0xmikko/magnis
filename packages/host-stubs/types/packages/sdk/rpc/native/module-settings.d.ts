import { z } from "zod";
export declare const moduleSettingsContracts: {
    readonly "module_settings.list": import("../contract.js").RpcContract<"module_settings.list", z.ZodObject<{
        moduleId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        moduleId: z.ZodString;
        label: z.ZodString;
        schema: z.ZodNullable<z.ZodObject<{
            moduleId: z.ZodString;
            label: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
            fields: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                label: z.ZodString;
                description: z.ZodNullable<z.ZodString>;
                fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    type: z.ZodLiteral<"number">;
                    min: z.ZodNullable<z.ZodNumber>;
                    max: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"string">;
                    maxLength: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"boolean">;
                }, z.core.$strict>, z.ZodObject<{
                    type: z.ZodLiteral<"enum">;
                    options: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                        value: z.ZodString;
                        label: z.ZodString;
                        description: z.ZodNullable<z.ZodString>;
                    }, z.core.$strict>>>;
                }, z.core.$strict>], "type">;
                defaultValue: z.ZodString;
                confirmationMessage: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        values: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            value: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>>, "required">;
};
//# sourceMappingURL=module-settings.d.ts.map