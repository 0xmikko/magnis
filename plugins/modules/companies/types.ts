// Shared DTOs for the companies plugin.
//
// Imported by both `module/` (V8 isolate, backend dispatch) and `ui/`
// (browser, transpiled on the fly by the backend Stage-10 endpoint).
// Single source of truth for the wire shape that the host frontend
// consumes via `useModuleList` and `useQuery(getRpcMethod)`.

export interface CompanyListItem {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  avatar_color: string;
  initials: string;
  created_at: string;
}

export type HeaderRow =
  | { type: "text"; label: string; value: string | null }
  | { type: "chips"; label: string; items: string[] };

export interface CompanyDetailView extends CompanyListItem {
  canonical: Partial<CompanyCanonical>;
  facets: unknown[];
  linked_entities: unknown[];
  members: string[];
  header_rows: HeaderRow[];
}

// ── schema → type maps that parameterise GraphService ──────────────
// facet schema_id → payload shape
export interface CompanyDetailsFacet {
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  domain?: string | null;
  website?: string | null;
  location?: string | null;
  size?: string | null;
  founded?: string | null;
  stage?: string | null;
  headcount?: number | null;
  funding_total?: string | null;
}
export interface CompanyFacets {
  "companies.company.details": CompanyDetailsFacet;
  "companies.company.email": { email: string; type?: string; is_primary?: boolean };
  "companies.company.phone": { phone: string; type?: string; is_primary?: boolean };
  "companies.company.external_link": {
    source_type: string;
    external_id: string;
    external_url?: string;
    external_name?: string;
  };
}

// canonical key → value
export interface CompanyCanonical {
  "companies.name": string;
  "companies.website": string | null;
  "companies.industry": string | null;
  "companies.size": string | null;
  "companies.location": string | null;
}

export interface ExternalLinkInput {
  source_type: string;
  external_id: string;
  external_url?: string;
  external_name?: string;
}

export interface CreateParams {
  name: string;
  website?: string;
  industry?: string;
  domain?: string;
  summary?: string;
  // caller-supplied entity UUID (local-first optimistic create); the
  // backend uses it as the entity id, or allocates one if omitted.
  // Frontend-only — kept out of the agent tool schema (DEC-11).
  client_id?: string;
}

/** Full enrichment patch for companies.update. Each undefined field is
 *  left untouched; provided fields are layered on as fresh facet
 *  versions (single-aligned details / collection email+phone). */
export interface UpdateParams {
  id: string;
  name?: string;
  domain?: string;
  summary?: string;
  industry?: string;
  size?: string;
  location?: string;
  founded?: string;
  stage?: string;
  headcount?: number;
  funding_total?: string;
  emails?: string[];
  phones?: string[];
  external_links?: ExternalLinkInput[];
}

// Generic RPC envelopes — ListParams / GetParams / PaginatedResponse —
// moved to `@magnis/plugin-sdk` so every plugin shares the same wire
// contract. Import from there directly:
//
//   import type { ListParams, GetParams, PaginatedResponse } from "@magnis/plugin-sdk";
