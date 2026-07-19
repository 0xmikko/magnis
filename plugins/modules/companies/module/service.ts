// Companies plugin — backend module. Runs inside the deno_core V8
// isolate. Decorated class: each @tool co-locates the agent tool
// contract with its RPC handler; definePlugin (index.ts) wires them.
//
// Reads use the efficient graph read-API (email parity): list →
// list_entities_window (P2) with the details facet inline / search →
// search_entities_by_name + list_facets_for_entities (batch); get →
// get_entity_full (P1) + one get_canonical. Fixed, N-independent crossings.

import { tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type { GetParams, ListParams, PaginatedResponse } from "@magnis/plugin-sdk";
import type {
  CompanyCanonical,
  CompanyDetailsFacet,
  CompanyDetailView,
  CompanyFacets,
  CompanyListItem,
  CreateParams,
  HeaderRow,
  UpdateParams,
} from "../types.ts";
import {
  COMPANY,
  COMPANY_DETAILS,
  COMPANY_EMAIL,
  COMPANY_EXTERNAL_LINK,
  COMPANY_PHONE,
} from "../schema.ts";
import { buildListItem } from "./helpers.ts";

export class CompaniesModule {
  private readonly graph: GraphService<CompanyFacets, CompanyCanonical>;
  constructor(deps: PluginDeps<CompanyFacets, CompanyCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", {
    description: "List companies with pagination and optional name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async list(params: ListParams): Promise<PaginatedResponse<CompanyListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    let rows: { id: string; schema_id: string; name: string; created_at?: string }[];
    let total: number;
    if (search.length > 0) {
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [COMPANY],
        limit: limit + offset,
      });
      // Sort alphabetically by name (parity with staging, which sorted ALL
      // results; search_entities_by_name returns prefix/date order otherwise).
      matched.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      // Page + total ordered by the indexed `idx` column (lowercased name →
      // case-insensitive name order). No facet_schema: the list fields come from
      // canonical, not the latest facet (see buildListItem). The window honors
      // only the explicit order, so it does NOT add pinned-first — matching
      // staging's JS name sort which had no pinned priority.
      const win = await this.graph.list_entities_window({
        schema: COMPANY,
        order: [{ field: { entity_field: "idx" }, desc: false }],
        limit,
        offset,
      });
      rows = win.items.map((r) => r.entity);
      total = win.total;
    }

    // Hydrate the page's canonical (companies.name/website/industry/size/
    // location) in ONE batch read — no per-row get_canonical N+1.
    const canonById = await this.canonicalByEntity(rows.map((e) => e.id));
    const items = rows.map((e) => buildListItem(e, canonById.get(e.id) ?? {}));
    return { items, total, limit, offset };
  }

  @tool("get", {
    description: "Get a full company detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<CompanyDetailView> {
    // P1: user-scoped entity (+ schema guard) in ONE fetch. The detail view does
    // not surface link neighbours (members/linked_entities stay empty, native
    // parity). Facets come from list_facets_for_entity so the DTO carries ALL
    // facets (get_entity_full would dedup to latest-per-schema, dropping the
    // collection email/phone facets the old get returned). One get_canonical
    // for the canonical block.
    const detail = await this.graph.get_entity_full(params.id);
    if (detail?.entity.schema_id !== COMPANY) {
      throw new Error(`company not found: ${params.id}`);
    }
    const { entity } = detail;
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const canonical = await this.graph.get_canonical(entity.id, []);
    // base/header read CANONICAL (single_aligned by confidence→recency), not the
    // latest facet — parity with staging's canonical-driven detail view.
    const base = buildListItem(entity, canonical);
    const members: string[] = [];
    const header_rows: HeaderRow[] = [
      { type: "text", label: "Website", value: base.website },
      { type: "text", label: "Industry", value: base.industry },
      { type: "text", label: "Size", value: base.size },
      { type: "chips", label: `Team members (${String(members.length)})`, items: members },
    ];
    return { ...base, canonical, facets, linked_entities: [], members, header_rows };
  }

  // `params` is the AGENT-facing schema → omits `client_id` (the
  // frontend-only optimistic-create UUID). The handler still accepts
  // it via CreateParams; the WS RPC path is not validated against this
  // schema (DEC-11).
  @writeTool("create", {
    description:
      "Create a company. Idempotent by name (case-insensitive, trimmed): if a " +
      "company with the same name already exists it is returned instead of " +
      "creating a duplicate. `domain` derives the website; `summary` becomes " +
      "the description. Follow up with companies.update for richer enrichment.",
    params: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        summary: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  })
  async create(params: CreateParams): Promise<CompanyListItem> {
    // Idempotent by name (parity with staging companies.create): return the
    // existing company if one already matches, so the agent can call create
    // without a pre-search and without producing duplicates.
    const needle = params.name.trim().toLowerCase();
    const existing = await this.graph.search_entities_by_name({
      query: needle,
      schema_ids: [COMPANY],
      limit: 25,
    });
    const match = existing.find((c) => c.name.trim().toLowerCase() === needle);
    if (match) {
      // Write path (idempotent return) — one canonical read hydrates the matched
      // entity's list item; not the hot read path.
      return this.listItemFor(match);
    }

    const e = await this.graph.create_entity({
      schema_id: COMPANY,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase(),
    });

    const details: CompanyDetailsFacet = { name: params.name };
    if (params.domain) {
      details.domain = params.domain;
      details.website = `https://${params.domain}`;
    }
    if (params.website) details.website = params.website;
    if (params.industry) details.industry = params.industry;
    if (params.summary) details.description = params.summary;
    await this.graph.attach_facet({
      entity_id: e.id,
      schema_id: COMPANY_DETAILS,
      data: details,
    });
    await this.graph.resolve_canonical(e.id);
    return this.listItemFor(e);
  }

  // ── read helpers ──────────────────────────────────────────────────
  // Batch the page's canonical into a per-entity map in ONE crossing.
  private async canonicalByEntity(ids: string[]): Promise<Map<string, Partial<CompanyCanonical>>> {
    const out = new Map<string, Partial<CompanyCanonical>>();
    for (const c of await this.graph.list_canonical_for_entities(ids)) {
      if (!c.entity_id) continue;
      const m = (out.get(c.entity_id) ?? {}) as Record<string, unknown>;
      m[c.key] = c.value;
      out.set(c.entity_id, m);
    }
    return out;
  }

  // Single-entity list item for the WRITE paths (create idempotent / new return)
  // — one get_canonical, then the pure builder. Not the hot read path.
  private async listItemFor(
    entity: { id: string; schema_id: string; name: string; created_at?: string },
  ): Promise<CompanyListItem> {
    const canonical = await this.graph.get_canonical(entity.id, []);
    return buildListItem(entity, canonical);
  }

  // Full-field enrichment (parity with staging "field parity" build). Each
  // provided field is layered on as a fresh facet version; single-aligned
  // details = latest wins, email/phone = collection (one facet per item).
  @writeTool("update", {
    description:
      "Update / enrich a company. Provided fields are layered on; omitted " +
      "fields stay untouched. `domain` derives the website; `summary` becomes " +
      "the description; `emails`/`phones` are multi-instance.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        domain: { type: "string" },
        summary: { type: "string" },
        industry: { type: "string" },
        size: { type: "string" },
        location: { type: "string" },
        founded: { type: "string" },
        stage: { type: "string" },
        headcount: { type: "integer" },
        funding_total: { type: "string" },
        emails: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        external_links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source_type: { type: "string" },
              external_id: { type: "string" },
              external_url: { type: "string" },
              external_name: { type: "string" },
            },
            required: ["source_type", "external_id"],
            additionalProperties: false,
          },
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async update(params: UpdateParams): Promise<CompanyDetailView> {
    const e = await this.graph.get_entity(params.id);
    if (!e) throw new Error(`company not found: ${params.id}`);

    if (params.name !== undefined) {
      await this.graph.update_entity_name(params.id, params.name);
    }

    const details: CompanyDetailsFacet = {};
    if (params.name !== undefined) details.name = params.name;
    if (params.domain !== undefined) {
      details.domain = params.domain;
      details.website = `https://${params.domain}`;
    }
    if (params.industry !== undefined) details.industry = params.industry;
    if (params.size !== undefined) details.size = params.size;
    if (params.location !== undefined) details.location = params.location;
    if (params.founded !== undefined) details.founded = params.founded;
    if (params.stage !== undefined) details.stage = params.stage;
    if (params.headcount !== undefined) details.headcount = params.headcount;
    if (params.funding_total !== undefined) details.funding_total = params.funding_total;
    if (params.summary !== undefined) details.description = params.summary;
    if (Object.keys(details).length > 0) {
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: COMPANY_DETAILS,
        data: details,
      });
    }

    if (params.emails) {
      for (let i = 0; i < params.emails.length; i++) {
        await this.graph.attach_facet({
          entity_id: params.id,
          schema_id: COMPANY_EMAIL,
          data: { email: params.emails[i], is_primary: i === 0 },
        });
      }
    }
    if (params.phones) {
      for (let i = 0; i < params.phones.length; i++) {
        await this.graph.attach_facet({
          entity_id: params.id,
          schema_id: COMPANY_PHONE,
          data: { phone: params.phones[i], is_primary: i === 0 },
        });
      }
    }
    if (params.external_links) {
      for (const link of params.external_links) {
        await this.graph.attach_facet({
          entity_id: params.id,
          schema_id: COMPANY_EXTERNAL_LINK,
          data: {
            source_type: link.source_type,
            external_id: link.external_id,
            ...(link.external_url ? { external_url: link.external_url } : {}),
            ...(link.external_name ? { external_name: link.external_name } : {}),
          },
        });
      }
    }

    await this.graph.resolve_canonical(params.id);
    return this.get({ id: params.id });
  }
}
