import { z } from "zod";
import { RepairActionSchema, SourceAuthKindSchema, SourceManifestAuthKindSchema } from "./source-auth.js";
import { SourceAccountLifecycleSchema, SourceCredentialLocatorKindSchema } from "./source.js";
import { AccountSyncStateSchema } from "./sync.js";
export const SourceAvailabilitySchema = z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("installedDisabled"), packageHash: z.string().min(1) }),
    z.strictObject({ state: z.literal("active"), packageHash: z.string().min(1) }),
    z.strictObject({ state: z.literal("unavailable"), packageHash: z.string().min(1), reason: z.string().min(1) }),
]);
const ReadyCredentialStatusSchema = z.discriminatedUnion("kind", [
    z.strictObject({ state: z.literal("ready"), kind: z.literal("minted"), revision: z.number().int().positive() }),
    z.strictObject({ state: z.literal("ready"), kind: z.literal("userKey"), revision: z.number().int().positive() }),
    z.strictObject({ state: z.literal("ready"), kind: z.literal("deploymentKey"), revision: z.number().int().positive() }),
    z.strictObject({ state: z.literal("ready"), kind: z.literal("fixture"), revision: z.null() }),
]);
export const SourceCredentialStatusSchema = z.union([
    z.strictObject({ state: z.literal("unconfigured") }),
    ReadyCredentialStatusSchema,
    z.strictObject({ state: z.literal("unavailable"), kind: SourceCredentialLocatorKindSchema, reason: z.string().min(1) }),
]);
export const SourceRuntimeStatusSchema = z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("absent") }),
    z.strictObject({ state: z.literal("starting") }),
    z.strictObject({ state: z.literal("ready") }),
    z.strictObject({ state: z.literal("stopping"), reason: z.string().min(1) }),
    z.strictObject({ state: z.literal("failed"), reason: z.string().min(1) }),
]);
const SourceAccountStatusCommonShape = {
    accountId: z.string().min(1),
    displayName: z.string().min(1),
    providerAccountId: z.string().min(1).nullable(),
    authKind: SourceManifestAuthKindSchema,
    generation: z.number().int().positive(),
    invalidReason: z.string().min(1).nullable(),
    credential: SourceCredentialStatusSchema,
    runtime: SourceRuntimeStatusSchema,
    /** One per surface the account has on this Source: its sync as the worker
     * reports it; null for a surface without a worker (not started). */
    surfaces: z.array(z.strictObject({ surface: z.string().min(1), sync: AccountSyncStateSchema.nullable() })),
};
export const SourceAccountStatusSchema = z.discriminatedUnion("lifecycle", [
    z.strictObject({
        ...SourceAccountStatusCommonShape,
        authKind: SourceAuthKindSchema,
        lifecycle: z.literal("authRequired"),
        repair: RepairActionSchema,
    }),
    ...SourceAccountLifecycleSchema.options
        .filter((value) => value !== "authRequired")
        .map((lifecycle) => z.strictObject({ ...SourceAccountStatusCommonShape, lifecycle: z.literal(lifecycle), repair: z.null() })),
]);
export const SourceStatusSchema = z.strictObject({
    sourceId: z.string().min(1),
    displayName: z.string().min(1),
    availability: SourceAvailabilitySchema,
    accounts: z.array(SourceAccountStatusSchema),
});
export const SourceStatusListResponseSchema = z.strictObject({ sources: z.array(SourceStatusSchema) });
