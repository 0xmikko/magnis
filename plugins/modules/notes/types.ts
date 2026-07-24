// Notes plugin — shared wire types (backend module + frontend UI).
// Graph-only port of the native `backend/src/modules/notes` types: no
// `file_path` / `content_hash` (the on-disk markdown mirror was dropped).

import type { FacetRecord } from "@magnis/plugin-sdk";

/// Facet schema_id → payload, used to parameterise GraphService<NoteFacets, …>.
export interface NoteFacets {
  "notes.note.content": {
    title?: string;
    body: string;
    pinned?: boolean;
    updated_at?: string;
  };
}

/// Payload of a `notes.note.content` facet as read back inside the module.
export interface ContentData {
  title?: string;
  body?: string;
  pinned?: boolean;
  updated_at?: string;
}

/// Canonical key → value, used to parameterise GraphService<…, NoteCanonical>.
export interface NoteCanonical {
  "note.title": string | null;
  "note.pinned": boolean | null;
  "note.updated_at": string | null;
}

export interface NoteListItem {
  id: string;
  schema_id: string;
  title: string;
  preview: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string | null;
  is_pinned?: boolean | null;
}

export interface LinkedEntitySummary {
  id: string;
  name: string;
  schema_id: string;
  link_kind: string;
  created_at: string;
  data: unknown;
}

export interface NoteDetailView {
  id: string;
  schema_id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  canonical: Partial<NoteCanonical>;
  facets: FacetRecord[];
  linked_entities: LinkedEntitySummary[];
  created_at: string;
  updated_at: string | null;
}

/// The full-snapshot shape returned by create/update/template.apply so the
/// chat surface's NoteCard renders the body without a lazy fetch (native
/// service.rs:436-443 / 526-537).
export interface NoteSnapshot {
  id: string;
  schema_id: string;
  title: string;
  body: string;
  updated_at: string;
}

export interface NotesListParams {
  limit?: number;
  offset?: number;
  search?: string;
}
export interface GetParams {
  id: string;
}
export interface CreateParams {
  title: string;
  body: string;
  /** Client-generated UUID for optimistic create / idempotent retry. */
  client_id?: string;
}
export interface UpdateParams {
  id: string;
  title?: string;
  body?: string;
}
export interface DeleteParams {
  id: string;
}
export interface TemplateApplyParams {
  template: string;
  title: string;
  variables?: Record<string, unknown>;
}
