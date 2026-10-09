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
export const ModuleSettingFieldTypeSchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("number"), min: z.number().nullable(), max: z.number().nullable() }),
    z.strictObject({ type: z.literal("string"), maxLength: z.number().int().nonnegative().nullable() }),
    z.strictObject({ type: z.literal("boolean") }),
    z.strictObject({ type: z.literal("enum"), options: z.array(EnumOptionSchema).readonly() }),
]);
export const ModuleSettingFieldSchema = z.strictObject({
    key: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    fieldType: ModuleSettingFieldTypeSchema,
    defaultValue: z.string(),
    confirmationMessage: z.string().nullable(),
});
export const ModuleSettingsSchemaSchema = z.strictObject({
    moduleId: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    fields: z.array(ModuleSettingFieldSchema).readonly(),
});
export const ModuleSettingValueSchema = z.strictObject({
    key: z.string(),
    value: z.string(),
});
export const ModuleSettingsEntrySchema = z.strictObject({
    moduleId: z.string(),
    label: z.string(),
    schema: ModuleSettingsSchemaSchema.nullable(),
    values: z.array(ModuleSettingValueSchema).readonly(),
});
