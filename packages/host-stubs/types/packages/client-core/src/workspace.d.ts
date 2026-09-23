import type { WorkspaceExportResponse, WorkspaceTransferReceipt } from "@magnis/sdk/core/workspace";
import { type HttpRequestOptions } from "./transport/http.ts";
type WorkspaceHttpOptions = Omit<HttpRequestOptions, "token">;
/** Export the authenticated user's workspace through the shared SDK transport. */
export declare function exportWorkspace(baseUrl: string, token: string, options: WorkspaceHttpOptions): Promise<WorkspaceExportResponse>;
/** Import canonical YAML into the authenticated user's fresh workspace. */
export declare function importWorkspace(baseUrl: string, token: string, document: string, options: WorkspaceHttpOptions): Promise<WorkspaceTransferReceipt>;
export {};
