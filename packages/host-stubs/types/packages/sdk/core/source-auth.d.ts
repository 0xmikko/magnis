import { z } from "zod";
export declare const sourceAuthKinds: readonly ["oauth2", "phoneCode", "apiKey", "sharedProvider"];
export declare const SourceAuthKindSchema: z.ZodEnum<{
    oauth2: "oauth2";
    phoneCode: "phoneCode";
    apiKey: "apiKey";
    sharedProvider: "sharedProvider";
}>;
export type SourceAuthKind = z.output<typeof SourceAuthKindSchema>;
/** Source manifests and connected fixture status may describe an auth-less
 * connector. Credential-repair contracts intentionally exclude it. */
export declare const SourceManifestAuthKindSchema: z.ZodEnum<{
    none: "none";
    oauth2: "oauth2";
    phoneCode: "phoneCode";
    apiKey: "apiKey";
    sharedProvider: "sharedProvider";
}>;
export type SourceManifestAuthKind = z.output<typeof SourceManifestAuthKindSchema>;
export declare const repairActions: readonly ["reconnectOauth", "reloginPhone", "enterKey", "replaceKey"];
export declare const RepairActionSchema: z.ZodEnum<{
    reconnectOauth: "reconnectOauth";
    reloginPhone: "reloginPhone";
    enterKey: "enterKey";
    replaceKey: "replaceKey";
}>;
export type RepairAction = z.output<typeof RepairActionSchema>;
export declare const AuthLossReasonSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    reason: z.ZodLiteral<"oauthExpired">;
}, z.core.$strip>, z.ZodObject<{
    reason: z.ZodLiteral<"oauthRevoked">;
}, z.core.$strip>, z.ZodObject<{
    reason: z.ZodLiteral<"sessionLost">;
}, z.core.$strip>, z.ZodObject<{
    reason: z.ZodLiteral<"keyRejected">;
    providerMessage: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    reason: z.ZodLiteral<"keyRemoved">;
}, z.core.$strip>], "reason">;
export type AuthLossReason = z.output<typeof AuthLossReasonSchema>;
export declare const VerifiedAuthSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"oauth">;
    connectionId: z.ZodString;
    subject: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"phoneSession">;
    connectionId: z.ZodString;
    subject: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"apiKey">;
    keyFrom: z.ZodEnum<{
        vault: "vault";
        env: "env";
    }>;
    subject: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"sharedProvider">;
    subject: z.ZodString;
}, z.core.$strip>], "kind">;
export type VerifiedAuth = z.output<typeof VerifiedAuthSchema>;
//# sourceMappingURL=source-auth.d.ts.map