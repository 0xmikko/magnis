import type { AvatarColor, FacetSummary, LinkedEntitySummary } from "@magnis/host/base";

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
  readonly avatar_color: string;
  readonly initials: string;
  readonly created_at: string;
}

export interface ProjectDetailView extends ProjectListItem {
  readonly canonical: Record<string, unknown>;
  readonly facets: readonly FacetSummary[];
  readonly linked_entities: readonly LinkedEntitySummary[];
}

export interface ProjectProfile {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly status: string;
  readonly preview: string;
  readonly time: string;
  readonly color: AvatarColor;
}
