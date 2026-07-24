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

// plugins/modules/notes/schema.ts
var NOTE = "notes.note";
var NOTE_CONTENT = "notes.note.content";

// plugins/modules/notes/module/helpers.ts
var PREVIEW_MAX_CHARS = 80;
var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidUuid(id) {
  return UUID_RE.test(id);
}
function truncateChars(value, maxChars, suffix) {
  const chars = Array.from(value);
  if (chars.length > maxChars) {
    return chars.slice(0, maxChars).join("") + suffix;
  }
  return value;
}
function previewFromBody(body) {
  for (const raw of body.split(`
`)) {
    const line = raw.trim();
    if (line.length > 0 && !line.startsWith("#")) {
      return truncateChars(line, PREVIEW_MAX_CHARS, "…");
    }
  }
  return null;
}
function renderTemplate(template, title, variables) {
  const projectName = typeof variables?.project_name === "string" ? variables.project_name : "";
  const projectRef = projectName ? `Project: ${projectName}

` : "";
  switch (template) {
    case "outreach_tracker":
      return `# ${title}

` + projectRef + `| Contact | Status | Last Action | Next Step | Notes |
` + `|---------|--------|-------------|-----------|-------|
` + `|         |        |             |           |       |
`;
    case "comparison_table":
      return `# ${title}

` + projectRef + `| Option | Pros | Cons | Score | Notes |
` + `|--------|------|------|-------|-------|
` + `|        |      |      |       |       |
`;
    case "meeting_prep":
      return `# ${title}

` + projectRef + `## Attendees

- 

` + `## Agenda

1. 

` + `## Key Questions

- 

` + `## Background



` + `## Action Items

- [ ] 
`;
    case "follow_up_plan":
      return `# ${title}

` + projectRef + `## Objective



` + `## Contacts

- 

` + `## Timeline



` + `## Status



` + `## Notes


`;
    default:
      throw new Error(`unknown template: ${template}`);
  }
}

// plugins/modules/notes/module/service.ts
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

