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
function rpc(suffix, spec = { description: "", params: {} }) {
  return record(suffix, spec, false, false);
}
function syncHandler(_surface) {
  return record("__sync__", { description: "sync ingest handler", params: {} }, false, false);
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

// plugins/modules/contacts/schema.ts
var CONTACT = "contacts.person";
var CONTACT_PROFILE = "contacts.person.profile";
var CONTACT_EMAIL = "contacts.person.email";
var CONTACT_PHONE = "contacts.person.phone";
var CONTACT_SOCIAL = "contacts.person.social";
var CONTACT_EXTERNAL_LINK = "contacts.person.external_link";

// plugins/modules/contacts/module/helpers.ts
var AVATAR_COLORS = ["orange", "blue", "green", "red", "purple", "pink"];
var INGEST_CHUNK = 200;
function normalizeHandle(handle) {
  return handle.trim().replace(/^@+/, "");
}
function facetTime(f) {
  const t = Date.parse(f.observed_at);
  return Number.isNaN(t) ? 0 : t;
}
function latestSocialFacet(facets) {
  let best;
  for (const f of facets) {
    if (f.schema_id !== CONTACT_SOCIAL)
      continue;
    if (!best || facetTime(f) > facetTime(best))
      best = f;
  }
  return best;
}
function isValidSocialContact(p) {
  return typeof p.handle === "string" && p.handle.length > 0 && typeof p.display_name === "string" && p.display_name.length > 0 && typeof p.profile_url === "string" && p.profile_url.length > 0;
}
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
function detectRelevanceTier(facets) {
  for (const f of facets) {
    const data = f.data;
    const t = data?.relevance_tier;
    if (typeof t === "string")
      return t;
  }
  return null;
}
function detectChannels(facets) {
  const out = new Set;
  for (const f of facets) {
    const s = f.schema_id;
    if (s.startsWith("contacts.identity.telegram") || s.startsWith("telegram."))
      out.add("Telegram");
    else if (s.startsWith("contacts.identity.email") || s.includes("email"))
      out.add("Email");
    else if (s.startsWith("contacts.identity.slack"))
      out.add("Slack");
    else if (s.startsWith("contacts.identity.zoom"))
      out.add("Zoom");
  }
  return [...out].sort();
}
function buildListItem(entity, canonical, facets) {
  const name = entity.name && entity.name.length > 0 ? entity.name : canonicalString(canonical, "person.full_name") ?? "Unknown";
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    name,
    email: canonicalString(canonical, "person.email"),
    phone: canonicalString(canonical, "person.phone"),
    role: canonicalString(canonical, "person.role"),
    company: canonicalString(canonical, "person.company"),
    channels: detectChannels(facets),
    avatar_color: pickAvatarColor(entity.id),
    initials: computeInitials(name),
    relevance_tier: detectRelevanceTier(facets),
    created_at: entity.created_at ?? new Date(0).toISOString(),
    is_pinned: entity.is_pinned ?? null
  };
}

