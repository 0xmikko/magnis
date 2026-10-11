import { z } from "zod";
export const sourceAuthKinds = ["oauth2", "phoneCode", "apiKey", "sharedProvider"];
export const SourceAuthKindSchema = z.enum(sourceAuthKinds);
/** Source manifests and connected fixture status may describe an auth-less
 * connector. Credential-repair contracts intentionally exclude it. */
export const SourceManifestAuthKindSchema = z.enum([
    ...sourceAuthKinds,
    "none",
]);
export const repairActions = ["reconnectOauth", "reloginPhone", "enterKey", "replaceKey"];
export const RepairActionSchema = z.enum(repairActions);
export const AuthLossReasonSchema = z.discriminatedUnion("reason", [
    z.object({ reason: z.literal("oauthExpired") }),
    z.object({ reason: z.literal("oauthRevoked") }),
    z.object({ reason: z.literal("sessionLost") }),
    z.object({ reason: z.literal("keyRejected"), providerMessage: z.string() }),
    z.object({ reason: z.literal("keyRemoved") }),
]);
export const VerifiedAuthSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("oauth"), connectionId: z.string(), subject: z.string() }),
    z.object({ kind: z.literal("phoneSession"), connectionId: z.string(), subject: z.string() }),
    z.object({ kind: z.literal("apiKey"), keyFrom: z.enum(["vault", "env"]), subject: z.string() }),
    z.object({ kind: z.literal("sharedProvider"), subject: z.string() }),
]);
