import { z } from "zod";
import { SourceManifestAuthKindSchema } from "./source-auth.js";
/** Provider message identity is local to the connected account and domain. */
export function communicationMessageExternalId(schemaId, accountId, remoteId) {
    if (accountId.length === 0 || remoteId.length === 0)
        throw new Error("Communication message requires an account and provider ID");
    return `${schemaId}:${JSON.stringify(accountId)}:${JSON.stringify(remoteId)}`;
}
export const SourceProtocolVersionSchema = z.enum(["magnis.source/1", "magnis.source/2"]);
export const SourceAuthoritySchema = z.enum(["moduleSync", "toolsOnly"]);
export const SourceReleaseTierSchema = z.enum(["production", "developmentFixture"]);
export const SourceDeliveryModeSchema = z.enum(["poll", "push", "none"]);
export const CanonicalSourceAuthKindSchema = z.enum([
    "apiKey",
    "oauth2",
    "phoneCode",
    "sharedProvider",
]);
const SourceReceiptHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const SourceReceiptAccountCompatibilitySchema = z.strictObject({
    hash: SourceReceiptHashSchema,
    migratesFrom: z.array(SourceReceiptHashSchema),
});
const SourceReceiptInitializeSchema = z.strictObject({
    mcpProtocolVersion: z.string().min(1),
    serverInfoName: z.string().min(1),
    serverInfoVersion: z.string().min(1),
    capabilitiesHash: SourceReceiptHashSchema,
});
const SourceReceiptRuntimeShape = {
    implementationHash: SourceReceiptHashSchema,
    version: z.string().min(1),
};
const SourceReceiptCommonShape = {
    packageHash: SourceReceiptHashSchema,
    sourceId: z.string().min(1),
    protocol: SourceProtocolVersionSchema,
    definitionHash: SourceReceiptHashSchema,
    accountCompatibility: SourceReceiptAccountCompatibilitySchema,
    delivery: SourceDeliveryModeSchema,
    surfaces: z.array(z.string().min(1)),
    advertisedTools: z.array(z.string().min(1)),
    callableOperations: z.array(z.string().min(1)),
    initialize: SourceReceiptInitializeSchema,
    interfaceHashes: z.array(SourceReceiptHashSchema),
    scenarioIds: z.array(z.string().min(1)),
    certifierVersion: z.string().min(1),
    testkitVersion: z.string().min(1),
    matrixVersion: z.string().min(1),
};
export const SourceCertificationReceiptSchema = z.strictObject({
    ...SourceReceiptCommonShape,
    authority: SourceAuthoritySchema,
    releaseTier: SourceReleaseTierSchema,
    auth: CanonicalSourceAuthKindSchema.nullable(),
    runtime: z.strictObject({
        ...SourceReceiptRuntimeShape,
        kind: z.enum(["connectorSdk", "custom", "externalWrapped"]),
    }),
});
/** Catalog sidecars are strict snake-case wire evidence. The app decodes them
 * once into the canonical camel-case receipt; it never accepts either spelling
 * as an alias on the same boundary. */
