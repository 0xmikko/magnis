// Companies plugin — backend module. Runs inside the deno_core V8
// isolate. Decorated class: each @tool co-locates the agent tool
// contract with its RPC handler; definePlugin (index.ts) wires them.
//
// Reads use the efficient graph read-API (email parity): list →
// listEntitiesWindow / search → searchEntitiesByName; get →
// getEntityFull. S5: every one of them renders from the node's own
// DICTIONARY, which rides the rows they already fetched — fixed,
// N-independent crossings with no hydrate step at all.

import { linkedEntitySummary, rpc, tool, writeTool, type GetParams, type GraphService, type ListParams, type PluginDeps } from "@magnis/plugin-sdk";
import type { Entity, PaginatedResponse } from "@magnis/sdk";
import type {
  CompanyDetailsFacet,
  CompanyDetailView,
  CompanyListItem,
  CreateParams,
  HeaderRow,
  UpdateParams,
} from "../types.ts";
import { COMPANY } from "../schema.ts";
import { buildListItem } from "./helpers.ts";

const COMPANY_GET_SPEC = {
  description: "Get a full company detail view by entity id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

const COMPANY_CREATE_DESCRIPTION =
  "Create a company. Idempotent by name (case-insensitive, trimmed): if a " +
  "company with the same name already exists it is returned instead of " +
  "creating a duplicate. `domain` derives the website; `summary` becomes " +
  "the markdown description. Follow up with companies.update for richer enrichment.";

const COMPANY_CREATE_PARAMS = {
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
};

const COMPANY_UPDATE_SPEC = {
  description:
    "Update / enrich a company. Provided fields are layered on; omitted " +
    "fields stay untouched. `domain` derives the website; `summary` replaces " +
    "the description; `phones` are multi-instance.",
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
      phones: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
    additionalProperties: false,
  },
};

