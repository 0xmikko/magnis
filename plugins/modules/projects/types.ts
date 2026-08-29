// Shared DTOs for the projects plugin — wire shapes the host frontend
// consumes. Mirrors the legacy Rust projects ProjectListItem /
// ProjectDetailView 1:1.


export interface ProjectListItem {
  id: string;
  schema_id: string;
  name: string;
  status: string | null;
  created_at: string;
  is_pinned?: boolean | null;
}

export interface LinkedEntitySummary {
  id: string;
  name: string | null;
  schema_id: string;
  link_kind: string;
  created_at: string;
  data: unknown;
}

export interface ProjectDetailView {
  id: string;
  schema_id: string;
  name: string;
  status: string | null;
  canonical: Partial<ProjectCanonical>;
  linked_entities: LinkedEntitySummary[];
  created_at: string;
}

// ── schema → type maps that parameterise GraphService ──────────────
export interface ChecklistItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  notes?: string;
  updated_at?: string;
}


export interface ProjectCanonical {
  "project.name": string | null;
  "project.status": string | null;
}

// ── RPC params ──────────────────────────────────────────────────────
export interface ProjectsListParams {
  limit?: number;
  offset?: number;
  search?: string;
}
export interface CreateParams {
  name: string;
  status?: string;
  client_id?: string;
}
export interface UpdateParams {
  id: string;
  name?: string;
  status?: string;
  description?: string;
}
export interface ChecklistGetParams {
  project_id: string;
}
export interface ChecklistUpdateParams {
  project_id: string;
  items: ChecklistItem[];
}
export interface MemberParams {
  project_id: string;
  entity_id: string;
}
export interface ListForEntityParams {
  entity_id: string;
}
