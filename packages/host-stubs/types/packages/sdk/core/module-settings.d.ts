import { z } from "zod";
export declare const ModuleSettingsUpdateParamsSchema: z.ZodObject<{
    moduleId: z.ZodString;
    values: z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type ModuleSettingsUpdateParams = z.output<typeof ModuleSettingsUpdateParamsSchema>;
export declare const EnumOptionSchema: z.ZodObject<{
    value: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type EnumOption = z.output<typeof EnumOptionSchema>;
export declare const ModuleSettingFieldTypeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type ModuleSettingFieldType = z.output<typeof ModuleSettingFieldTypeSchema>;
export declare const ModuleSettingFieldSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type ModuleSettingField = z.output<typeof ModuleSettingFieldSchema>;
export declare const ModuleSettingsSchemaSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type ModuleSettingsSchema = z.output<typeof ModuleSettingsSchemaSchema>;
export declare const ModuleSettingValueSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strict>;
export type ModuleSettingValue = z.output<typeof ModuleSettingValueSchema>;
export declare const ModuleSettingsEntrySchema: z.ZodObject<{
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
}, z.core.$strict>;
export type ModuleSettingsEntry = z.output<typeof ModuleSettingsEntrySchema>;
//# sourceMappingURL=module-settings.d.ts.map