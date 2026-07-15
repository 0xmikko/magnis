/**
 * Files tab on entity detail pages. Drag-and-drop dropzone + list of
 * `file.object` entities already attached to the entity via graph
 * links. Drop a file → POST /files/upload → `file.attach` to bind it
 * to the host entity → optimistic append to the local list so the new
 * row shows without a round-trip to the parent loader.
 */
import type { JSX } from "react";
import type { LinkedEntitySummary } from "./sharedTypes";
export interface FilesTabProps {
    readonly entityId: string;
    readonly attachedFiles: readonly LinkedEntitySummary[];
}
export declare function FilesTab({ entityId, attachedFiles }: FilesTabProps): JSX.Element;
