// packages/plugin-sdk/index.ts
var REGISTRY = new WeakMap;
function record(suffix, spec, write, isTool) {
  return function(target, methodName, _d) {
    let list = REGISTRY.get(target);
    if (!list) {
      list = [];
      REGISTRY.set(target, list);
    }
    list.push({ suffix, description: spec.description, params: spec.params, write, isTool, methodName });
  };
}
function tool(suffix, spec) {
  return record(suffix, spec, false, true);
}
function writeTool(suffix, spec) {
  return record(suffix, spec, true, true);
}
function definePlugin(ModuleClass) {
  const rpcHandlers = {};
  const toolDefinitions = [];
  async function init(graph, ctx, util, rpc) {
    const instance = new ModuleClass({
      graph,
      ctx,
      util,
      rpc
    });
    const prefix = ctx.extension_id;
    const metas = REGISTRY.get(ModuleClass.prototype) ?? [];
    for (const m of metas) {
      const rpcName = `${prefix}.${m.suffix}`;
      const method = instance[m.methodName];
      if (typeof method !== "function") {
        throw new Error(`plugin: decorated method "${m.methodName}" is not a function`);
      }
      rpcHandlers[rpcName] = (params) => method.call(instance, params);
      if (m.isTool) {
        toolDefinitions.push({
          name: rpcName,
          description: m.description,
          inputSchema: m.params,
          requires_approval: m.write
        });
      }
    }
  }
  globalThis.__magnis_plugin_module = {
    init,
    rpcHandlers,
    toolDefinitions
  };
}

// plugins/modules/companies/schema.ts
var COMPANY = "companies.company";
var COMPANY_DETAILS = "companies.company.details";
var COMPANY_EMAIL = "companies.company.email";
var COMPANY_PHONE = "companies.company.phone";
var COMPANY_EXTERNAL_LINK = "companies.company.external_link";

