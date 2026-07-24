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

// plugins/modules/triggers/schema.ts
var TRIGGER = "triggers.trigger";
var TRIGGER_CONFIG = "triggers.trigger.config";
var TRIGGER_EXECUTION = "triggers.trigger.execution";
var WATCHES = "watches";
var BELONGS_TO = "belongs_to";

// plugins/modules/triggers/module/service.ts
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

class TriggersModule {
  graph;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }
  async create(params) {
    const name = params.name.trim();
    if (!name)
      throw new Error("missing or empty required param: name");
    const action_prompt = params.action_prompt.trim();
    if (!action_prompt)
      throw new Error("missing or empty required param: action_prompt");
    const gate_prompt = params.gate_prompt ?? "";
    const event_kinds = params.event_kinds && params.event_kinds.length > 0 ? params.event_kinds : ["sync_ingested"];
    const watch_entity_ids = params.watch_entity_ids ?? [];
    const debounce_seconds = params.debounce_seconds ?? 0;
    if (watch_entity_ids.length > 0) {
      const clarification = await this.rpc.execute("triggers.validate_watch", {
        watch_entity_ids
      });
      if (clarification && typeof clarification === "object") {
        return clarification;
      }
    }
    if (params.episode_id) {
      const episode = await this.graph.get_entity_full(params.episode_id, { links: false });
      if (!episode)
        throw new Error(`episode not found: ${params.episode_id}`);
    }
    const entity = await this.graph.create_entity({ schema_id: TRIGGER, name });
    const config = {
      name,
      gate_prompt,
      action_prompt,
      status: "active",
      event_kinds,
      debounce_seconds,
      firing_count: 0
    };
    if (params.schema_filter !== undefined)
      config.schema_filter = params.schema_filter;
    if (params.expires_at !== undefined)
      config.expires_at = params.expires_at;
    if (params.max_wait_seconds !== undefined)
      config.max_wait_seconds = params.max_wait_seconds;
    if (params.max_firings !== undefined)
      config.max_firings = params.max_firings;
    await this.graph.attach_facet({ entity_id: entity.id, schema_id: TRIGGER_CONFIG, data: config });
    for (const target of watch_entity_ids) {
      await this.graph.add_link({ from_id: entity.id, to_id: target, kind: WATCHES });
    }
    if (params.episode_id) {
      await this.graph.add_link({ from_id: entity.id, to_id: params.episode_id, kind: BELONGS_TO });
    }
    await this.invalidateCache();
    return {
      id: entity.id,
      name,
      status: "active",
      gate_prompt,
      action_prompt,
      firing_count: 0,
      last_fired_at: null,
      schema_id: TRIGGER,
      created_at: entity.created_at ?? new Date().toISOString(),
      episode_id: params.episode_id ?? null
    };
  }
  async get(params) {
    const detail = await this.requireTrigger(params.id);
    return this.detailView(detail);
  }
  async list(params) {
    const page = await this.graph.list_entities({ schema_id: TRIGGER, order: "date", limit: 1000 });
    const items = [];
    for (const entity of page.items) {
      const detail = await this.graph.get_entity_full(entity.id, { links: true });
      if (detail?.entity.schema_id !== TRIGGER)
        continue;
      const config = this.configOf(detail);
      if (!config)
        continue;
      if (params.status && config.status !== params.status)
        continue;
      items.push(await this.listItem(detail, config));
    }
    return items;
  }
  async update(params) {
    const detail = await this.requireTrigger(params.id);
    const config = this.configOf(detail);
    if (!config)
      throw new Error(`trigger config not found: ${params.id}`);
    if (params.name !== undefined) {
      config.name = params.name;
      await this.graph.update_entity_name(params.id, params.name);
    }
    if (params.gate_prompt !== undefined)
      config.gate_prompt = params.gate_prompt;
    if (params.action_prompt !== undefined)
      config.action_prompt = params.action_prompt;
    if (params.status !== undefined)
      config.status = params.status;
    if (params.event_kinds !== undefined)
      config.event_kinds = params.event_kinds;
    if (params.schema_filter !== undefined)
      config.schema_filter = params.schema_filter;
    if (params.expires_at !== undefined)
      config.expires_at = params.expires_at;
    if (params.debounce_seconds !== undefined)
      config.debounce_seconds = params.debounce_seconds;
    if (params.max_wait_seconds !== undefined)
      config.max_wait_seconds = params.max_wait_seconds;
    if (params.max_firings !== undefined)
      config.max_firings = params.max_firings;
    await this.graph.attach_facet({ entity_id: params.id, schema_id: TRIGGER_CONFIG, data: config });
    await this.invalidateCache();
    const fresh = await this.requireTrigger(params.id);
    return this.detailView(fresh);
  }
  async delete(params) {
    await this.requireTrigger(params.id);
    await this.graph.delete_entity(params.id);
    await this.invalidateCache();
    return { deleted: true };
  }
  async link(params) {
    await this.requireTrigger(params.trigger_id);
    const target = await this.graph.get_entity_full(params.entity_id, { links: false });
    if (!target)
      throw new Error(`entity not found: ${params.entity_id}`);
    await this.graph.add_link({ from_id: params.trigger_id, to_id: params.entity_id, kind: WATCHES });
    await this.invalidateCache();
    return { linked: true };
  }
  async unlink(params) {
    await this.requireTrigger(params.trigger_id);
    const links = await this.graph.list_links_for_entity(params.trigger_id);
    for (const link of links) {
      if (link.kind === WATCHES && link.from_id === params.trigger_id && link.to_id === params.entity_id) {
        await this.graph.delete_link(link.id);
      }
    }
    await this.invalidateCache();
    return { unlinked: true };
  }
  async list_for_entity(params) {
    const anchorOwned = await this.graph.get_entity_full(params.entity_id, { links: false });
    if (!anchorOwned)
      return [];
    const anchors = [params.entity_id];
    const watchable = await this.rpc.execute("triggers.resolve_watchable", {
      entity_id: params.entity_id
    });
    for (const w of watchable.watchable) {
      if (!anchors.includes(w.id))
        anchors.push(w.id);
    }
    const seen = new Set;
    const items = [];
    for (const anchor of anchors) {
      const links = await this.graph.list_links_for_entity(anchor);
      for (const link of links) {
        if (link.to_id !== anchor)
          continue;
        if (link.kind !== WATCHES && link.kind !== BELONGS_TO)
          continue;
        const triggerId = link.from_id;
        if (seen.has(triggerId))
          continue;
        seen.add(triggerId);
        const detail = await this.graph.get_entity_full(triggerId, { links: true });
        if (detail?.entity.schema_id !== TRIGGER)
          continue;
        const config = this.configOf(detail);
        if (!config)
          continue;
        items.push(await this.listItem(detail, config));
      }
    }
    return items;
  }
  async fire_history(params) {
    await this.requireTrigger(params.trigger_id);
    const limit = params.limit ?? 50;
    const facets = await this.graph.list_facets_for_entity(params.trigger_id);
    const executions = facets.filter((f) => f.schema_id === TRIGGER_EXECUTION).map((f) => f.data).sort((a, b) => a.fired_at < b.fired_at ? 1 : a.fired_at > b.fired_at ? -1 : 0);
    return executions.slice(0, limit);
  }
  async invalidateCache() {
    await this.rpc.execute("triggers.invalidate_cache", {});
  }
  async requireTrigger(id) {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (detail?.entity.schema_id !== TRIGGER) {
      throw new Error(`trigger not found: ${id}`);
    }
    return detail;
  }
  configOf(detail) {
    const facet = detail.facets.find((f) => f.schema_id === TRIGGER_CONFIG);
    return facet ? facet.data : null;
  }
  watchesLinks(detail) {
    return detail.links.filter((l) => l.kind === WATCHES && l.from_id === detail.entity.id);
  }
  async listItem(detail, config) {
    const names = [];
    for (const link of this.watchesLinks(detail)) {
      const target = await this.graph.get_entity_full(link.to_id, { links: false });
      if (target) {
        const e = target.entity;
        names.push(e.name && e.name.length > 0 ? e.name : e.schema_id);
      }
    }
    return {
      schema_id: TRIGGER,
      id: detail.entity.id,
      name: config.name,
      status: config.status,
      gate_prompt: config.gate_prompt,
      action_prompt: config.action_prompt,
      firing_count: config.firing_count,
      last_fired_at: config.last_fired_at ?? null,
      watched_entity_names: names
    };
  }
  async detailView(detail) {
    const config = this.configOf(detail);
    if (!config)
      throw new Error(`trigger config not found: ${detail.entity.id}`);
    const watched = [];
    for (const link of this.watchesLinks(detail)) {
      const target = await this.graph.get_entity_full(link.to_id, { links: false });
      watched.push({ id: link.to_id, name: target?.entity.name ?? null });
    }
    const belongs = detail.links.find((l) => l.kind === BELONGS_TO && l.from_id === detail.entity.id);
    let parentEpisodeId = null;
    let parentEpisodeName = null;
    if (belongs) {
      parentEpisodeId = belongs.to_id;
      const parent = await this.graph.get_entity_full(belongs.to_id, { links: false });
      parentEpisodeName = parent?.entity.name ?? null;
    }
    return {
      id: detail.entity.id,
      name: config.name,
      gate_prompt: config.gate_prompt,
      action_prompt: config.action_prompt,
      status: config.status,
      event_kinds: config.event_kinds,
      schema_filter: config.schema_filter ?? null,
      expires_at: config.expires_at ?? null,
      debounce_seconds: config.debounce_seconds,
      max_wait_seconds: config.max_wait_seconds ?? null,
      max_firings: config.max_firings ?? null,
      firing_count: config.firing_count,
      last_fired_at: config.last_fired_at ?? null,
      watched_entities: watched,
      parent_episode_id: parentEpisodeId,
      parent_episode_name: parentEpisodeName
    };
  }
}
__decorate([
  writeTool("create", {
    description: "Create a new trigger with gate and action prompts. Optionally link to watched entities.",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Trigger name" },
        gate_prompt: {
          type: "string",
          description: "Prompt for gate evaluation (is this event relevant?)"
        },
        action_prompt: {
          type: "string",
          description: "Prompt for action execution (what to do if relevant)"
        },
        event_kinds: {
          type: "array",
          items: { type: "string" },
          description: "Event kinds to listen for"
        },
        watch_entity_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Entity IDs to watch"
        },
        episode_id: {
          type: "string",
          format: "uuid",
          description: "Parent episode ID — creates belongs_to link"
        },
        schema_filter: { type: "string", description: "Only trigger for events with this schema" },
        expires_at: { type: "string", format: "date-time" },
        debounce_seconds: {
          type: "integer",
          description: "0=immediate fire (default), >0=minimum seconds between firings"
        },
        max_firings: { type: "integer", description: "Maximum total firings before auto-expire" }
      },
      required: ["name", "action_prompt"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "create", null);
__decorate([
  tool("get", {
    description: "Get a trigger detail view by ID.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "get", null);
__decorate([
  tool("list", {
    description: "List triggers with optional status filter.",
    params: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: active, paused, disabled, expired"
        }
      },
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "list", null);
__decorate([
  writeTool("update", {
    description: "Update trigger fields (partial update).",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        gate_prompt: { type: "string" },
        action_prompt: { type: "string" },
        status: { type: "string" },
        event_kinds: { type: "array", items: { type: "string" } },
        schema_filter: { type: "string" },
        expires_at: { type: "string", format: "date-time" },
        debounce_seconds: { type: "integer" },
        max_firings: { type: "integer" }
      },
      required: ["id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "update", null);
__decorate([
  writeTool("delete", {
    description: "Delete a trigger by ID.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "delete", null);
__decorate([
  writeTool("link", {
    description: "Link a trigger to watch an entity.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        entity_id: { type: "string", format: "uuid" }
      },
      required: ["trigger_id", "entity_id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "link", null);
__decorate([
  writeTool("unlink", {
    description: "Unlink a trigger from a watched entity.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        entity_id: { type: "string", format: "uuid" }
      },
      required: ["trigger_id", "entity_id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "unlink", null);
__decorate([
  tool("list_for_entity", {
    description: "List triggers that watch a given entity.",
    params: {
      type: "object",
      properties: { entity_id: { type: "string", format: "uuid" } },
      required: ["entity_id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "list_for_entity", null);
__decorate([
  tool("fire_history", {
    description: "List trigger execution history sorted by fired_at desc.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1 }
      },
      required: ["trigger_id"],
      additionalProperties: false
    }
  })
], TriggersModule.prototype, "fire_history", null);

// plugins/modules/triggers/module/index.ts
definePlugin(TriggersModule);