class NotesModule {
  graph;
  constructor(deps) {
    this.graph = deps.graph;
  }
  async list(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search) {
      const all = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [NOTE],
        limit: limit + offset
      });
      const total = all.length;
      const page = all.slice(offset, offset + limit);
      const ids = page.map((e) => e.id);
      const facets = await this.graph.list_facets_for_entities(ids);
      const canon = await this.graph.list_canonical_for_entities(ids);
      const dataById = new Map;
      for (const f of facets) {
        if (f.schema_id === NOTE_CONTENT && f.entity_id && !dataById.has(f.entity_id)) {
          dataById.set(f.entity_id, f.data ?? {});
        }
      }
      const canonById = new Map;
      for (const c of canon) {
        if (!c.entity_id)
          continue;
        const m = canonById.get(c.entity_id) ?? {};
        m[c.key] = c.value;
        canonById.set(c.entity_id, m);
      }
      const items2 = page.map((e) => this.listItemFromParts(e, dataById.get(e.id) ?? {}, canonById.get(e.id) ?? {}));
      return { items: items2, total, limit, offset };
    }
    const win = await this.graph.list_entities_window({
      schema: NOTE,
      facet_schema: NOTE_CONTENT,
      order: [{ field: { facet_schema: NOTE_CONTENT, facet_path: "updated_at" }, desc: true }],
      limit,
      offset
    });
    const items = win.items.map((row) => this.listItemFromWindow(row));
    return { items, total: win.total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = this.contentOf(detail);
    const canonical = await this.graph.get_canonical(e.id, [NOTE]);
    const pinned = canonical["note.pinned"] ?? data.pinned ?? false;
    const linked = [];
    if (detail.links.length > 0) {
      const neighbourId = (l) => l.from_id === e.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([
        ...new Set(detail.links.map(neighbourId))
      ]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const link of detail.links) {
        const t = byId.get(neighbourId(link));
        if (!t)
          continue;
        linked.push({
          id: t.id,
          name: t.name,
          schema_id: t.schema_id,
          link_kind: link.kind,
          created_at: t.created_at ?? new Date(0).toISOString(),
          data: null
        });
      }
    }
    return {
      id: e.id,
      schema_id: e.schema_id,
      title: this.titleOf(e, data, canonical),
      body: data.body ?? null,
      pinned,
      canonical,
      facets: detail.facets,
      linked_entities: linked,
      created_at: e.created_at ?? new Date(0).toISOString(),
      updated_at: data.updated_at ?? canonical["note.updated_at"] ?? null
    };
  }
  async create(params) {
    if (params.client_id !== undefined && !isValidUuid(params.client_id)) {
      throw new Error("client_id must be a valid UUID");
    }
    if (params.client_id) {
      const existing = await this.graph.get_entity_full(params.client_id, { links: false });
      if (existing?.entity.schema_id === NOTE) {
        return this.snapshotFromDetail(existing);
      }
    }
    const now = new Date().toISOString();
    const body = params.body;
    const entity = await this.graph.create_entity({
      schema_id: NOTE,
      name: params.title,
      client_id: params.client_id
    });
    await this.writeContent(entity.id, params.title, body, now);
    return { id: entity.id, schema_id: NOTE, title: params.title, body, updated_at: now };
  }
  async update(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = this.contentOf(detail);
    const currentTitle = this.titleOf(e, data, {});
    const newTitle = params.title ?? currentTitle;
    const newBody = params.body ?? data.body ?? "";
    const now = new Date().toISOString();
    if (params.title !== undefined && newTitle !== currentTitle) {
      await this.graph.update_entity_name(params.id, newTitle);
    }
    await this.writeContent(params.id, newTitle, newBody, now);
    return { id: params.id, schema_id: NOTE, title: newTitle, body: newBody, updated_at: now };
  }
  async delete(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    await this.graph.delete_entity(params.id);
    return { deleted: true };
  }
  async template_apply(params) {
    if (!params.template)
      throw new Error("missing required param: template");
    if (!params.title)
      throw new Error("missing required param: title");
    const body = renderTemplate(params.template, params.title, params.variables);
    return this.create({ title: params.title, body });
  }
  async writeContent(entityId, title, body, updatedAt) {
    await this.graph.attach_facet({
      entity_id: entityId,
      schema_id: NOTE_CONTENT,
      data: { title, body, pinned: false, updated_at: updatedAt }
    });
    await this.graph.resolve_canonical(entityId);
  }
  contentOf(detail) {
    const content = detail.facets.find((f) => f.schema_id === NOTE_CONTENT);
    return content?.data ?? {};
  }
  titleOf(e, data, canonical) {
    if (e.name && e.name.length > 0)
      return e.name;
    if (data.title && data.title.length > 0)
      return data.title;
    const ct = canonical["note.title"];
    if (typeof ct === "string" && ct.length > 0)
      return ct;
    return "Untitled";
  }
  listItemFromWindow(row) {
    return this.listItemFromParts(row.entity, row.data ?? {}, {});
  }
  listItemFromParts(e, data, canonical) {
    return {
      id: e.id,
      schema_id: e.schema_id,
      title: this.titleOf(e, data, canonical),
      preview: previewFromBody(data.body ?? ""),
      pinned: canonical["note.pinned"] ?? data.pinned ?? false,
      created_at: e.created_at ?? new Date(0).toISOString(),
      updated_at: data.updated_at ?? canonical["note.updated_at"] ?? null,
      is_pinned: e.is_pinned ?? null
    };
  }
  snapshotFromDetail(detail) {
    const e = detail.entity;
    const data = this.contentOf(detail);
    return {
      id: e.id,
      schema_id: NOTE,
      title: this.titleOf(e, data, {}),
      body: data.body ?? "",
      updated_at: data.updated_at ?? e.created_at ?? new Date(0).toISOString()
    };
  }
}
__decorate([
  tool("list", {
    description: "List notes with pagination and optional search by title.",
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
], NotesModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a full note detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], NotesModule.prototype, "get", null);
__decorate([
  writeTool("create", {
    description: "Create a new note with title and markdown body.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        body: { type: "string", description: "Markdown content" },
        client_id: {
          type: "string",
          format: "uuid",
          description: "Client-generated UUID for optimistic / idempotent create"
        }
      },
      required: ["title", "body"],
      additionalProperties: false
    }
  })
], NotesModule.prototype, "create", null);
__decorate([
  writeTool("update", {
    description: "Update an existing note's title and/or body. Both are optional — only provided fields are updated.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid", description: "Entity ID of the note" },
        title: { type: "string", description: "New title (optional)" },
        body: { type: "string", description: "New markdown body (optional)" }
      },
      required: ["id"],
      additionalProperties: false
    }
  })
], NotesModule.prototype, "update", null);
__decorate([
  writeTool("delete", {
    description: "Delete a note by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], NotesModule.prototype, "delete", null);
__decorate([
  writeTool("template.apply", {
    description: "Create a new note from a template. Templates: outreach_tracker, comparison_table, meeting_prep, follow_up_plan.",
    params: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template name" },
        title: { type: "string", description: "Note title" },
        variables: { type: "object", description: "Optional variables for template interpolation" }
      },
      required: ["template", "title"],
      additionalProperties: false
    }
  })
], NotesModule.prototype, "template_apply", null);

// plugins/modules/notes/module/index.ts
definePlugin(NotesModule);
