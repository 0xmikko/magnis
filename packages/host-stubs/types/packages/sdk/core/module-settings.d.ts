import { z } from "zod";
export declare const ModuleSettingsUpdateParamsSchema: z.ZodObject<{
    moduleId: z.ZodString;
    values: z.ZodRecord<z.ZodString, z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type ModuleSettingsUpdateParams = z.output<typeof ModuleSettingsUpdateParamsSchema>;
/** One choice of an enum setting. */
export interface EnumOption {
    value: string;
    label: string;
    description: string | null;
}
export declare const EnumOptionSchema: z.ZodObject<{
    value: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
/** A module setting's type. A number says whether it takes fractions; a model
 * names a model of AI Models by its capability, and only a model the AI Models
 * directory lists as available for that capability is accepted. A
 * moduleChoice's choices are what the module's RPC `<moduleId>.<method>`
 * answers for the person asking, so only `[userSettings]` declares one. */
export type ModuleSettingFieldType = {
    type: "number";
    min: number | null;
    max: number | null;
    integer: boolean;
} | {
    type: "string";
    maxLength: number | null;
} | {
    type: "boolean";
} | {
    type: "enum";
    options: readonly EnumOption[];
} | {
    type: "model";
    capability: "language" | "embedding" | "decision";
} | {
    type: "moduleChoice";
    method: string;
};
export declare const ModuleSettingFieldTypeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"number">;
    min: z.ZodNullable<z.ZodNumber>;
    max: z.ZodNullable<z.ZodNumber>;
    integer: z.ZodBoolean;
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
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"model">;
    capability: z.ZodEnum<{
        language: "language";
        embedding: "embedding";
        decision: "decision";
    }>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"moduleChoice">;
    method: z.ZodString;
}, z.core.$strict>], "type">;
/** One declared setting. */
export interface ModuleSettingField {
    key: string;
    label: string;
    description: string | null;
    fieldType: ModuleSettingFieldType;
    defaultValue: string;
    confirmationMessage: string | null;
}
export declare const ModuleSettingFieldSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"number">;
        min: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
        integer: z.ZodBoolean;
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
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"model">;
        capability: z.ZodEnum<{
            language: "language";
            embedding: "embedding";
            decision: "decision";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"moduleChoice">;
        method: z.ZodString;
    }, z.core.$strict>], "type">;
    defaultValue: z.ZodString;
    confirmationMessage: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
