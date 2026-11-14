import { z } from "zod";
import { JsonValueSchema } from "./json.js";
export const ModuleSettingsUpdateParamsSchema = z.strictObject({
    moduleId: z.string().min(1),
    values: z.record(z.string(), JsonValueSchema),
});
export const EnumOptionSchema = z.strictObject({
    value: z.string(),
    label: z.string(),
    description: z.string().nullable(),
});
const _enumOptionExact = true;
void _enumOptionExact;
export const ModuleSettingFieldTypeSchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("number"), min: z.number().nullable(), max: z.number().nullable(), integer: z.boolean() }),
    z.strictObject({ type: z.literal("string"), maxLength: z.number().int().nonnegative().nullable() }),
    z.strictObject({ type: z.literal("boolean") }),
    z.strictObject({ type: z.literal("enum"), options: z.array(EnumOptionSchema).readonly() }),
    z.strictObject({ type: z.literal("model"), capability: z.enum(["language", "embedding", "decision"]) }),
    z.strictObject({ type: z.literal("moduleChoice"), method: z.string().min(1) }),
]);
const _fieldTypeExact = true;
void _fieldTypeExact;
export const ModuleSettingFieldSchema = z.strictObject({
    key: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    fieldType: ModuleSettingFieldTypeSchema,
    defaultValue: z.string(),
    confirmationMessage: z.string().nullable(),
});
const _fieldExact = true;
void _fieldExact;
export const ModuleSettingsSchemaSchema = z.strictObject({
    moduleId: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    fields: z.array(ModuleSettingFieldSchema).readonly(),
});
const _schemaExact = true;
void _schemaExact;
export const ModuleSettingValueSchema = z.strictObject({
    key: z.string(),
    value: z.string(),
});
const _valueExact = true;
void _valueExact;
export const ModuleSettingsEntrySchema = z.strictObject({
    moduleId: z.string(),
    label: z.string(),
    schema: ModuleSettingsSchemaSchema.nullable(),
    values: z.array(ModuleSettingValueSchema).readonly(),
    userSchema: ModuleSettingsSchemaSchema.nullable(),
    userValues: z.array(ModuleSettingValueSchema).readonly(),
});
const _entryExact = true;
void _entryExact;
//# sourceMappingURL=module-settings.js.map