export const SourceCertificationReceiptWireSchema = z.strictObject({
    ...SourceReceiptCommonShape,
    authority: z.enum(["module_sync", "tools_only"]),
    releaseTier: z.enum(["production", "development_fixture"]),
    auth: z.enum(["api_key", "oauth2", "phone_code", "shared_provider"]).nullable(),
    runtime: z.strictObject({
        ...SourceReceiptRuntimeShape,
        kind: z.enum(["connector_sdk", "custom", "external_wrapped"]),
    }),
}).transform((receipt) => ({
    ...receipt,
    authority: receipt.authority === "module_sync" ? "moduleSync" : "toolsOnly",
    releaseTier: receipt.releaseTier === "production" ? "production" : "developmentFixture",
    auth: receipt.auth === null
        ? null
        : receipt.auth === "api_key"
            ? "apiKey"
            : receipt.auth === "phone_code"
                ? "phoneCode"
                : receipt.auth === "shared_provider"
                    ? "sharedProvider"
                    : "oauth2",
    runtime: {
        ...receipt.runtime,
        kind: receipt.runtime.kind === "connector_sdk"
            ? "connectorSdk"
            : receipt.runtime.kind === "external_wrapped"
                ? "externalWrapped"
                : "custom",
    },
}));
export const SourceAccountLifecycleSchema = z.enum([
    "connected",
    "authRequired",
    "disconnecting",
    "revokePending",
    "revoked",
    "invalid",
]);
const SecretLocatorShape = {
    namespace: z.string().min(1),
    subjectId: z.string().min(1),
    secretKey: z.string().min(1),
    revision: z.number().int().positive(),
};
export const SourceCredentialLocatorKindSchema = z.enum([
    "minted",
    "userKey",
    "deploymentKey",
    "fixture",
]);
export const SourceCredentialLocatorSchema = z.discriminatedUnion("kind", [
    z.strictObject({ ...SecretLocatorShape, kind: z.literal("minted") }),
    z.strictObject({ ...SecretLocatorShape, kind: z.literal("userKey") }),
    z.strictObject({ ...SecretLocatorShape, kind: z.literal("deploymentKey") }),
    z.strictObject({ kind: z.literal("fixture"), fixtureId: z.string().min(1) }),
]);
export const SourceAccountGenerationSchema = z.strictObject({
    connectionId: z.string().min(1),
    userId: z.string().min(1),
    sourceId: z.string().min(1),
    accountId: z.string().min(1),
    displayName: z.string().min(1),
    authKind: CanonicalSourceAuthKindSchema,
    generation: z.number().int().positive(),
    lifecycle: SourceAccountLifecycleSchema,
    providerAccountId: z.string().min(1).nullable(),
    artifactHash: z.string().min(1).nullable(),
    accountCompatibilityHash: z.string().min(1).nullable(),
    credentialLocator: SourceCredentialLocatorSchema.nullable(),
    invalidReason: z.string().min(1).nullable(),
});
export const SourceManifestSchema = z.strictObject({
    sourceId: z.string(),
    displayName: z.string(),
    surfaces: z.array(z.string()),
    authType: SourceManifestAuthKindSchema,
    packageHash: z.string(),
    connectable: z.boolean(),
    unavailableReason: z.string().nullable(),
});
export const SourceListResponseSchema = z.strictObject({
    sources: z.array(SourceManifestSchema),
});
export const SourceAccountSchema = z.object({
    sourceId: z.string(),
    accountId: z.string(),
    surfaces: z.array(z.string()),
    status: z.string(),
    sync: z.array(z.object({
        surface: z.string(),
        phase: z.string().nullable(),
        status: z.string(),
        lastSyncAt: z.string().nullable(),
        lastError: z.string().nullable(),
        nextRetryAt: z.string().nullable(),
    })).optional(),
});
export const SourceAccountsListResponseSchema = z.object({
    accounts: z.array(SourceAccountSchema),
});
export const SourceKeyStatusSchema = z.strictObject({
    key: z.string(),
    label: z.string(),
    helpUrl: z.string().nullable(),
    description: z.string().nullable(),
    vaultConfigured: z.boolean(),
});
export const SourceKeysEntrySchema = z.strictObject({
    sourceId: z.string(),
    displayName: z.string(),
    keys: z.array(SourceKeyStatusSchema),
});
export const SourceKeysListSchema = z.strictObject({
    vaultAvailable: z.boolean(),
    sources: z.array(SourceKeysEntrySchema),
});
export const SourceAppConfigKeySchema = z.strictObject({
    key: z.string(),
    label: z.string(),
    deploymentConfigured: z.boolean(),
});
export const SourceAppConfigEntrySchema = z.strictObject({
    sourceId: z.string(),
    displayName: z.string(),
    category: z.enum(["sharedProvider", "module"]),
    keys: z.array(SourceAppConfigKeySchema).readonly(),
});
export const SourceAppConfigListSchema = z.strictObject({
    vaultAvailable: z.boolean(),
    sources: z.array(SourceAppConfigEntrySchema).readonly(),
});
export const SourceFixtureProvisionInputSchema = z.strictObject({
    sourceId: z.string().min(1),
    fixtureId: z.string().min(1),
    identityKey: z.string().min(1),
    identityLabel: z.string().min(1),
});
