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
}, z.core.$strip>;
export type EnumOption = z.output<typeof EnumOptionSchema>;
export declare const ModuleSettingFieldTypeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"number">;
    min: z.ZodNullable<z.ZodNumber>;
    max: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"string">;
    maxLength: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"boolean">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"enum">;
    options: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>], "type">;
export type ModuleSettingFieldType = z.output<typeof ModuleSettingFieldTypeSchema>;
export declare const ModuleSettingFieldSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"number">;
        min: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"string">;
        maxLength: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"boolean">;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"enum">;
        options: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>], "type">;
    defaultValue: z.ZodString;
    confirmationMessage: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
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
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"string">;
            maxLength: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"boolean">;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"enum">;
            options: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                value: z.ZodString;
                label: z.ZodString;
                description: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>>;
        }, z.core.$strip>], "type">;
        defaultValue: z.ZodString;
        confirmationMessage: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ModuleSettingsSchema = z.output<typeof ModuleSettingsSchemaSchema>;
export declare const ModuleSettingValueSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>;
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
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"string">;
                maxLength: z.ZodNullable<z.ZodNumber>;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"boolean">;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"enum">;
                options: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                    value: z.ZodString;
                    label: z.ZodString;
                    description: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>], "type">;
            defaultValue: z.ZodString;
            confirmationMessage: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    values: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** Readonly as the list row was declared; its transcribed twin is pinned
 * to it exactly (tst_bts_module_settings_wire_pins). */
export type ModuleSettingsEntry = Readonly<z.output<typeof ModuleSettingsEntrySchema>>;
//# sourceMappingURL=module-settings.d.ts.map