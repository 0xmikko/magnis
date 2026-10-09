import { z } from "zod";
export const extensionKinds = ["module", "source", "skill"];
export const ExtensionKindSchema = z.enum(extensionKinds);
export const extensionLifecycleStates = [
    "available",
    "installed_disabled",
    "active",
    "activation_failed",
];
export const ExtensionLifecycleStateSchema = z.enum(extensionLifecycleStates);
export const ExtensionUiDescriptorSchema = z.strictObject({
    moduleId: z.string().min(1),
    packageHash: z.string().min(1),
    entry: z.string().min(1),
    exportName: z.string().min(1),
});
export const ExtensionViewSchema = z.strictObject({
    kind: ExtensionKindSchema,
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    publisher: z.string(),
    publisherUrl: z.string().optional(),
    iconUrl: z.string(),
    details: z.string(),
    docsUrl: z.string().optional(),
    version: z.string(),
    state: ExtensionLifecycleStateSchema,
    stateReason: z.string().optional(),
    connection: z.string().optional(),
    installable: z.boolean(),
    installed: z.boolean(),
    enabled: z.boolean(),
    packageHash: z.string().nullable(),
    ui: ExtensionUiDescriptorSchema.optional(),
    removable: z.boolean(),
    position: z.number().int(),
    blockingDependents: z.array(z.string()),
    unmetRequirements: z.array(z.string()),
    surfaces: z.array(z.string()),
});
export const ExtensionListResultSchema = z.strictObject({
    extensions: z.array(ExtensionViewSchema),
});
export const ExtensionCatalogRefreshResultSchema = z.union([
    z.strictObject({
        available: z.literal(true),
        packages: z.number().int().nonnegative(),
        channel: z.string(),
        /** The channel's own curation document, opaque, under its own keys. */
        curation: z.unknown().nullable(),
    }),
    z.strictObject({
        available: z.literal(false),
        reason: z.string(),
    }),
]);
export const MagnisApiVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