// plugins/modules/contacts/module/socialUrl.ts
var INVALID = { ok: false, error: "invalid_url" };
var X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
var LI_SLUG = /^[A-Za-z0-9%-]{3,100}$/;
var X_RESERVED = new Set([
  "home",
  "search",
  "explore",
  "i",
  "settings",
  "notifications",
  "messages",
  "compose",
  "intent"
]);
function validate(platform, handle) {
  const re = platform === "x" ? X_HANDLE : LI_SLUG;
  return re.test(handle) ? { ok: true, handle } : INVALID;
}
function parseSocialUrl(platform, input) {
  const raw = input.trim();
  if (!raw)
    return INVALID;
  if (/^https?:\/\//i.test(raw)) {
    const afterScheme = raw.replace(/^https?:\/\//i, "");
    const slash = afterScheme.indexOf("/");
    const hostRaw = (slash === -1 ? afterScheme : afterScheme.slice(0, slash)).toLowerCase();
    if (!hostRaw || hostRaw.includes("@") || hostRaw.includes(":"))
      return INVALID;
    const host = hostRaw.replace(/^www\./, "");
    const path = slash === -1 ? "" : afterScheme.slice(slash + 1).replace(/[?#].*$/s, "");
    const segments = path.split("/").filter(Boolean);
    if (platform === "linkedin") {
      if (host !== "linkedin.com")
        return INVALID;
      if (segments[0] !== "in" || !segments[1])
        return INVALID;
      return validate(platform, segments[1]);
    }
    if (host !== "x.com" && host !== "twitter.com")
      return INVALID;
    const handle = segments[0];
    if (!handle || X_RESERVED.has(handle.toLowerCase()))
      return INVALID;
    return validate(platform, handle);
  }
  return validate(platform, raw.replace(/^@+/, ""));
}

// plugins/modules/contacts/module/service.ts
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

class ContactsModule {
  graph;
  util;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.util = deps.util;
    this.rpc = deps.rpc;
  }
  async list(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    const includeAll = params.include_all ?? false;
    let rows;
    let total;
    let prefetchedFacets = null;
    if (search) {
      const page = await searchEntitiesPage(this.graph, {
        query: search,
        schema_id: CONTACT,
        limit,
        offset,
        filter: includeAll ? undefined : async (entities) => {
          const facets = await this.facetsByEntity(entities.map((e) => e.id));
          prefetchedFacets = facets;
          return entities.filter((e) => detectRelevanceTier(facets.get(e.id) ?? []) !== "group");
        }
      });
      total = page.total;
      rows = page.entities;
    } else if (includeAll) {
      const page = await this.graph.list_entities({
        schema_id: CONTACT,
        limit,
        offset,
        order: "idx"
      });
      rows = page.items;
      total = page.total;
    } else {
      const page = await this.graph.list_entities_window({
        schema: CONTACT,
        filter_field: { facet_schema: "telegram.contact", facet_path: "relevance_tier" },
        filter_eq: "group",
        filter_op: "distinct",
        order: [{ field: { entity_field: "idx" } }],
        limit,
        offset
      });
      rows = page.items.map((r) => r.entity);
      total = page.total;
    }
    const ids = rows.map((e) => e.id);
    const canonById = await this.canonicalByEntity(ids);
    const facetsById = prefetchedFacets ?? await this.facetsByEntity(ids);
    const items = rows.map((e) => buildListItem(e, canonById.get(e.id) ?? {}, facetsById.get(e.id) ?? []));
    return { items, total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== CONTACT) {
      throw new Error(`contact not found: ${params.id}`);
    }
    const { entity: e, links } = detail;
    const facets = await this.graph.list_facets_for_entity(e.id);
    const canonical = await this.graph.get_canonical(e.id, [CONTACT]);
    const base = buildListItem(e, canonical, facets);
    const linked = [];
    if (links.length > 0) {
      const neighbourId = (l) => l.from_id === e.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const link of links) {
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
      name: base.name,
      email: base.email,
      phone: base.phone,
      role: base.role,
      company: base.company,
      channels: detectChannels(facets),
      avatar_color: pickAvatarColor(e.id),
      initials: computeInitials(base.name),
      canonical,
      facets,
      linked_entities: linked,
      created_at: base.created_at
    };
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
  async facetsByEntity(ids) {
    const out = new Map;
    for (const f of await this.graph.list_facets_for_entities(ids)) {
      if (!f.entity_id)
        continue;
      const arr = out.get(f.entity_id) ?? [];
      arr.push(f);
      out.set(f.entity_id, arr);
    }
    return out;
  }
  async listItemFor(entity) {
    const canonical = await this.graph.get_canonical(entity.id, [CONTACT]);
    const facets = await this.graph.list_facets_for_entity(entity.id);
    return buildListItem(entity, canonical, facets);
  }
  async create(params) {
    if (params.client_id) {
      const existing = await this.graph.get_entity(params.client_id);
      if (existing) {
        const item2 = await this.listItemFor(existing);
        return { ...item2, fields: { name: item2.name, email_address_entity_id: null } };
      }
    }
    const entity = await this.graph.create_entity({
      schema_id: CONTACT,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase()
    });
    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: CONTACT_PROFILE,
      data: { first_name: params.name }
    });
    if (params.email) {
      await this.graph.attach_facet({
        entity_id: entity.id,
        schema_id: CONTACT_EMAIL,
        data: { email: params.email, is_primary: true }
      });
    }
    if (params.phone) {
      await this.graph.attach_facet({
        entity_id: entity.id,
        schema_id: CONTACT_PHONE,
        data: { phone: params.phone, is_primary: true }
      });
    }
    let email_address_entity_id = null;
    if (params.email) {
      try {
        const addr = await this.rpc.execute("email.ensure_address", {
          address: params.email
        });
        email_address_entity_id = addr.id;
        await this.graph.add_link({ from_id: entity.id, to_id: addr.id, kind: "has_email" });
      } catch {
        email_address_entity_id = null;
      }
    }
    const item = await this.listItemFor(entity);
    return {
      ...item,
      fields: {
        name: params.name,
        email_address_entity_id,
        ...params.email ? { email: params.email } : {},
        ...params.role ? { role: params.role } : {},
        ...params.company ? { company: params.company } : {}
      }
    };
  }
  async batch_create(params) {
    const contacts = params.contacts;
    if (contacts.length < 1 || contacts.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(contacts.length)}`);
    }
    contacts.forEach((c, i) => {
      if (!c.name || c.name.trim().length === 0) {
        throw new Error(`contact[${String(i)}]: missing or empty name`);
      }
    });
    const excluded = new Set(params.excluded_indices ?? []);
    const results = [];
    let created = 0;
    let excludedCount = 0;
    for (const [i, c] of contacts.entries()) {
      if (excluded.has(i)) {
        excludedCount += 1;
        results.push({ id: null, name: c.name, status: "excluded" });
        continue;
      }
      const rowClientId = params.client_id ? await this.util.uuid_v5(params.client_id, `contacts.batch_create:${String(i)}`) : undefined;
      const item = await this.create({
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        role: c.role,
        client_id: rowClientId
      });
      created += 1;
      results.push({ id: item.id, name: c.name, email: c.email ?? null, status: "created" });
    }
    return { results, total: contacts.length, created, excluded: excludedCount };
  }
  async update(params) {
    const existing = await this.graph.get_entity(params.id);
    if (!existing)
      throw new Error(`contact not found: ${params.id}`);
    if (params.name) {
      await this.graph.update_entity_name(params.id, params.name);
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: CONTACT_PROFILE,
        data: { first_name: params.name }
      });
    }
    const fresh = await this.graph.get_entity(params.id);
    return this.listItemFor(fresh ?? existing);
  }
  async merge_preview(params) {
    return this.graph.merge_preview({
      survivor_id: params.survivor_id,
      retired_id: params.retired_id
    });
  }
  async merge(params) {
    const result = await this.graph.merge_execute({
      survivor_id: params.survivor_id,
      retired_id: params.retired_id,
      overrides: params.overrides,
      reason: params.reason
    });
    const canon = await this.graph.get_canonical(params.survivor_id, [CONTACT]);
    const first = canon["person.first_name"];
    if (typeof first === "string" && first.length > 0) {
      const last = canon["person.last_name"];
      const full = typeof last === "string" && last.length > 0 ? `${first} ${last}` : first;
      await this.graph.update_entity_name(params.survivor_id, full);
      await this.graph.update_entity_idx(params.survivor_id, full.toLowerCase());
    }
    return result;
  }
  async search(params) {
    const MAX_LIMIT = 50;
    const limit = Math.min(params.limit ?? 25, MAX_LIMIT);
    const matched = await this.graph.search_entities_by_name({
      query: params.query ?? "",
      schema_ids: [CONTACT],
      limit
    });
    const results = matched.map((e) => ({
      id: e.id,
      name: e.name && e.name.length > 0 ? e.name : null,
      schema_id: e.schema_id,
      schema_version: 1
    }));
    results.sort((a, b) => {
      const an = a.name ?? "";
      const bn = b.name ?? "";
      if (an !== bn)
        return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
  async ingest(params) {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped = [];
    const byRemoteId = new Map;
    for (const env of envelopes) {
      if (!env.user_id)
        continue;
      if (env.kind !== "snapshot" && env.kind !== "live")
        continue;
      if (!env.remote_id)
        continue;
      const payload = env.payload ?? {};
      if (payload.kind === "social_contact" && !isValidSocialContact(payload)) {
        dropped.push(env.remote_id);
        continue;
      }
      byRemoteId.set(env.remote_id, env);
    }
    let chunk = [];
    const flush = async () => {
      if (chunk.length > 0) {
        await this.ingestContactBatch(chunk);
        await Promise.resolve();
      }
      chunk = [];
    };
    for (const env of byRemoteId.values()) {
      if (chunk.length >= INGEST_CHUNK)
        await flush();
      chunk.push(env);
    }
    await flush();
    return { ok: dropped.length === 0, dropped_remote_ids: dropped };
  }
  async ingestContactBatch(envelopes) {
    const entities = [];
    for (const env of envelopes) {
      const remoteId = env.remote_id;
      if (!remoteId)
        continue;
      const raw = env.payload ?? {};
      if (raw.kind === "social_contact") {
        const platform = env.source_id === "linkedin" ? "linkedin" : "x";
        const handle = raw.handle;
        const existing = await this.get_social_tracking_by_handle({
          platform,
          handle
        });
        if (existing)
          continue;
        const displayName = raw.display_name;
        const profileUrl = raw.profile_url;
        entities.push({
          key: remoteId,
          schema_id: CONTACT,
          name: displayName,
          idx: displayName.toLowerCase() || undefined,
          facets: [
            {
              schema_id: CONTACT_PROFILE,
              data: {},
              external_id: remoteId,
              confidence: 90
            },
            {
              schema_id: CONTACT_SOCIAL,
              data: platform === "linkedin" ? { linkedin_handle: handle, tracked_linkedin: false } : { x_handle: handle, tracked_x: false },
              confidence: 90
            },
            {
              schema_id: CONTACT_EXTERNAL_LINK,
              data: {
                source_type: platform,
                external_id: remoteId,
                external_url: profileUrl,
                external_name: displayName
              },
              confidence: 90
            }
          ]
        });
        continue;
      }
      const p = raw;
      const facets = [];
      const profile = {};
      if (p.given_name)
        profile.first_name = p.given_name;
      if (p.family_name)
        profile.last_name = p.family_name;
      facets.push({
        schema_id: CONTACT_PROFILE,
        data: profile,
        external_id: remoteId,
        confidence: 90
      });
      for (const e of p.emails ?? []) {
        const address = typeof e.address === "string" ? e.address : undefined;
        if (!address)
          continue;
        const data = { email: address };
        if (e.label)
          data.type = e.label;
        if (typeof e.is_primary === "boolean")
          data.is_primary = e.is_primary;
        facets.push({ schema_id: CONTACT_EMAIL, data, confidence: 90 });
      }
      for (const ph of p.phones ?? []) {
        const number = typeof ph.number === "string" ? ph.number : undefined;
        if (!number)
          continue;
        const data = { phone: number };
        if (ph.label)
          data.type = ph.label;
        if (typeof ph.is_primary === "boolean")
          data.is_primary = ph.is_primary;
        facets.push({ schema_id: CONTACT_PHONE, data, confidence: 90 });
      }
      const extData = {
        source_type: "google",
        external_id: typeof p.id === "string" ? p.id : remoteId
      };
      if (p.external_url)
        extData.external_url = p.external_url;
      if (p.display_name)
        extData.external_name = p.display_name;
      facets.push({ schema_id: CONTACT_EXTERNAL_LINK, data: extData, confidence: 90 });
      const name = typeof p.display_name === "string" ? p.display_name : "";
      entities.push({
        key: remoteId,
        schema_id: CONTACT,
        name,
        idx: name.toLowerCase() || undefined,
        facets
      });
    }
    if (entities.length === 0)
      return;
    await this.graph.apply_batch({ entities, refs: [], links: [] });
  }
  async set_social_tracking(params) {
    const existing = await this.graph.get_entity(params.id);
    if (existing?.schema_id !== CONTACT) {
      throw new Error(`contact not found: ${params.id}`);
    }
    const next = { ...await this.readSocialTracking(params.id) };
    if (params.platform === "x") {
      next.tracked_x = params.tracked;
      if (params.handle !== undefined)
        next.x_handle = normalizeHandle(params.handle);
    } else {
      next.tracked_linkedin = params.tracked;
      if (params.handle !== undefined)
        next.linkedin_handle = normalizeHandle(params.handle);
    }
    await this.graph.attach_facet({
      entity_id: params.id,
      schema_id: CONTACT_SOCIAL,
      data: next
    });
    return next;
  }
  async track_social_profile(params) {
    const parsed = parseSocialUrl(params.platform, params.url_or_handle);
    if (!parsed.ok) {
      throw new Error(`invalid_url: not a ${params.platform} profile: ${params.url_or_handle}`);
    }
    const existing = await this.get_social_tracking_by_handle({
      platform: params.platform,
      handle: parsed.handle
    });
    if (existing) {
      if (!existing.tracked) {
        await this.set_social_tracking({
          id: existing.contact_id,
          platform: params.platform,
          tracked: true
        });
      }
      return { contact_id: existing.contact_id, handle: existing.handle, created: false };
    }
    const contact = await this.create({ name: params.name ?? parsed.handle });
    await this.set_social_tracking({
      id: contact.id,
      platform: params.platform,
      tracked: true,
      handle: parsed.handle
    });
    return { contact_id: contact.id, handle: parsed.handle, created: true };
  }
  async batch_track_social(params) {
    const profiles = params.profiles;
    if (profiles.length < 1 || profiles.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(profiles.length)}`);
    }
    const excluded = new Set(params.excluded_indices ?? []);
    const results = [];
    let created = 0;
    let excludedCount = 0;
    for (const [i, row] of profiles.entries()) {
      if (excluded.has(i)) {
        excludedCount += 1;
        results.push({
          contact_id: null,
          handle: null,
          url_or_handle: row.url_or_handle,
          status: "excluded"
        });
        continue;
      }
      const parsed = parseSocialUrl(params.platform, row.url_or_handle);
      if (!parsed.ok) {
        results.push({
          contact_id: null,
          handle: null,
          url_or_handle: row.url_or_handle,
          status: "invalid_url"
        });
        continue;
      }
      const existing = await this.get_social_tracking_by_handle({
        platform: params.platform,
        handle: parsed.handle
      });
      if (existing) {
        if (!existing.tracked) {
          await this.set_social_tracking({
            id: existing.contact_id,
            platform: params.platform,
            tracked: true
          });
        }
        results.push({
          contact_id: existing.contact_id,
          handle: existing.handle,
          url_or_handle: row.url_or_handle,
          status: "tracked"
        });
        continue;
      }
      const rowClientId = params.client_id ? await this.util.uuid_v5(params.client_id, `contacts.batch_track_social:${String(i)}`) : undefined;
      const contact = await this.create({
        name: row.name ?? parsed.handle,
        client_id: rowClientId
      });
      await this.set_social_tracking({
        id: contact.id,
        platform: params.platform,
        tracked: true,
        handle: parsed.handle
      });
      created += 1;
      results.push({
        contact_id: contact.id,
        handle: parsed.handle,
        url_or_handle: row.url_or_handle,
        status: "created"
      });
    }
    return { results, total: profiles.length, created, excluded: excludedCount };
  }
  async rename_if_placeholder(params) {
    const entity = await this.graph.get_entity(params.id);
    if (entity?.schema_id !== CONTACT)
      return { renamed: false };
    if (entity.name !== params.expected_name)
      return { renamed: false };
    if (!params.new_name.trim() || params.new_name === params.expected_name) {
      return { renamed: false };
    }
    await this.graph.update_entity_name(params.id, params.new_name);
    return { renamed: true };
  }
  async get_social_tracking_by_handle(params) {
    const want = params.handle.trim().toLowerCase();
    if (!want)
      return null;
    const handleKey = params.platform === "x" ? "x_handle" : "linkedin_handle";
    const trackedKey = params.platform === "x" ? "tracked_x" : "tracked_linkedin";
    const PAGE = 500;
    for (let offset = 0;; offset += PAGE) {
      const page = await this.graph.list_entities({ schema_id: CONTACT, limit: PAGE, offset });
      if (page.items.length === 0)
        return null;
      const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
      const latestFacetByEntity = new Map;
      for (const f of facets) {
        if (f.schema_id !== CONTACT_SOCIAL || !f.entity_id)
          continue;
        const cur = latestFacetByEntity.get(f.entity_id);
        if (!cur || facetTime(f) > facetTime(cur))
          latestFacetByEntity.set(f.entity_id, f);
      }
      const latestByEntity = new Map;
      for (const [eid, f] of latestFacetByEntity) {
        latestByEntity.set(eid, f.data);
      }
      for (const [entityId, social] of latestByEntity) {
        const stored = social[handleKey]?.trim();
        if (stored?.toLowerCase() === want) {
          return { contact_id: entityId, tracked: social[trackedKey] === true, handle: stored };
        }
      }
      if (offset + PAGE >= page.total)
        return null;
    }
  }
  async list_social_tracking(params) {
    const handleKey = params.platform === "x" ? "x_handle" : "linkedin_handle";
    const trackedKey = params.platform === "x" ? "tracked_x" : "tracked_linkedin";
    const out = [];
    const PAGE = 500;
    for (let offset = 0;; offset += PAGE) {
      const page = await this.graph.list_entities({ schema_id: CONTACT, limit: PAGE, offset });
      if (page.items.length === 0)
        break;
      const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
      const latestFacetByEntity = new Map;
      for (const f of facets) {
        if (f.schema_id !== CONTACT_SOCIAL || !f.entity_id)
          continue;
        const cur = latestFacetByEntity.get(f.entity_id);
        if (!cur || facetTime(f) > facetTime(cur))
          latestFacetByEntity.set(f.entity_id, f);
      }
      for (const [entityId, f] of latestFacetByEntity) {
        const social = f.data;
        const handle = social[handleKey]?.trim();
        if (social[trackedKey] === true && handle) {
          const name = page.items.find((e) => e.id === entityId)?.name ?? handle;
          out.push({ contact_id: entityId, name, handle });
        }
      }
      if (offset + PAGE >= page.total)
        break;
    }
    return out;
  }
  async get_social_tracking(params) {
    return this.readSocialTracking(params.id);
  }
  async readSocialTracking(id) {
    const facets = await this.graph.list_facets_for_entity(id);
    const latest = latestSocialFacet(facets);
    return latest?.data ?? {};
  }
}
__decorate([
  tool("list", {
    description: "List contacts with pagination and optional name search. By default, " + "Telegram group-only co-members (relevance_tier 'group') are hidden; " + "pass include_all: true to show every contact.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
        include_all: { type: "boolean" }
      },
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a full contact detail view (canonical, facets, links) by id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "get", null);
__decorate([
  writeTool("create", {
    description: "Create a new contact (person). Returns the created entity with id. " + "Pass client_id (UUID) as an idempotency key — if a contact already " + "exists with that id, the existing one is returned instead of a duplicate.",
    params: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        role: { type: "string" }
      },
      required: ["name"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "create", null);
__decorate([
  writeTool("batch_create", {
    description: "Create multiple contacts at once. Each requires a name, with optional " + "email, phone, company, role. Pass client_id (UUID) as a batch idempotency key.",
    params: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              company: { type: "string" },
              role: { type: "string" }
            },
            required: ["name"],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 50
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } }
      },
      required: ["contacts"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "batch_create", null);
__decorate([
  writeTool("update", {
    description: "Update a contact's name.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "update", null);
__decorate([
  tool("merge_preview", {
    description: "Preview merging two contacts: which facets/links move and which fields conflict.",
    params: {
      type: "object",
      properties: {
        survivor_id: { type: "string", format: "uuid" },
        retired_id: { type: "string", format: "uuid" }
      },
      required: ["survivor_id", "retired_id"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "merge_preview", null);
__decorate([
  writeTool("merge", {
    description: "Merge two contacts into one. Transfers all facets, links, and history from " + "retired to survivor, then deletes retired.",
    params: {
      type: "object",
      properties: {
        survivor_id: { type: "string", format: "uuid" },
        retired_id: { type: "string", format: "uuid" },
        overrides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              canonical_key: { type: "string" },
              value: { type: ["string", "number", "boolean", "null"] }
            },
            required: ["canonical_key", "value"]
          }
        },
        reason: { type: "string" }
      },
      required: ["survivor_id", "retired_id"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "merge", null);
__decorate([
  tool("search", {
    description: "Search contacts by name.",
    params: {
      type: "object",
      properties: {
        query: { type: "string" },
        context: { type: "string" },
        limit: { type: "integer", minimum: 1 }
      },
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "search", null);
__decorate([
  syncHandler("contacts")
], ContactsModule.prototype, "ingest", null);
__decorate([
  writeTool("set_social_tracking", {
    description: "Opt a contact in or out of social tracking on X or LinkedIn. Only tracked " + "handles are fetched by the social source connectors. Optionally set the handle.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        platform: { type: "string", enum: ["x", "linkedin"] },
        tracked: { type: "boolean" },
        handle: { type: "string" }
      },
      required: ["id", "platform", "tracked"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "set_social_tracking", null);
__decorate([
  writeTool("track_social_profile", {
    description: "Track a person's X or LinkedIn profile from a URL or handle. Finds the contact " + "that already owns the handle (or creates one) and turns tracking ON. NOTE: every " + "tracked handle costs paid API calls on each sync cycle.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        url_or_handle: { type: "string" },
        name: { type: "string" }
      },
      required: ["platform", "url_or_handle"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "track_social_profile", null);
__decorate([
  writeTool("batch_track_social", {
    description: "Track MANY X or LinkedIn profiles at once from pasted URLs/handles (1-50). Each " + "becomes a contact (found or created) with tracking ON. COST WARNING: every tracked " + "handle is fetched on every sync cycle and costs paid API credits — confirm large " + "batches with the operator first.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        profiles: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              url_or_handle: { type: "string" },
              name: { type: "string" }
            },
            required: ["url_or_handle"],
            additionalProperties: false
          }
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } }
      },
      required: ["platform", "profiles"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "batch_track_social", null);
__decorate([
  rpc("rename_if_placeholder")
], ContactsModule.prototype, "rename_if_placeholder", null);
__decorate([
  tool("get_social_tracking_by_handle", {
    description: "Resolve which contact tracks a given X / LinkedIn handle and whether tracking " + "is currently on. Case-insensitive. Returns null when no contact has the handle.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        handle: { type: "string" }
      },
      required: ["platform", "handle"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "get_social_tracking_by_handle", null);
__decorate([
  tool("list_social_tracking", {
    description: "List every contact with social tracking ON for a platform (X / LinkedIn): " + "contact id, name and tracked handle. Feeds pending 'Syncing' rows in the " + "platform modules.",
    params: {
      type: "object",
      properties: { platform: { type: "string", enum: ["x", "linkedin"] } },
      required: ["platform"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "list_social_tracking", null);
__decorate([
  tool("get_social_tracking", {
    description: "Get a contact's social-tracking opt-in state (X / LinkedIn) and handles.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], ContactsModule.prototype, "get_social_tracking", null);

// plugins/modules/contacts/module/index.ts
definePlugin(ContactsModule);
