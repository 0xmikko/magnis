import { z } from "zod";
import { ModuleSettingFieldManifestSchema, ModuleSettingFieldSchema, ModuleSettingsManifestSchema, ModuleSettingsSchemaSchema } from "./module-settings.js";
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
/** Manifest-only null normalization; the admitted declaration keeps one canonical schema. */
export const ExtensionConfigurationManifestSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("module"), schema: ModuleSettingsManifestSchema }),
    z.strictObject({ kind: z.enum(["source", "model-provider"]), fields: z.array(z.discriminatedUnion("kind", [
            ExtensionConfigurationFieldSchema.options[0].extend({ field: ModuleSettingFieldManifestSchema }),
            ExtensionConfigurationFieldSchema.options[1].extend({ description: z.string().nullish().transform(value => value ?? null) }),
        ])) }),
]).transform(value => ExtensionConfigurationDeclarationSchema.parse(value));
/** Existing Source credential scope: shared-provider keys are deployment-wide;
 * otherwise labeled keys belong to a user account. Callers exclude minted keys. */
export function deploymentScopedKeys(isSharedProvider, appCredKeys, labeled) {
    if (isSharedProvider)
        return [...appCredKeys];
    const labeledSet = new Set(labeled);
    return appCredKeys.filter(key => !labeledSet.has(key));
}
export function assertSourceConfigurationScope(declaration, keys, minted, labeled, isSharedProvider) {
    if (declaration.kind !== "source")
        throw new Error("Source configuration must have kind source");
    const deployment = new Set(deploymentScopedKeys(isSharedProvider, keys.filter(key => !minted.includes(key)), labeled));
    for (const field of declaration.fields) {
        if (field.kind === "setting" && keys.includes(field.field.key))
            throw new Error(`Source credential ${field.field.key} cannot be an ordinary setting`);
        if (field.kind === "secret" && (!keys.includes(field.key) || (field.environment && !deployment.has(field.key)))) {
            throw new Error(`Source configuration field ${field.key} is not a declared deployment credential`);
        }
    }
}
//# sourceMappingURL=extension-configuration.js.map