/** A module's settings declaration: its manifest's `[settings]` or `[userSettings]`. */
export interface ModuleSettingsSchema {
    moduleId: string;
    label: string;
    description: string | null;
    fields: readonly ModuleSettingField[];
}
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
            integer: z.ZodBoolean;
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
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"model">;
            capability: z.ZodEnum<{
                language: "language";
                embedding: "embedding";
                decision: "decision";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"moduleChoice">;
            method: z.ZodString;
        }, z.core.$strict>], "type">;
        defaultValue: z.ZodString;
        confirmationMessage: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const ModuleSettingFieldManifestSchema: z.ZodPipe<z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    defaultValue: z.ZodString;
    description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
    confirmationMessage: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
    fieldType: z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"enum">;
        options: z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
            description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"string">;
        maxLength: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"number">;
        min: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
        max: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
        integer: z.ZodBoolean;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"number">;
        min: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
        integer: z.ZodBoolean;
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
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"model">;
        capability: z.ZodEnum<{
            language: "language";
            embedding: "embedding";
            decision: "decision";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"moduleChoice">;
        method: z.ZodString;
    }, z.core.$strict>], "type">]>;
}, z.core.$strict>, z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"number">;
        min: z.ZodNullable<z.ZodNumber>;
        max: z.ZodNullable<z.ZodNumber>;
        integer: z.ZodBoolean;
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
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"model">;
        capability: z.ZodEnum<{
            language: "language";
            embedding: "embedding";
            decision: "decision";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"moduleChoice">;
        method: z.ZodString;
    }, z.core.$strict>], "type">;
    defaultValue: z.ZodString;
    confirmationMessage: z.ZodNullable<z.ZodString>;
}, z.core.$strict>>;
export declare const ModuleSettingsManifestSchema: z.ZodPipe<z.ZodObject<{
    moduleId: z.ZodString;
    label: z.ZodString;
    description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
    fields: z.ZodArray<z.ZodPipe<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        defaultValue: z.ZodString;
        description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
        confirmationMessage: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
        fieldType: z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"enum">;
            options: z.ZodArray<z.ZodObject<{
                value: z.ZodString;
                label: z.ZodString;
                description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"string">;
            maxLength: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"number">;
            min: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
            max: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, z.ZodTransform<number | null, number | null | undefined>>;
            integer: z.ZodBoolean;
        }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"number">;
            min: z.ZodNullable<z.ZodNumber>;
            max: z.ZodNullable<z.ZodNumber>;
            integer: z.ZodBoolean;
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
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"model">;
            capability: z.ZodEnum<{
                language: "language";
                embedding: "embedding";
                decision: "decision";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"moduleChoice">;
            method: z.ZodString;
        }, z.core.$strict>], "type">]>;
    }, z.core.$strict>, z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"number">;
            min: z.ZodNullable<z.ZodNumber>;
            max: z.ZodNullable<z.ZodNumber>;
            integer: z.ZodBoolean;
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
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"model">;
            capability: z.ZodEnum<{
                language: "language";
                embedding: "embedding";
                decision: "decision";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"moduleChoice">;
            method: z.ZodString;
        }, z.core.$strict>], "type">;
        defaultValue: z.ZodString;
        confirmationMessage: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodTransform<{
    moduleId: string;
    label: string;
    description: string | null;
    fields: readonly {
        key: string;
        label: string;
        description: string | null;
        fieldType: {
            type: "number";
            min: number | null;
            max: number | null;
            integer: boolean;
        } | {
            type: "string";
            maxLength: number | null;
        } | {
            type: "boolean";
        } | {
            type: "enum";
            options: readonly {
                value: string;
                label: string;
                description: string | null;
            }[];
        } | {
            type: "model";
            capability: "language" | "embedding" | "decision";
        } | {
            type: "moduleChoice";
            method: string;
        };
        defaultValue: string;
        confirmationMessage: string | null;
    }[];
}, {
    moduleId: string;
    label: string;
    description: string | null;
    fields: {
        key: string;
        label: string;
        description: string | null;
        fieldType: {
            type: "number";
            min: number | null;
            max: number | null;
            integer: boolean;
        } | {
            type: "string";
            maxLength: number | null;
        } | {
            type: "boolean";
        } | {
            type: "enum";
            options: readonly {
                value: string;
                label: string;
                description: string | null;
            }[];
        } | {
            type: "model";
            capability: "language" | "embedding" | "decision";
        } | {
            type: "moduleChoice";
            method: string;
        };
        defaultValue: string;
        confirmationMessage: string | null;
    }[];
}>>;
/** One setting's current value. */
export interface ModuleSettingValue {
    key: string;
    value: string;
}
export declare const ModuleSettingValueSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strict>;
/** One module in Settings → Modules: its workspace settings and the signed-in person's own. */
export interface ModuleSettingsEntry {
    moduleId: string;
    label: string;
    schema: ModuleSettingsSchema | null;
    values: readonly ModuleSettingValue[];
    userSchema: ModuleSettingsSchema | null;
    /** The signed-in person's. */
    userValues: readonly ModuleSettingValue[];
}
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
                integer: z.ZodBoolean;
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
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"model">;
                capability: z.ZodEnum<{
                    language: "language";
                    embedding: "embedding";
                    decision: "decision";
                }>;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"moduleChoice">;
                method: z.ZodString;
            }, z.core.$strict>], "type">;
            defaultValue: z.ZodString;
            confirmationMessage: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    values: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
    }, z.core.$strict>>>;
    userSchema: z.ZodNullable<z.ZodObject<{
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
                integer: z.ZodBoolean;
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
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"model">;
                capability: z.ZodEnum<{
                    language: "language";
                    embedding: "embedding";
                    decision: "decision";
                }>;
            }, z.core.$strict>, z.ZodObject<{
                type: z.ZodLiteral<"moduleChoice">;
                method: z.ZodString;
            }, z.core.$strict>], "type">;
            defaultValue: z.ZodString;
            confirmationMessage: z.ZodNullable<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    userValues: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
//# sourceMappingURL=module-settings.d.ts.map