// plugins/modules/companies/module/helpers.ts
var AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];
function computeInitials(name) {
  return name.split(/\s+/).filter((w) => w.length > 0).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function pickAvatarColor(id) {
  const first = id.replace(/-/g, "").slice(0, 2);
  const hash = parseInt(first, 16);
  const idx = Number.isFinite(hash) ? hash % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  if (color === undefined)
    throw new Error("pickAvatarColor: AVATAR_COLORS is empty");
  return color;
}
function canonicalString(map, key) {
  const v = map[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function buildListItem(entity, canonical) {
  const name = entity.name && entity.name.length > 0 ? entity.name : canonicalString(canonical, "companies.name") ?? "Unknown";
  return {
    id: entity.id,
    name,
    website: canonicalString(canonical, "companies.website"),
    industry: canonicalString(canonical, "companies.industry"),
    size: canonicalString(canonical, "companies.size"),
    location: canonicalString(canonical, "companies.location"),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    created_at: entity.created_at ?? new Date(0).toISOString()
  };
}

// plugins/modules/companies/module/service.ts
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
    r = Reflect.decorate(decorators, target, key, desc);
  else
    for (var i = decorators.length - 1;i >= 0; i--)
      if (d = decorators[i])
        r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
};

class CompaniesModule {
  graph;
  constructor(deps) {
    this.graph = deps.graph;
  }
  async list(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    let rows;
    let total;
    if (search.length > 0) {
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [COMPANY],
        limit: limit + offset
      });
      matched.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      const win = await this.graph.list_entities_window({
        schema: COMPANY,
        order: [{ field: { entity_field: "idx" }, desc: false }],
        limit,
        offset
      });
      rows = win.items.map((r) => r.entity);
      total = win.total;
    }
    const canonById = await this.canonicalByEntity(rows.map((e) => e.id));
    const items = rows.map((e) => buildListItem(e, canonById.get(e.id) ?? {}));
    return { items, total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id);
    if (detail?.entity.schema_id !== COMPANY) {
      throw new Error(`company not found: ${params.id}`);
    }
    const { entity } = detail;
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const canonical = await this.graph.get_canonical(entity.id, []);
    const base = buildListItem(entity, canonical);
    const members = [];
    const header_rows = [
      { type: "text", label: "Website", value: base.website },
      { type: "text", label: "Industry", value: base.industry },
      { type: "text", label: "Size", value: base.size },
      { type: "chips", label: `Team members (${String(members.length)})`, items: members }
    ];
    return { ...base, canonical, facets, linked_entities: [], members, header_rows };
  }
  async create(params) {
    const needle = params.name.trim().toLowerCase();
    const existing = await this.graph.search_entities_by_name({
      query: needle,
      schema_ids: [COMPANY],
      limit: 25
    });
    const match = existing.find((c) => c.name.trim().toLowerCase() === needle);
    if (match) {
      return this.listItemFor(match);
    }
    const e = await this.graph.create_entity({
      schema_id: COMPANY,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase()
    });
    const details = { name: params.name };
    if (params.domain) {
      details.domain = params.domain;
      details.website = `https://${params.domain}`;
    }
    if (params.website)
      details.website = params.website;
    if (params.industry)
      details.industry = params.industry;
    if (params.summary)
      details.description = params.summary;
    await this.graph.attach_facet({
      entity_id: e.id,
      schema_id: COMPANY_DETAILS,
      data: details
    });
    await this.graph.resolve_canonical(e.id);
    return this.listItemFor(e);
  }
  async canonicalByEntity(ids) {
    const out = new Map;
    for (const c of await this.graph.list_canonical_for_entities(ids)) {
      if (!c.entity_id)
        continue;
      const m = out.get(c.entity_id) ?? {};
      m[c.key] = c.value;
      out.set(c.entity_id, m);
    }
    return out;
  }
  async listItemFor(entity) {
    const canonical = await this.graph.get_canonical(entity.id, []);
    return buildListItem(entity, canonical);
  }
  async update(params) {
    const e = await this.graph.get_entity(params.id);
    if (!e)
      throw new Error(`company not found: ${params.id}`);
    if (params.name !== undefined) {
      await this.graph.update_entity_name(params.id, params.name);
    }
    const details = {};
    if (params.name !== undefined)
      details.name = params.name;
    if (params.domain !== undefined) {
      details.domain = params.domain;
      details.website = `https://${params.domain}`;
    }
    if (params.industry !== undefined)
      details.industry = params.industry;
    if (params.size !== undefined)
      details.size = params.size;
    if (params.location !== undefined)
      details.location = params.location;
    if (params.founded !== undefined)
      details.founded = params.founded;
    if (params.stage !== undefined)
      details.stage = params.stage;
    if (params.headcount !== undefined)
      details.headcount = params.headcount;
    if (params.funding_total !== undefined)
      details.funding_total = params.funding_total;
    if (params.summary !== undefined)
      details.description = params.summary;
    if (Object.keys(details).length > 0) {
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: COMPANY_DETAILS,
        data: details
      });
    }
    if (params.emails) {
      for (const [i, email] of params.emails.entries()) {
        await this.graph.attach_facet({
          entity_id: params.id,
          schema_id: COMPANY_EMAIL,
          data: { email, is_primary: i === 0 }
        });
      }
    }
    if (params.phones) {
      for (const [i, phone] of params.phones.entries()) {
        await this.graph.attach_facet({
          entity_id: params.id,
          schema_id: COMPANY_PHONE,
          data: { phone, is_primary: i === 0 }
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
            ...link.external_url ? { external_url: link.external_url } : {},
            ...link.external_name ? { external_name: link.external_name } : {}
          }
        });
      }
    }
    await this.graph.resolve_canonical(params.id);
    return this.get({ id: params.id });
  }
}
__decorate([
  tool("list", {
    description: "List companies with pagination and optional name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" }
      },
      additionalProperties: false
    }
  })
], CompaniesModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a full company detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], CompaniesModule.prototype, "get", null);
__decorate([
  writeTool("create", {
    description: "Create a company. Idempotent by name (case-insensitive, trimmed): if a " + "company with the same name already exists it is returned instead of " + "creating a duplicate. `domain` derives the website; `summary` becomes " + "the description. Follow up with companies.update for richer enrichment.",
    params: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        summary: { type: "string" }
      },
      required: ["name"],
      additionalProperties: false
    }
  })
], CompaniesModule.prototype, "create", null);
__decorate([
  writeTool("update", {
    description: "Update / enrich a company. Provided fields are layered on; omitted " + "fields stay untouched. `domain` derives the website; `summary` becomes " + "the description; `emails`/`phones` are multi-instance.",
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
              external_name: { type: "string" }
            },
            required: ["source_type", "external_id"],
            additionalProperties: false
          }
        }
      },
      required: ["id"],
      additionalProperties: false
    }
  })
], CompaniesModule.prototype, "update", null);

// plugins/modules/companies/module/index.ts
definePlugin(CompaniesModule);
