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
/** Manifest-only null normalization; the admitted declaration keeps one canonical schema. */
export declare const ExtensionConfigurationManifestSchema: z.ZodPipe<z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"module">;
    schema: z.ZodPipe<z.ZodObject<{
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
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodEnum<{
        source: "source";
        "model-provider": "model-provider";
    }>;
    fields: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"setting">;
        required: z.ZodBoolean;
        environment: z.ZodBoolean;
        field: z.ZodPipe<z.ZodObject<{
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
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"secret">;
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        environment: z.ZodBoolean;
        delivery: z.ZodEnum<{
            host_only: "host_only";
            extension: "extension";
        }>;
        description: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>;
    }, z.core.$strict>], "kind">>;
}, z.core.$strict>], "kind">, z.ZodTransform<{
    kind: "module";
    schema: {
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
    };
} | {
    kind: "source" | "model-provider";
    fields: readonly ({
        kind: "setting";
        field: {
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
        };
        required: boolean;
        environment: boolean;
    } | {
        kind: "secret";
        key: string;
        label: string;
        description: string | null;
        required: boolean;
        environment: boolean;
        delivery: "host_only" | "extension";
    })[];
}, {
    kind: "module";
    schema: {
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
    };
} | {
    kind: "source" | "model-provider";
    fields: ({
        kind: "setting";
        required: boolean;
        environment: boolean;
        field: {
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
        };
    } | {
        kind: "secret";
        key: string;
        label: string;
        required: boolean;
        environment: boolean;
        delivery: "host_only" | "extension";
        description: string | null;
    })[];
}>>;
/** Existing Source credential scope: shared-provider keys are deployment-wide;
 * otherwise labeled keys belong to a user account. Callers exclude minted keys. */
export declare function deploymentScopedKeys(isSharedProvider: boolean, appCredKeys: readonly string[], labeled: readonly string[]): string[];
export declare function assertSourceConfigurationScope(declaration: ExtensionConfigurationDeclaration, keys: readonly string[], minted: readonly string[], labeled: readonly string[], isSharedProvider: boolean): void;
/** The established environment segment transformation; ownership is never reverse-parsed. */
export declare function envSegment(value: string): string;
//# sourceMappingURL=extension-configuration.d.ts.map