import { z } from "zod";
export type WorkspaceMembershipMode = "singleUser" | "multiUser";
export type AuthenticationMethod = "open" | "google" | "password";
export interface Workspace {
    readonly id: string;
    readonly name: string;
    readonly membershipMode: WorkspaceMembershipMode;
    readonly authenticationMethod: AuthenticationMethod;
}
export interface WorkspaceExportResponse {
    readonly sha256: string;
    readonly document: string;
}
export interface WorkspaceTransferReceipt {
    readonly sha256: string;
    readonly status: "imported" | "alreadyImported";
}
export declare const WorkspaceMembershipModeSchema: z.ZodEnum<{
    singleUser: "singleUser";
    multiUser: "multiUser";
}>;
export declare const AuthenticationMethodSchema: z.ZodEnum<{
    open: "open";
    google: "google";
    password: "password";
}>;
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
export declare const WorkspaceExportResponseSchema: z.ZodObject<{
    sha256: z.ZodString;
    document: z.ZodString;
}, z.core.$strict>;
export declare const WorkspaceTransferReceiptSchema: z.ZodObject<{
    sha256: z.ZodString;
    status: z.ZodEnum<{
        imported: "imported";
        alreadyImported: "alreadyImported";
    }>;
}, z.core.$strict>;
//# sourceMappingURL=workspace.d.ts.map