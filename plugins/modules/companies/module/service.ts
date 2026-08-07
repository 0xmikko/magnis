// Companies plugin — backend module. Runs inside the deno_core V8
// isolate. Decorated class: each @tool co-locates the agent tool
// contract with its RPC handler; definePlugin (index.ts) wires them.
//
// Reads use the efficient graph read-API (email parity): list →
// list_entities_window / search → search_entities_by_name; get →
// get_entity_full. S5: every one of them renders from the node's own
// DICTIONARY, which rides the rows they already fetched — fixed,
// N-independent crossings with no hydrate step at all.

import { tool, writeTool, type GraphService, type PluginDeps, type RpcExecutor } from "@magnis/plugin-sdk";
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
import { COMPANY } from "../schema.ts";
import { buildListItem } from "./helpers.ts";

export class CompaniesModule {
  private readonly graph: GraphService<CompanyFacets, CompanyCanonical>;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<CompanyFacets, CompanyCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
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
      // case-insensitive name order). The window honors only the explicit
      // order, so it does NOT add pinned-first — matching staging's JS name
      // sort which had no pinned priority.
      const win = await this.graph.list_entities_window({
        schema: COMPANY,
        order: [{ field: { entity_field: "idx" }, desc: false }],
        limit,
        offset,
      });
      rows = win.items.map((r) => r.entity);
      total = win.total;
    }

    const items = rows.map((e) => buildListItem(e));
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
    // User-scoped entity (+ schema guard) and every edge, in one read. S5:
    // the hub's DICTIONARY is the record — one writer, nothing to arbitrate —
    // so the detail needs neither a canonical read nor a facet list.
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== COMPANY) {
      throw new Error(`company not found: ${params.id}`);
    }
    const { entity } = detail;
    const base = buildListItem(entity);
    const endpointIds = [...new Set(detail.links.flatMap((link) => {
      if (link.from_id === entity.id) return [link.to_id];
      if (link.to_id === entity.id) return [link.from_id];
      return [];
    }))];
    const endpoints = endpointIds.length === 0
      ? []
      : await this.graph.get_entities(endpointIds);
    const endpointsById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint] as const));
    // @tested-by: tst_module_companies_002
    // @invariant: Companies preserve the shared `~kind` convention for
    // incoming edges so EntityDetailTabs can surface works_at contacts.
    const linked_entities = detail.links.flatMap((link) => {
      const incoming = link.to_id === entity.id;
      const endpointId = incoming
        ? link.from_id
        : link.from_id === entity.id
          ? link.to_id
          : null;
      if (endpointId === null) return [];
      const endpoint = endpointsById.get(endpointId);
      if (endpoint === undefined) return [];
      return [{
        id: endpoint.id,
        name: endpoint.name,
        schema_id: endpoint.schema_id,
        link_kind: incoming ? `~${link.kind}` : link.kind,
      }];
    });
    const members = linked_entities
      .filter((linked) =>
        linked.schema_id === "contacts.person" &&
        linked.link_kind === "~works_at")
      .map((linked) => linked.name);
    const header_rows: HeaderRow[] = [
      { type: "text", label: "Website", value: base.website },
      { type: "text", label: "Industry", value: base.industry },
      { type: "text", label: "Size", value: base.size },
      { type: "chips", label: `Team members (${String(members.length)})`, items: members },
    ];
    return { ...base, linked_entities, members, header_rows };
  }

  // `params` is the AGENT-facing schema → omits `client_id` (the
  // frontend-only optimistic-create UUID). The handler still accepts
  // it via CreateParams; the WS RPC path is not validated against this
  // schema.
  @writeTool("create", {
    description:
      "Create a company. Idempotent by name (case-insensitive, trimmed): if a " +
      "company with the same name already exists it is returned instead of " +
      "creating a duplicate. `domain` derives the website; `summary` becomes " +
      "the markdown description. Follow up with companies.update for richer enrichment.",
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
      // Idempotent return: the matched row already carries its dictionary.
      return buildListItem(match);
    }

    const e = await this.graph.create_entity({
      schema_id: COMPANY,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase(),
    });

    // S5: the hub dict takes the curated claims — one writer, no facets.
    const details: CompanyDetailsFacet = { name: params.name };
    if (params.domain) {
      details.domain = params.domain;
      details.website = `https://${params.domain}`;
    }
    if (params.website) details.website = params.website;
    if (params.industry) details.industry = params.industry;
    // @tested-by: tst_mod_companies_description_002
    // @invariant: The company Overview and agent writes share one description
    // key; structured details never own a second copy of it.
    if (params.summary) details.description = params.summary;
    await this.graph.update_properties({ entity_id: e.id, properties: { ...details } });
    return this.listItemFor(e.id);
  }

  // ── read helpers ──────────────────────────────────────────────────
  // Single-entity list item for the WRITE paths (create idempotent / new
  // return) — one read of the node it just wrote, then the pure builder.
  private async listItemFor(id: string): Promise<CompanyListItem> {
    const entity = await this.graph.get_entity(id);
    if (!entity) throw new Error(`company not found: ${id}`);
    return buildListItem(entity);
  }

  // Full-field enrichment (parity with staging "field parity" build). Each
  // provided field is layered on as a fresh facet version; single-aligned
  // details = latest wins, email/phone = collection (one facet per item).
  @writeTool("update", {
    description:
      "Update / enrich a company. Provided fields are layered on; omitted " +
      "fields stay untouched. `domain` derives the website; `summary` replaces " +
      "the description; `emails` become identity edges to shared address " +
      "nodes and `phones` are multi-instance.",
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
    // @tested-by: tst_mod_companies_description_001
    // @invariant: The company Overview and agent writes share one description
    // key; structured details never own a second copy of it.
    if (params.summary !== undefined) details.description = params.summary;

    // S5: one merge of the curated keys — a provided field is layered on, an
    // omitted one stays untouched, and a null removes.
    if (params.phones) {
      details.phones = params.phones.map((phone, i) => ({
        phone,
        type: null,
        is_primary: i === 0,
      }));
    }
    if (Object.keys(details).length > 0) {
      await this.graph.update_properties({ entity_id: params.id, properties: { ...details } });
    }

    // An email is an identity CHANNEL, not a company field: the email module
    // owns the address node, this module owns the edge to it (plan §3).
    if (params.emails && params.emails.length > 0) {
      const { ids } = await this.rpc.execute<{ ids: string[] }>("email.ensure_addresses", {
        items: params.emails.map((address) => ({ address })),
      });
      for (const to_id of ids) {
        await this.graph.add_link({ from_id: params.id, to_id, kind: "identity" });
      }
    }

    return this.get({ id: params.id });
  }
}
