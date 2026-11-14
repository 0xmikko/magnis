import { z } from "zod";

// Canonical emitted host validators; this module runs only during catalog builds.
import { ModuleSettingsManifestSchema } from "../host-stubs/types/packages/sdk/core/module-settings.js";
import {
  assertSourceConfigurationScope,
  ExtensionConfigurationManifestSchema,
  type ExtensionConfigurationDeclaration,
} from "../host-stubs/types/packages/sdk/core/extension-configuration.js";

const Manifest = z.record(z.string(), z.unknown());

/** Ordinary workspace settings remain the one Module declaration and UI schema. */
export function moduleConfigurationFromManifest(input: unknown): ExtensionConfigurationDeclaration | null {
  const manifest = Manifest.parse(input);
  if (manifest.credentials !== undefined || manifest.configuration !== undefined) {
    throw new Error("Modules declare ordinary settings only; credentials and a separate configuration are not allowed");
  }
  const id = z.string().min(1).parse(manifest.id);
  for (const setting of [manifest.settings, manifest.userSettings]) {
    if (setting === undefined) continue;
    const schema = ModuleSettingsManifestSchema.parse(setting);
    if (schema.moduleId !== id) throw new Error("Module settings must belong to the admitted module ID");
    if (new Set(schema.fields.map(field => field.key)).size !== schema.fields.length) throw new Error("Module setting keys must be unique");
  }
  return manifest.settings === undefined ? null : { kind: "module", schema: ModuleSettingsManifestSchema.parse(manifest.settings) };
}

/** Explicit Source deployment configuration never opts account credentials into env. */
export function sourceConfigurationFromManifest(input: unknown): ExtensionConfigurationDeclaration | null {
  const manifest = Manifest.parse(input);
  if (manifest.configuration === undefined) return null;
  const declaration = ExtensionConfigurationManifestSchema.parse(manifest.configuration);
  const credentials = z.object({
    keys: z.array(z.union([z.string(), z.object({ name: z.string(), label: z.string() })])),
    minted: z.array(z.string()).optional(),
  }).parse(manifest.credentials ?? { keys: [] });
  const keys = credentials.keys.map(key => typeof key === "string" ? key : key.name);
  const labeled = credentials.keys.flatMap(key => typeof key === "string" ? [] : [key.name]);
  const auth = manifest.auth === undefined ? null : Manifest.parse(manifest.auth);
  assertSourceConfigurationScope(declaration, keys, credentials.minted ?? [], labeled, auth?.type === "shared_provider");
  return declaration;
}
