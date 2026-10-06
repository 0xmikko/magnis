import { z } from "zod";
export declare const WorkspaceMembershipModeSchema: z.ZodEnum<{
    singleUser: "singleUser";
    multiUser: "multiUser";
}>;
export type WorkspaceMembershipMode = z.output<typeof WorkspaceMembershipModeSchema>;
export declare const AuthenticationMethodSchema: z.ZodEnum<{
    open: "open";
    google: "google";
    password: "password";
}>;
export type AuthenticationMethod = z.output<typeof AuthenticationMethodSchema>;
export declare const WorkspaceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    membershipMode: z.ZodEnum<{
        singleUser: "singleUser";
        multiUser: "multiUser";
    }>;
    authenticationMethod: z.ZodEnum<{
        open: "open";
        google: "google";
        password: "password";
    }>;
}, z.core.$strict>;
export type Workspace = z.output<typeof WorkspaceSchema>;
export declare const WorkspaceExportResponseSchema: z.ZodObject<{
    sha256: z.ZodString;
    document: z.ZodString;
}, z.core.$strict>;
export type WorkspaceExportResponse = z.output<typeof WorkspaceExportResponseSchema>;
export declare const WorkspaceTransferReceiptSchema: z.ZodObject<{
    sha256: z.ZodString;
    status: z.ZodEnum<{
        imported: "imported";
        alreadyImported: "alreadyImported";
    }>;
}, z.core.$strict>;
export type WorkspaceTransferReceipt = z.output<typeof WorkspaceTransferReceiptSchema>;
//# sourceMappingURL=workspace.d.ts.map