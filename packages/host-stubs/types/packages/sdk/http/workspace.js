import { z } from "zod";
import { WorkspaceExportResponseSchema, WorkspaceSchema, WorkspaceTransferReceiptSchema, } from "../core/workspace.js";
import { WorkspaceInstallationDocumentSchema, WorkspaceInstallationStatusSchema, } from "../core/workspace-installation.js";
import { defineHttpContract } from "./contract.js";
export const workspaceContract = defineHttpContract({
    method: "GET",
    path: "/api/workspace",
    input: z.object({}),
    output: WorkspaceSchema,
});
export const exportWorkspaceContract = defineHttpContract({
    method: "GET",
    path: "/api/workspace/export",
    input: z.object({}),
    output: WorkspaceExportResponseSchema,
});
export const importWorkspaceContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/import",
    input: z.object({ document: z.string() }),
    output: WorkspaceTransferReceiptSchema,
});
/** The installation record on the workspace singleton. Admin only. */
export const getWorkspaceInstallationContract = defineHttpContract({
    method: "GET",
    path: "/api/workspace/installation",
    input: z.object({}),
    output: WorkspaceInstallationStatusSchema,
});
/** Submit the ONE document the server installs. Admin only; 409 while a run
 * is in progress. Answers once the row says installing — the run continues on
 * the server, and the browser polls the status above. */
export const startWorkspaceInstallationContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/installation",
    input: WorkspaceInstallationDocumentSchema,
    output: z.strictObject({ status: z.enum(["installing", "ready"]) }),
});
/** What that document WOULD install, in the order the run would walk it —
 * every key, `module:` and `source:` and the embedding model, as the run
 * names them. Admin only. It installs nothing: it is what the last screen
 * before `Install` shows. */
export const previewWorkspaceInstallationContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/installation/preview",
    input: WorkspaceInstallationDocumentSchema,
    output: z.strictObject({ steps: z.array(z.string()) }),
});
export const workspaceLoginContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/auth/login",
    input: z.object({
        email: z.string().nullable().default(null),
        password: z.string().nullable().default(null),
    }),
    output: z.strictObject({ token: z.string() }),
});
export const workspaceLogoutContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/auth/logout",
    input: z.object({}),
    output: z.strictObject({ status: z.literal("loggedOut") }),
});
export const workspaceGoogleAuthStartContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/auth/google/start",
    input: z.object({ redirectUri: z.string(), source: z.string().nullable() }),
    output: z.strictObject({ authorizeUrl: z.string(), state: z.string() }),
});
export const workspaceGoogleAuthExchangeContract = defineHttpContract({
    method: "POST",
    path: "/api/workspace/auth/google/exchange",
    input: z.object({ code: z.string(), state: z.string(), redirectUri: z.string() }),
    output: z.strictObject({ token: z.string() }),
});
/** Effective portable configuration for the requesting administrator. */
export const getWorkspaceInstallationDocumentContract = defineHttpContract({
    method: "GET",
    path: "/api/workspace/installation/document",
    input: z.object({}),
    output: WorkspaceInstallationDocumentSchema,
});
