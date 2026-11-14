import { z } from "zod";
import type { JsonValue } from "./json.js";
import type { ModuleSettingField, ModuleSettingsSchema } from "./module-settings.js";
export type ExtensionConfigurationField = {
    readonly kind: "setting";
    readonly field: ModuleSettingField;
    readonly required: boolean;
    readonly environment: boolean;
} | {
    readonly kind: "secret";
    readonly key: string;
    readonly label: string;
    readonly description: string | null;
    readonly required: boolean;
    readonly environment: boolean;
    readonly delivery: "host_only" | "extension";
};
export declare const ExtensionConfigurationFieldSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"setting">;
    field: z.ZodObject<{
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
    required: z.ZodBoolean;
    environment: z.ZodBoolean;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"secret">;
    key: z.ZodString;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    required: z.ZodBoolean;
    environment: z.ZodBoolean;
    delivery: z.ZodEnum<{
        host_only: "host_only";
        extension: "extension";
    }>;
}, z.core.$strict>], "kind">;
export type ExtensionConfigurationDeclaration = {
    readonly kind: "module";
    readonly schema: ModuleSettingsSchema;
} | {
    readonly kind: "source" | "model-provider";
    readonly fields: readonly ExtensionConfigurationField[];
};
export declare const ExtensionConfigurationDeclarationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"module">;
    schema: z.ZodObject<{
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
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        "model-provider": "model-provider";
    }>;
    fields: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"setting">;
        field: z.ZodObject<{
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
        required: z.ZodBoolean;
        environment: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        required: z.ZodBoolean;
        environment: z.ZodBoolean;
        delivery: z.ZodEnum<{
            host_only: "host_only";
            extension: "extension";
        }>;
    }, z.core.$strict>], "kind">>>;
}, z.core.$strict>], "kind">;
export type ExtensionConfigurationOwner = {
    readonly kind: "source";
    readonly id: string;
} | {
    readonly kind: "module";
    readonly id: string;
} | {
    readonly kind: "model-provider";
    readonly id: string;
};
export interface ExtensionConfigurationFieldStatus {
    readonly key: string;
    readonly kind: "setting" | "secret";
    readonly state: "unset" | "set" | "cleared";
    readonly origin: "env" | "application" | null;
    readonly environmentName: string | null;
}
/** Bound by the host to the admitted caller; settings never contain secrets. */
export interface ExtensionConfigurationAccess {
    readSettings(): Promise<Readonly<Record<string, JsonValue>>>;
}
//# sourceMappingURL=extension-configuration.d.ts.map