import { z } from "zod";
import { ModuleSettingFieldSchema, ModuleSettingsSchemaSchema } from "./module-settings.js";
export const ExtensionConfigurationFieldSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("setting"), field: ModuleSettingFieldSchema, required: z.boolean(), environment: z.boolean() }),
    z.strictObject({ kind: z.literal("secret"), key: z.string().min(1), label: z.string().min(1), description: z.string().nullable(), required: z.boolean(), environment: z.boolean(), delivery: z.enum(["host_only", "extension"]) }),
]);
export const ExtensionConfigurationDeclarationSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("module"), schema: ModuleSettingsSchemaSchema }),
    z.strictObject({ kind: z.enum(["source", "model-provider"]), fields: z.array(ExtensionConfigurationFieldSchema).readonly() }),
]).superRefine((declaration, context) => {
    const keys = declaration.kind === "module" ? declaration.schema.fields.map((field) => field.key)
        : declaration.fields.map((field) => field.kind === "setting" ? field.field.key : field.key);
    if (new Set(keys).size !== keys.length)
        context.addIssue({ code: "custom", message: "Configuration field keys must be unique" });
});
//# sourceMappingURL=extension-configuration.js.map