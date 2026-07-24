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
function rpc(suffix, spec = { description: "", params: {} }) {
  return record(suffix, spec, false, false);
}
function definePlugin(ModuleClass) {
  const rpcHandlers = {};
  const toolDefinitions = [];
  async function init(graph, ctx, util, rpc2) {
    const instance = new ModuleClass({
      graph,
      ctx,
      util,
      rpc: rpc2
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

// plugins/modules/projects/schema.ts
var PROJECT = "projects.project";
var PROJECT_CHECKLIST = "projects.project.checklist";
var PROJECT_DESCRIPTION = "projects.description";
var MEMBER_LINK = "belongs_to";

// plugins/modules/projects/module/helpers.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) {
  return UUID_RE.test(s);
}
function entityCreatedAt(e) {
  return e.created_at ?? new Date(0).toISOString();
}
function linkSummary(e, kind) {
  return {
    id: e.id,
    name: e.name && e.name.length > 0 ? e.name : null,
    schema_id: e.schema_id,
    link_kind: kind,
    created_at: entityCreatedAt(e),
    data: null
  };
}
function canonicalString(c, key) {
  const v = c[key];
  return typeof v === "string" ? v : null;
}
function buildProjectListItem(entity, canonical) {
  const name = entity.name && entity.name.length > 0 ? entity.name : canonicalString(canonical, "project.name") ?? "Untitled Project";
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    name,
    status: canonicalString(canonical, "project.status"),
    created_at: entity.created_at ?? new Date(0).toISOString(),
    is_pinned: entity.is_pinned ?? null
  };
}

// plugins/modules/projects/module/service.ts
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

class ProjectsModule {
  graph;
  constructor(deps) {
    this.graph = deps.graph;
  }
  async list(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = params.search?.trim();
    let rows;
    let total;
    if (search) {
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [PROJECT],
        limit: limit + offset
      });
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      const page = await this.graph.list_entities({ schema_id: PROJECT, order: "date", limit, offset });
      rows = page.items;
      total = page.total;
    }
    const canonById = await this.canonicalByEntity(rows.map((e) => e.id));
    const items = rows.map((e) => buildProjectListItem(e, canonById.get(e.id) ?? {}));
    return { items, total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (!detail)
      throw new Error(`project ${params.id} not found`);
    const { entity, facets, links } = detail;
    const canonical = await this.graph.get_canonical(entity.id, [PROJECT]);
    const name = entity.name && entity.name.length > 0 ? entity.name : canonicalString(canonical, "project.name") ?? "Untitled Project";
    const status = canonicalString(canonical, "project.status");
    const neighborIds = links.map((l) => l.from_id === entity.id ? l.to_id : l.from_id);
    const byId = new Map((await this.graph.get_entities(neighborIds)).map((n) => [n.id, n]));
    const linked = [];
    for (const l of links) {
      if (l.from_id === entity.id) {
        const t = byId.get(l.to_id);
        if (t)
          linked.push(linkSummary(t, l.kind));
      } else if (l.to_id === entity.id) {
        const s = byId.get(l.from_id);
        if (s)
          linked.push(linkSummary(s, `~${l.kind}`));
      }
    }
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      name,
      status,
      canonical,
      facets,
      linked_entities: linked,
      created_at: entityCreatedAt(entity)
    };
  }
  async create(params) {
    if (!params.name || params.name.length === 0) {
      throw new Error("missing required param: name");
    }
    if (params.client_id !== undefined && !isUuid(params.client_id)) {
      throw new Error("client_id must be a valid UUID");
    }
    const statusVal = params.status ?? "active";
    if (params.client_id) {
      const existing = await this.graph.get_entity(params.client_id);
      if (existing) {
        const facets = await this.graph.list_facets_for_entity(existing.id);
        const f = facets.find((x) => x.schema_id === PROJECT);
        const existingStatus = f?.data?.status ?? "active";
        return {
          id: existing.id,
          name: existing.name && existing.name.length > 0 ? existing.name : params.name,
          status: existingStatus,
          schema_id: PROJECT,
          created_at: entityCreatedAt(existing)
        };
      }
    }
    const entity = await this.graph.create_entity({
      schema_id: PROJECT,
      name: params.name,
      client_id: params.client_id
    });
    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: PROJECT,
      data: { name: params.name, status: statusVal, created_at: new Date().toISOString() }
    });
    await this.graph.resolve_canonical(entity.id);
    return { id: entity.id, name: params.name, status: statusVal, schema_id: PROJECT, created_at: entityCreatedAt(entity) };
  }
  async update(params) {
    const entity = await this.graph.get_entity(params.id);
    if (!entity)
      throw new Error(`project ${params.id} not found`);
    const facets = await this.graph.list_facets_for_entity(params.id);
    const existing = facets.find((f) => f.schema_id === PROJECT)?.data ?? {};
    const data = { ...existing };
    if (params.name !== undefined) {
      data.name = params.name;
      await this.graph.update_entity_name(params.id, params.name);
    }
    if (params.status !== undefined)
      data.status = params.status;
    data.updated_at = new Date().toISOString();
    await this.graph.attach_facet({ entity_id: params.id, schema_id: PROJECT, data });
    if (params.description !== undefined) {
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: PROJECT_DESCRIPTION,
        data: { body: params.description }
      });
    }
    await this.graph.resolve_canonical(params.id);
    return this.get({ id: params.id });
  }
  async delete(params) {
    const entity = await this.graph.get_entity(params.id);
    if (!entity)
      throw new Error(`project ${params.id} not found`);
    await this.graph.delete_entity(params.id);
    return { deleted: true };
  }
  async checklistGet(params) {
    if (!params.project_id)
      throw new Error("missing required param: project_id");
    const entity = await this.requireProject(params.project_id);
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const f = facets.find((x) => x.schema_id === PROJECT_CHECKLIST);
    return f?.data ?? { items: [] };
  }
  async checklistUpdate(params) {
    if (!params.project_id)
      throw new Error("missing required param: project_id");
    await this.requireProject(params.project_id);
    await this.graph.attach_facet({
      entity_id: params.project_id,
      schema_id: PROJECT_CHECKLIST,
      data: { items: params.items }
    });
    return { status: "ok", project_id: params.project_id };
  }
  async addMember(params) {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    await this.graph.add_link({ from_id: params.entity_id, to_id: params.project_id, kind: MEMBER_LINK });
    return { status: "ok" };
  }
  async removeMember(params) {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    const links = await this.graph.list_links_for_entity(params.entity_id);
    const link = links.find((l) => l.from_id === params.entity_id && l.to_id === params.project_id && l.kind === MEMBER_LINK);
    if (!link)
      throw new Error("Link not found");
    await this.graph.delete_link(link.id);
    return { status: "ok" };
  }
  async listForEntity(params) {
    await this.requireOwned(params.entity_id);
    const linked = await this.graph.list_linked({
      parent_id: params.entity_id,
      link_kind: MEMBER_LINK,
      direction: "out",
      child_schema: PROJECT,
      limit: 1000,
      offset: 0
    });
    const canonById = await this.canonicalByEntity(linked.items.map((r) => r.entity.id));
    return linked.items.map(({ entity }) => buildProjectListItem(entity, canonById.get(entity.id) ?? {}));
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
  async requireOwned(id) {
    if (!await this.graph.get_entity(id))
      throw new Error(`entity ${id} not found`);
  }
  async requireProject(id) {
    const entity = await this.graph.get_entity(id);
    if (!entity)
      throw new Error(`project not found: ${id}`);
    if (entity.schema_id !== PROJECT)
      throw new Error(`entity ${id} is not a project (schema: ${entity.schema_id})`);
    return entity;
  }
}
__decorate([
  tool("list", {
    description: "List projects with pagination and optional search.",
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
], ProjectsModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a project detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "get", null);
__decorate([
  writeTool("create", {
    description: "Create a new project.",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        status: { type: "string", description: "Project status (default: active)" },
        client_id: { type: "string", format: "uuid", description: "Client-generated UUID for optimistic creation" }
      },
      required: ["name"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "create", null);
__decorate([
  writeTool("update", {
    description: "Update a project's name, status, and/or description. The `description` " + "field is a markdown body stored in the `projects.description` facet — it " + "replaces the existing description outright, so callers maintaining a " + "running summary should fetch + append + write back.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string" },
        description: {
          type: "string",
          description: "Markdown body for the project description (overwrites the existing one)."
        }
      },
      required: ["id"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "update", null);
__decorate([
  writeTool("delete", {
    description: "Delete a project by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "delete", null);
__decorate([
  tool("checklist.get", {
    description: "Read the operational checklist for a project. Returns items array (empty if no checklist yet).",
    params: {
      type: "object",
      properties: { project_id: { type: "string", format: "uuid" } },
      required: ["project_id"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "checklistGet", null);
__decorate([
  writeTool("checklist.update", {
    description: "Create or replace the operational checklist for a project.",
    params: {
      type: "object",
      properties: {
        project_id: { type: "string", format: "uuid" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "done", "blocked"] },
              notes: { type: "string" },
              updated_at: { type: "string", format: "date-time" }
            },
            required: ["id", "text", "status"]
          }
        }
      },
      required: ["project_id", "items"],
      additionalProperties: false
    }
  })
], ProjectsModule.prototype, "checklistUpdate", null);
__decorate([
  rpc("add_member")
], ProjectsModule.prototype, "addMember", null);
__decorate([
  rpc("remove_member")
], ProjectsModule.prototype, "removeMember", null);
__decorate([
  rpc("list_for_entity")
], ProjectsModule.prototype, "listForEntity", null);

// plugins/modules/projects/module/index.ts
definePlugin(ProjectsModule);
