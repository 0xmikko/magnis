import type { FacetSummary, LinkedEntitySummary } from "@magnis/host/base";

export interface NoteListItem {
  readonly id: string;
  readonly schema_id: string;
  readonly title: string;
  readonly preview: string | null;
  readonly pinned: boolean;
  readonly created_at: string;
  readonly updated_at: string | null;
}

export interface NoteDetailView extends NoteListItem {
  readonly body: string | null;
  readonly canonical: Record<string, unknown>;
  readonly facets: readonly FacetSummary[];
  readonly linked_entities: readonly LinkedEntitySummary[];
}
