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

// plugins/modules/file/module/helpers.ts
function facetData(detail, schemaId) {
  const f = detail.facets.find((x) => x.schema_id === schemaId);
  return f?.data;
}
function resolveUrl(entityId, details) {
  if (details.local_path !== null && details.local_path !== undefined)
    return `/files/${entityId}`;
  if (details.cloud_url !== null && details.cloud_url !== undefined)
    return details.cloud_url;
  return null;
}
function hasContent(details) {
  return details.local_path !== null && details.local_path !== undefined || details.cloud_url !== null && details.cloud_url !== undefined;
}
function itemFromDetails(entityId, details) {
  return { ...details, entity_id: entityId, url: resolveUrl(entityId, details) };
}

// plugins/modules/file/schema.ts
var FILE_OBJECT = "file.object";
var FILE_DETAILS = "file.details";
var FILE_IMAGE = "file.image";
var FILE_AUDIO = "file.audio";
var FILE_VIDEO = "file.video";

// plugins/modules/file/module/service.ts
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

class FileModule {
  graph;
  constructor(deps) {
    this.graph = deps.graph;
  }
  async list(params) {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    let entityIds;
    let total;
    if (params.source_module) {
      const page = await this.graph.list_entities_by_facet_field({
        entity_schema: FILE_OBJECT,
        facet_schema: FILE_DETAILS,
        field_path: "$.source_module",
        field_value: params.source_module,
        limit,
        offset
      });
      entityIds = page.items.map((e) => e.id);
      total = page.total;
    } else {
      const win = await this.graph.list_entities_window({
        schema: FILE_OBJECT,
        order: [{ field: { entity_field: "date" }, desc: true }],
        limit,
        offset
      });
      entityIds = win.items.map((r) => r.entity.id);
      total = win.total;
    }
    if (entityIds.length === 0)
      return { items: [], total, limit, offset };
    const facets = await this.graph.list_facets_for_entities(entityIds);
    const detailsById = new Map;
    for (const f of facets) {
      if (f.schema_id === FILE_DETAILS && f.entity_id !== undefined) {
        detailsById.set(f.entity_id, f.data);
      }
    }
    const items = [];
    for (const id of entityIds) {
      const details = detailsById.get(id);
      if (!details)
        continue;
      if (params.parent_id) {
        const links = await this.graph.list_links_for_entity(id);
        if (!links.some((l) => l.from_id === params.parent_id))
          continue;
      }
      if (params.mime_prefix && !details.mime_type.startsWith(params.mime_prefix)) {
        continue;
      }
      if (!hasContent(details))
        continue;
      items.push(itemFromDetails(id, details));
    }
    return { items, total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== FILE_OBJECT) {
      throw new Error(`file not found: ${params.id}`);
    }
    const details = facetData(detail, FILE_DETAILS);
    if (!details)
      throw new Error(`file not found: ${params.id}`);
    const base = itemFromDetails(params.id, details);
    const image = facetData(detail, FILE_IMAGE);
    const audio = facetData(detail, FILE_AUDIO);
    const video = facetData(detail, FILE_VIDEO);
    if (image)
      base.image = image;
    if (audio)
      base.audio = audio;
    if (video)
      base.video = video;
    return base;
  }
  async attach(params) {
    const kind = params.kind ?? "attachment";
    if (kind !== "attachment")
      throw new Error(`unsupported attach kind: ${kind}`);
    const file = await this.graph.get_entity_full(params.file_id, { links: false });
    if (file?.entity.schema_id !== FILE_OBJECT) {
      throw new Error(`file not found: ${params.file_id}`);
    }
    const target = await this.graph.get_entity_full(params.target_id, { links: false });
    if (!target) {
      throw new Error(`target not found: ${params.target_id}`);
    }
    await this.graph.add_link({ from_id: params.target_id, to_id: params.file_id, kind });
    return { status: "ok", file_id: params.file_id, target_id: params.target_id, kind };
  }
}
__decorate([
  tool("list", {
    description: "List files with optional filters by source_module, mime_prefix, or parent_id.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        source_module: {
          type: "string",
          description: "Filter by source module (e.g. 'email', 'telegram', 'uploads')."
        },
        mime_prefix: {
          type: "string",
          description: "Filter by MIME type prefix (e.g. 'image/', 'application/pdf')."
        },
        parent_id: { type: "string", description: "Filter to files linked to this entity." }
      },
      additionalProperties: false
    }
  })
], FileModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a file by entity id, with its details + a serving URL.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], FileModule.prototype, "get", null);
__decorate([
  writeTool("attach", {
    description: "Attach a file entity to a target entity via an 'attachment' link.",
    params: {
      type: "object",
      properties: {
        file_id: { type: "string", format: "uuid" },
        target_id: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["attachment"] }
      },
      required: ["file_id", "target_id"],
      additionalProperties: false
    }
  })
], FileModule.prototype, "attach", null);

// plugins/modules/file/module/index.ts
definePlugin(FileModule);
