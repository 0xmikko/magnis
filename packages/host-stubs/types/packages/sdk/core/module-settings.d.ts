import { z } from "zod";
export interface EnumOption {
    readonly value: string;
    readonly label: string;
    readonly description: string | null;
}
export type ModuleSettingFieldType = {
    readonly type: "number";
    readonly min: number | null;
    readonly max: number | null;
} | {
    readonly type: "string";
    readonly maxLength: number | null;
} | {
    readonly type: "boolean";
} | {
    readonly type: "enum";
    readonly options: readonly EnumOption[];
};
export interface ModuleSettingField {
    readonly key: string;
    readonly label: string;
    readonly description: string | null;
    readonly fieldType: ModuleSettingFieldType;
    readonly defaultValue: string;
    readonly confirmationMessage: string | null;
}
export interface ModuleSettingsSchema {
    readonly moduleId: string;
    readonly label: string;
    readonly description: string | null;
    readonly fields: readonly ModuleSettingField[];
}
export interface ModuleSettingValue {
    readonly key: string;
    readonly value: string;
}
export interface ModuleSettingsEntry {
    readonly moduleId: string;
    readonly label: string;
    readonly schema: ModuleSettingsSchema | null;
    readonly values: readonly ModuleSettingValue[];
}
export declare const EnumOptionSchema: z.ZodObject<{
    value: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
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
    options: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>], "type">;
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
        options: z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>], "type">;
    defaultValue: z.ZodString;
    confirmationMessage: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const ModuleSettingsSchemaSchema: z.ZodObject<{
    moduleId: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    fields: z.ZodArray<z.ZodObject<{
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
            options: z.ZodArray<z.ZodObject<{
                value: z.ZodString;
                label: z.ZodString;
                description: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>], "type">;
        defaultValue: z.ZodString;
        confirmationMessage: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ModuleSettingValueSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>;
export declare const ModuleSettingsEntrySchema: z.ZodObject<{
    moduleId: z.ZodString;
    label: z.ZodString;
    schema: z.ZodNullable<z.ZodObject<{
        moduleId: z.ZodString;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        fields: z.ZodArray<z.ZodObject<{
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
                options: z.ZodArray<z.ZodObject<{
                    value: z.ZodString;
                    label: z.ZodString;
                    description: z.ZodNullable<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>], "type">;
            defaultValue: z.ZodString;
            confirmationMessage: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    values: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=module-settings.d.ts.map