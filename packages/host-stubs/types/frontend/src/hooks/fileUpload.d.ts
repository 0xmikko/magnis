/**
 * File upload utility — picks a file via native dialog (Tauri) or
 * HTML file input (browser), then uploads it to the backend. Both paths
 * parse the SDK answer once: `file.upload` through its RPC contract, and
 * `POST /files/upload` through its HTTP contract.
 */
import { type FileUploadResult } from "@magnis/sdk";
import type { AppTransport } from "../runtime/contracts/transport";
/** The file either upload path created: the `file.upload` answer's fields
 * that the multipart answer carries too. */
export type UploadedFile = Readonly<Pick<FileUploadResult, "id" | "name" | "mimeType" | "sizeBytes">>;
/** Extract filename from an absolute path (handles both / and \ separators). */
export declare function extractFilename(filePath: string): string;
/**
 * Opens a file picker and uploads the selected file.
 * Returns the uploaded file metadata, or null if the user cancelled.
 */
export declare function uploadFile(transport: AppTransport): Promise<UploadedFile | null>;
/**
 * Upload a pre-picked browser File to the backend. Useful when the caller
 * owns its own `<input type="file">` (e.g. an attachment picker inside a
 * composer).
 */
export declare function uploadBrowserFile(transport: AppTransport, file: File): Promise<UploadedFile>;
