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
function str(o, k) {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}
function num(o, k) {
  const v = o[k];
  return typeof v === "number" ? v : null;
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

// plugins/modules/linkedin/schema.ts
var PROFILE = "linkedin.profile";
var PROFILE_IDENTITY = "linkedin.profile.identity";
var POST = "linkedin.post";
var POST_CONTENT = "linkedin.post.content";
var POST_METRICS = "linkedin.post.metrics";
var AUTHORED_BY = "linkedin.post:linkedin.profile";
var PROFILE_PERSON_LINK = "linkedin.profile:contacts.person";

// plugins/modules/linkedin/module/helpers.ts
function richPostFields(d) {
  const m = d.metrics;
  return {
    is_repost: d.is_repost === true,
    media: Array.isArray(d.media) ? d.media : [],
    metrics: m && typeof m === "object" ? {
      likes: num(m, "likes"),
      reposts: num(m, "reposts"),
      replies: num(m, "replies")
    } : null
  };
}

// plugins/modules/linkedin/module/service.ts
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

class LinkedinModule {
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
        const owner = await this.rpc.execute("contacts.get_social_tracking_by_handle", { platform: "linkedin", handle });
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
      throw new Error(`linkedin post not found: ${params.id}`);
    }
    const data = detail.facets.find((f) => f.schema_id === POST_CONTENT)?.data ?? {};
    return {
      id: detail.entity.id,
      platform: str(data, "platform") ?? null,
      author_handle: str(data, "author_handle") ?? null,
      text: str(data, "text") ?? "",
      created_at: str(data, "created_at") ?? null,
      url: str(data, "url") ?? null,
      ...richPostFields(data)
    };
  }
  async profilesGet(params) {
    if (params.id.startsWith("pending:")) {
      const handle = params.id.slice("pending:".length);
      let name = handle;
      try {
        const tracked = await this.rpc.execute("contacts.list_social_tracking", { platform: "linkedin" });
        name = tracked.find((t) => t.handle === handle)?.name ?? handle;
      } catch {}
      return {
        id: params.id,
        platform: "linkedin",
        handle,
        display_name: name,
        follower_count: null,
        bio: null,
        url: `https://www.linkedin.com/in/${handle}/`,
        avatar_url: null,
        pending: true
      };
    }
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== PROFILE) {
      throw new Error(`linkedin profile not found: ${params.id}`);
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
    if (offset === 0) {
      const pending = await this.pendingProfiles(items.map((i) => i.handle));
      if (pending.length > 0) {
        items = [...pending, ...items];
        return { items, total: win.total + pending.length, limit, offset };
      }
    }
    return { items, total: win.total, limit, offset };
  }
  async pendingProfiles(pageHandles) {
    let tracked;
    try {
      tracked = await this.rpc.execute("contacts.list_social_tracking", {
        platform: "linkedin"
      });
    } catch {
      return [];
    }
    if (!Array.isArray(tracked) || tracked.length === 0)
      return [];
    const known = new Set(pageHandles.filter((h) => !!h).map((h) => h.toLowerCase()));
    const win = await this.graph.list_entities_window({
      schema: PROFILE,
      facet_schema: PROFILE_IDENTITY,
      limit: 1000,
      offset: 0
    });
    for (const row of win.items) {
      const h = str(row.data ?? {}, "handle");
      if (h)
        known.add(h.toLowerCase());
    }
    return tracked.filter((t) => !known.has(t.handle.toLowerCase())).map((t) => ({
      id: `pending:${t.handle}`,
      platform: "linkedin",
      handle: t.handle,
      display_name: t.name || t.handle,
      follower_count: null,
      avatar_url: null,
      pending: true
    }));
  }
  postItem(row) {
    const d = row.data ?? {};
    return {
      id: row.entity.id,
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
  syncHandler("linkedin")
], LinkedinModule.prototype, "ingest", null);
__decorate([
  tool("posts.list", {
    description: "List ingested linkedin posts (most recent first). Filter by author_handle " + "to get one tracked person's feed.",
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
], LinkedinModule.prototype, "postsList", null);
__decorate([
  tool("posts.get", {
    description: "Get a linkedin post by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], LinkedinModule.prototype, "postsGet", null);
__decorate([
  tool("profiles.get", {
    description: "Get a tracked linkedin profile by entity id (name, handle, followers, bio, url).",
    params: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], LinkedinModule.prototype, "profilesGet", null);
__decorate([
  tool("profiles.list", {
    description: "List tracked linkedin profiles, optional platform filter and name search.",
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
], LinkedinModule.prototype, "profilesList", null);

// plugins/modules/linkedin/module/index.ts
definePlugin(LinkedinModule);