export class CompaniesModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @rpc("list", {
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

    let rows: Entity[];
    let total: number;
    if (search.length > 0) {
      const matched = await this.graph.searchEntitiesByName({
        query: search,
        schemaIds: [COMPANY],
        limit: limit + offset,
      });
      // Sort alphabetically by name (parity with staging, which sorted ALL
      // results; searchEntitiesByName returns prefix/date order otherwise).
      // A nameless company sorts first.
      matched.sort((a, b) => (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()));
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      // Page + total ordered by the indexed `idx` column (lowercased name →
      // case-insensitive name order). The window honors only the explicit
      // order, so it does NOT add pinned-first — matching staging's JS name
      // sort which had no pinned priority.
      const win = await this.graph.listEntitiesWindow({
        schema: COMPANY,
        order: [{ field: { entityField: "idx" }, desc: false }],
        limit,
        offset,
      });
      rows = win.items;
      total = win.total;
    }

    const items = rows.map((e) => buildListItem(e));
    return { items, total, limit, offset };
  }

  @rpc("get", COMPANY_GET_SPEC)
  @tool("get", { entity: "companies.company", ...COMPANY_GET_SPEC })
  async get(params: GetParams): Promise<CompanyDetailView> {
    // User-scoped entity (+ schema guard) and every edge, in one read. S5:
    // the hub's DICTIONARY is the record — one writer, nothing to arbitrate —
    // so the detail needs neither a canonical read nor a record list.
    const detail = await this.graph.getEntityFull(params.id, { links: true });
    if (detail?.entity.schemaId !== COMPANY) {
      throw new Error(`company not found: ${params.id}`);
    }
    const { entity } = detail;
    const base = buildListItem(entity);
    const endpointIds = [...new Set(detail.links.flatMap((link) => {
      if (link.from === entity.id) return [link.to];
      if (link.to === entity.id) return [link.from];
      return [];
    }))];
    const endpoints = endpointIds.length === 0
      ? []
      : await this.graph.getEntities(endpointIds);
    const endpointsById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint] as const));
    // @tested-by: tst_module_companies_002
    // @invariant: Companies preserve the shared `~kind` convention for
    // incoming edges so EntityDetailTabs can surface works_at contacts.
    const linkedEntities = detail.links.flatMap((link) => {
      const incoming = link.to === entity.id;
      const endpointId = incoming
        ? link.from
        : link.from === entity.id
          ? link.to
          : null;
      if (endpointId === null) return [];
      const endpoint = endpointsById.get(endpointId);
      if (endpoint === undefined) return [];
      return [linkedEntitySummary(endpoint, link, incoming ? `~${link.kind}` : link.kind)];
    });
    const members = linkedEntities.flatMap((linked) =>
      linked.schemaId === "contacts.person" && linked.linkKind === "works_at" && linked.direction === "in" && linked.name !== null
        ? [linked.name]
        : []);
    const headerRows: HeaderRow[] = [
      { type: "text", label: "Website", value: base.website },
      { type: "text", label: "Industry", value: base.industry },
      { type: "text", label: "Size", value: base.size },
      { type: "chips", label: `Team members (${String(members.length)})`, items: members },
    ];
    return { ...base, linkedEntities, members, headerRows };
  }

  // The tool's params are AGENT-facing → they omit `client_id` (the
  // frontend-only optimistic-create UUID); the rpc() params, which the host
  // parses the frontend's call with, carry it.
  @rpc("create", {
    description: COMPANY_CREATE_DESCRIPTION,
    params: {
      ...COMPANY_CREATE_PARAMS,
      properties: { ...COMPANY_CREATE_PARAMS.properties, client_id: { type: "string", format: "uuid" } },
    },
  })
  @writeTool("create", {
    entity: "companies.company",
    description: COMPANY_CREATE_DESCRIPTION,
    params: COMPANY_CREATE_PARAMS,
  })
  async create(params: CreateParams): Promise<CompanyListItem> {
    // Idempotent by name (parity with staging companies.create): return the
    // existing company if one already matches, so the agent can call create
    // without a pre-search and without producing duplicates.
    const needle = params.name.trim().toLowerCase();
    const existing = await this.graph.searchEntitiesByName({
      query: needle,
      schemaIds: [COMPANY],
      limit: 25,
    });
    const match = existing.find((c) => c.name?.trim().toLowerCase() === needle);
    if (match) {
      // Idempotent return: the matched row already carries its dictionary.
      return buildListItem(match);
    }

    const e = await this.graph.createEntity({
      schemaId: COMPANY,
      name: params.name,
      clientId: params.client_id,
      idx: params.name.toLowerCase(),
    });

    // S5: the hub dict takes the curated claims — one writer, no records.
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
    await this.graph.updateProperties({ entityId: e.id, properties: { ...details } });
    return this.listItemFor(e.id);
  }

  // ── read helpers ──────────────────────────────────────────────────
  // Single-entity list item for the WRITE paths (create idempotent / new
  // return) — one read of the node it just wrote, then the pure builder.
  private async listItemFor(id: string): Promise<CompanyListItem> {
    const entity = await this.graph.getEntity(id);
    if (!entity) throw new Error(`company not found: ${id}`);
    return buildListItem(entity);
  }

  // Full-field enrichment (parity with staging "field parity" build). Each
  // provided field is layered on as a fresh record version; single-aligned
  // details = latest wins, email/phone = collection (one record per item).
  @rpc("update", COMPANY_UPDATE_SPEC)
  @writeTool("update", { entity: "companies.company", ...COMPANY_UPDATE_SPEC })
  async update(params: UpdateParams): Promise<CompanyDetailView> {
    // Companies sits above email: an address reaches a company from the module
    // that syncs it, never through this update.
    if ("emails" in params) {
      throw new Error("companies.update takes no emails: an address reaches a company from the module that syncs it");
    }
    const e = await this.graph.getEntity(params.id);
    if (!e) throw new Error(`company not found: ${params.id}`);

    if (params.name !== undefined) {
      await this.graph.updateEntityName(params.id, params.name);
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
      await this.graph.updateProperties({ entityId: params.id, properties: { ...details } });
    }

    return this.get({ id: params.id });
  }
}
