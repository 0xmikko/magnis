// File plugin — shared types. Mirrors the core file.* facet shapes
// (backend/src/services/file/schemas.rs) and preserves the file.list/get/attach
// RPC contracts (formerly the native files-module controller, now this plugin)
// so call sites are unchanged.

export interface FileDetails {
  name?: string | null;
  mime_type: string;
  size_bytes?: number | null;
  local_path?: string | null;
  cloud_url?: string | null;
  source_module: string;
  source_ref: Record<string, unknown>;
}

export interface FileImage {
  width: number;
  height: number;
}
export interface FileAudio {
  duration_seconds: number;
}
export interface FileVideo {
  duration_seconds: number;
  width: number;
  height: number;
}

/// Facet map for the host GraphService generic.
export interface FileFacets {
  "file.details": FileDetails;
  "file.image": FileImage;
  "file.audio": FileAudio;
  "file.video": FileVideo;
}

/// file.* has no canonical properties.
export type FileCanonical = Record<string, never>;

export interface FileListParams {
  limit?: number;
  offset?: number;
  source_module?: string;
  mime_prefix?: string;
  parent_id?: string;
}

/// A list/get row: the file.details fields plus the entity id and a serving URL.
/// Matches the native item shape `{ ...file.details, entity_id, url }`.
export interface FileItem extends FileDetails {
  entity_id: string;
  url: string | null;
}

export interface FileListResponse {
  items: FileItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface FileGetParams {
  id: string;
}

export interface FileAttachParams {
  file_id: string;
  target_id: string;
  kind?: string;
}

export interface FileAttachResult {
  status: "ok";
  file_id: string;
  target_id: string;
  kind: string;
}
