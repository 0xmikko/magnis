// packages/plugin-sdk/index.ts
async function searchEntitiesPage(graph, p) {
  const needed = p.offset + p.limit + 1;
  let fetchLimit = needed;
  for (;; ) {
    const found = await graph.search_entities_by_name({
      query: p.query,
      schema_ids: [p.schema_id],
      limit: fetchLimit
    });
    const kept = p.filter ? await p.filter(found) : found;
    if (kept.length >= needed || found.length < fetchLimit) {
      return { entities: kept.slice(p.offset, p.offset + p.limit), total: kept.length };
    }
    fetchLimit *= 2;
  }
}
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
function syncHandler(_surface) {
  return record("__sync__", { description: "sync ingest handler", params: {} }, false, false);
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

// plugins/modules/x/schema.ts
var PROFILE = "x.profile";
var PROFILE_IDENTITY = "x.profile.identity";
var POST = "x.post";
var POST_CONTENT = "x.post.content";
var POST_METRICS = "x.post.metrics";
var AUTHORED_BY = "x.post:x.profile";
var PROFILE_PERSON_LINK = "x.profile:contacts.person";

// plugins/modules/x/module/helpers.ts
function str(o, k) {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}
function richPostFields(d) {
  const m = d.metrics;
  const num = (o, k) => typeof o[k] === "number" ? o[k] : null;
  return {
    post_type: str(d, "post_type") ?? null,
    article_title: str(d, "article_title") ?? null,
    media: Array.isArray(d.media) ? d.media : [],
    urls: Array.isArray(d.urls) ? d.urls : [],
    metrics: m && typeof m === "object" ? {
      likes: num(m, "likes"),
      reposts: num(m, "reposts"),
      replies: num(m, "replies"),
      impressions: num(m, "impressions")
    } : null
  };
}

// plugins/modules/x/module/service.ts
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

class XModule {
  graph;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }
  async ingest(params) {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped = [];
    const entities = [];
    const links = [];
    const profileKeyByHandle = new Map;
    for (const env of envelopes) {
      const remoteId = env.remote_id;
      const payload = env.payload;
      const entityType = str(payload, "entity_type");
      if (!remoteId || env.kind === "delete") {
        if (remoteId && env.kind === "delete")
          dropped.push(remoteId);
        continue;
      }
      if (entityType === "profile") {
        const identity = payload;
        entities.push({
          key: remoteId,
          schema_id: PROFILE,
          name: identity.display_name ?? identity.handle,
          facets: [
            { schema_id: PROFILE_IDENTITY, data: payload, external_id: remoteId, confidence: 100 }
          ]
        });
        if (identity.handle)
          profileKeyByHandle.set(identity.handle.toLowerCase(), remoteId);
      } else if (entityType === "post") {
        const content = payload;
        const metrics = payload.metrics ?? {};
        const facets = [
          { schema_id: POST_CONTENT, data: payload, external_id: remoteId, confidence: 100 },
          { schema_id: POST_METRICS, data: metrics, external_id: `${remoteId}:metrics`, confidence: 100 }
        ];
        entities.push({
          key: remoteId,
          schema_id: POST,
          name: content.text.slice(0, 80),
          date: content.created_at ?? undefined,
          facets
        });
      } else {
        if (remoteId)
          dropped.push(remoteId);
      }
    }
    for (const env of envelopes) {
      const payload = env.payload;
      if (str(payload, "entity_type") !== "post" || !env.remote_id)
        continue;
      const handle = str(payload, "author_handle");
      if (!handle)
        continue;
      const profileKey = profileKeyByHandle.get(handle.toLowerCase());
      if (profileKey) {
        links.push({ from_key: env.remote_id, to_key: profileKey, kind: AUTHORED_BY });
      }
    }
    if (entities.length > 0) {
      const applied = await this.graph.apply_batch({ entities, links });
      await this.linkProfilesToContacts(envelopes, applied.ids);
    }
    return { ok: dropped.length === 0, dropped_remote_ids: dropped };
  }
  async import_following(params) {
    await this.rpc.execute("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: {
        handle: params.handle,
        ...params.limit !== undefined ? { limit: params.limit } : {}
      }
    });
    return { scheduled: true, surface: "contacts" };
  }
  async linkProfilesToContacts(envelopes, ids) {
    for (const env of envelopes) {
      const payload = env.payload;
      if (str(payload, "entity_type") !== "profile" || !env.remote_id)
        continue;
      const handle = str(payload, "handle");
      const profileId = ids[env.remote_id];
      if (!handle || !profileId)
        continue;
      try {
        const owner = await this.rpc.execute("contacts.get_social_tracking_by_handle", { platform: "x", handle });
        if (!owner)
          continue;
        await this.graph.add_link({
          from_id: profileId,
          to_id: owner.contact_id,
          kind: PROFILE_PERSON_LINK
        });
        const displayName = str(payload, "display_name");
        if (displayName) {
          await this.rpc.execute("contacts.rename_if_placeholder", {
            id: owner.contact_id,
            expected_name: handle,
            new_name: displayName
          });
        }
      } catch {}
    }
  }
  async postsList(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const win = await this.graph.list_entities_window({
      schema: POST,
      facet_schema: POST_CONTENT,
      order: [{ field: { facet_schema: POST_CONTENT, facet_path: "created_at" }, desc: true }],
      limit,
      offset
    });
    let items = win.items.map((row) => this.postItem(row));
    if (params.platform)
      items = items.filter((i) => i.platform === params.platform);
    if (params.author_handle)
      items = items.filter((i) => i.author_handle === params.author_handle);
    return { items, total: win.total, limit, offset };
  }
  async postsGet(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== POST) {
      throw new Error(`x post not found: ${params.id}`);
    }
    const data = detail.facets.find((f) => f.schema_id === POST_CONTENT)?.data ?? {};
    return {
      id: detail.entity.id,
      post_id: str(data, "post_id") ?? null,
      conversation_id: str(data, "conversation_id") ?? null,
      platform: str(data, "platform") ?? null,
      author_handle: str(data, "author_handle") ?? null,
      text: str(data, "text") ?? "",
      created_at: str(data, "created_at") ?? null,
      url: str(data, "url") ?? null,
      ...richPostFields(data)
    };
  }
  async profilesGet(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== PROFILE) {
      throw new Error(`x profile not found: ${params.id}`);
    }
    const d = detail.facets.find((f) => f.schema_id === PROFILE_IDENTITY)?.data ?? {};
    const fc = d.follower_count;
    return {
      id: detail.entity.id,
      platform: str(d, "platform") ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? detail.entity.name,
      follower_count: typeof fc === "number" ? fc : null,
      bio: str(d, "bio") ?? null,
      url: str(d, "url") ?? null,
      avatar_url: str(d, "avatar_url") ?? null
    };
  }
  async profilesList(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search) {
      const { entities: page, total } = await searchEntitiesPage(this.graph, {
        query: search,
        schema_id: PROFILE,
        limit,
        offset
      });
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const latest = new Map;
      for (const f of facets) {
        if (f.schema_id !== PROFILE_IDENTITY || !f.entity_id)
          continue;
        const cur = latest.get(f.entity_id);
        if (!cur || f.observed_at > cur.observed_at) {
          latest.set(f.entity_id, { observed_at: f.observed_at, data: f.data });
        }
      }
      const items2 = page.map((e) => this.profileItem({
        entity: e,
        data: latest.get(e.id)?.data ?? {}
      }));
      return { items: items2, total, limit, offset };
    }
    const win = await this.graph.list_entities_window({
      schema: PROFILE,
      facet_schema: PROFILE_IDENTITY,
      limit,
      offset
    });
    let items = win.items.map((row) => this.profileItem(row));
    if (params.platform)
      items = items.filter((i) => i.platform === params.platform);
    return { items, total: win.total, limit, offset };
  }
  postItem(row) {
    const d = row.data ?? {};
    return {
      id: row.entity.id,
      post_id: str(d, "post_id") ?? null,
      conversation_id: str(d, "conversation_id") ?? null,
      platform: str(d, "platform") ?? null,
      author_handle: str(d, "author_handle") ?? null,
      text: str(d, "text") ?? row.entity.name,
      created_at: str(d, "created_at") ?? null,
      url: str(d, "url") ?? null,
      ...richPostFields(d)
    };
  }
  profileItem(row) {
    const d = row.data ?? {};
    const fc = d.follower_count;
    return {
      id: row.entity.id,
      platform: str(d, "platform") ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? row.entity.name,
      follower_count: typeof fc === "number" ? fc : null,
      avatar_url: str(d, "avatar_url") ?? null
    };
  }
}
__decorate([
  syncHandler("x")
], XModule.prototype, "ingest", null);
__decorate([
  writeTool("import_following", {
    description: "Import the accounts an X user follows as contacts. Schedules a sync " + "bootstrap of the x source's contacts surface — the import itself runs " + "through the standard sync pipeline. Imported friends are NOT tracked; " + "tracking their tweets stays a per-person opt-in. Re-running refreshes " + "the list idempotently.",
    params: {
      type: "object",
      properties: {
        handle: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 5000 }
      },
      required: ["handle"],
      additionalProperties: false
    }
  })
], XModule.prototype, "import_following", null);
__decorate([
  tool("posts.list", {
    description: "List ingested x posts (most recent first), optional platform filter.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        platform: { type: "string", enum: ["x", "linkedin"] },
        author_handle: { type: "string" }
      },
      additionalProperties: false
    }
  })
], XModule.prototype, "postsList", null);
__decorate([
  tool("posts.get", {
    description: "Get a x post by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], XModule.prototype, "postsGet", null);
__decorate([
  tool("profiles.get", {
    description: "Get a tracked x profile by entity id (name, handle, followers, bio, url).",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], XModule.prototype, "profilesGet", null);
__decorate([
  tool("profiles.list", {
    description: "List tracked x profiles, optional platform filter and name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        platform: { type: "string", enum: ["x", "linkedin"] },
        search: { type: "string" }
      },
      additionalProperties: false
    }
  })
], XModule.prototype, "profilesList", null);

// plugins/modules/x/module/index.ts
definePlugin(XModule);
