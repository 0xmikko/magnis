/**
 * File upload utility — picks a file via native dialog (Tauri) or
 * HTML file input (browser), then uploads it to the backend.
 */
import type { AppTransport } from "../runtime/contracts/transport";
export interface UploadedFile {
    readonly id: string;
    readonly name: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
}
/** Map RPC response (file.upload) to UploadedFile. */
export declare function mapRpcResult(result: {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
}): UploadedFile;
/** Map HTTP response (POST /files/upload) to UploadedFile. */
export declare function mapHttpResult(result: {
    entity_id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
}): UploadedFile;
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
