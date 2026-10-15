import { z } from "zod";
import { IdSchema } from "./id.js";
export const WorkspaceMembershipModeSchema = z.enum(["singleUser", "multiUser"]);
export const AuthenticationMethodSchema = z.enum(["open", "google", "password"]);
export const WorkspaceSchema = z.strictObject({
    id: IdSchema,
    name: z.string().trim().min(1),
    membershipMode: WorkspaceMembershipModeSchema,
    authenticationMethod: AuthenticationMethodSchema,
});
export const WorkspaceExportResponseSchema = z.strictObject({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    document: z.string(),
});
export const WorkspaceTransferReceiptSchema = z.strictObject({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["imported", "alreadyImported"]),
});
