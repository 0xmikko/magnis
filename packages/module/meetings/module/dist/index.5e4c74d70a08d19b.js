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

// plugins/modules/meetings/module/helpers.ts
var str = (d, k) => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};
var nonEmpty = (d, k) => str(d, k);
function parseRfc3339(s) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s))
    return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
function normalizeAttendees(attendees) {
  return (attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email }));
}
function parseAttendees(facetData, entityId) {
  const raw = facetData?.attendees;
  if (raw === undefined || raw === null)
    return [];
  if (!Array.isArray(raw)) {
    throw new Error(`malformed attendees facet for entity ${entityId}: expected an array`);
  }
  return raw.map((a) => {
    if (typeof a !== "object" || a === null || Array.isArray(a)) {
      throw new Error(`malformed attendees facet for entity ${entityId}: attendee is not an object`);
    }
    const email = a.email;
    if (typeof email !== "string") {
      throw new Error(`malformed attendees facet for entity ${entityId}: attendee missing email`);
    }
    const name = a.name;
    const out = { email };
    if (typeof name === "string")
      out.name = name;
    return out;
  });
}
async function resolveContactForEmail(graph, email) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0)
    return null;
  const addrId = await graph.find_by_external_id(`email:address:${normalized}`);
  if (!addrId)
    return null;
  const links = await graph.list_links_for_entity(addrId);
  for (const link of links) {
    if (link.kind !== "has_email" || link.to_id !== addrId)
      continue;
    const person = await graph.get_entity(link.from_id);
    if (person?.schema_id === "contacts.person")
      return person.id;
  }
  return null;
}
async function enrichAttendees(graph, raw) {
  const out = [];
  for (const a of raw) {
    const contact_id = await resolveContactForEmail(graph, a.email);
    out.push({ name: a.name ?? null, email: a.email, contact_id });
  }
  return out;
}
function formatDateTime(startsAt, endsAt) {
  const startM = typeof startsAt === "string" ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(startsAt) : null;
  const date = startM ? startM.at(1) ?? null : null;
  const startTime = startM ? startM.at(2) ?? null : null;
  const endM = typeof endsAt === "string" ? /T(\d{2}:\d{2})/.exec(endsAt) : null;
  const endTime = endM ? endM.at(1) ?? null : null;
  let time;
  if (startTime && endTime)
    time = `${startTime} - ${endTime}`;
  else if (startTime)
    time = startTime;
  else
    time = null;
  return { date, time };
}
function buildListItem(entity, d, attendees) {
  const { date, time } = formatDateTime(str(d, "starts_at") ?? undefined, str(d, "ends_at") ?? undefined);
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    title: entity.name && entity.name.length > 0 ? entity.name : "Untitled Meeting",
    date,
    time,
    starts_at: str(d, "starts_at"),
    ends_at: str(d, "ends_at"),
    location: nonEmpty(d, "location"),
    description: nonEmpty(d, "description"),
    conference_link: nonEmpty(d, "conference_link"),
    attendees,
    created_at: entity.created_at ?? ""
  };
}

// plugins/modules/meetings/schema.ts
var CAL = "meetings.calendar_event";
var CAL_DETAILS = "meetings.calendar_event.details";
var EVENT = "meetings.event";
var MEETING = "meetings.meeting";

// plugins/modules/meetings/module/service.ts
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

class MeetingsModule {
  graph;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }
  async list(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search.length > 0) {
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [CAL],
        limit: limit + offset
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const byId = new Map;
      for (const f of facets) {
        if (f.schema_id === CAL_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
          byId.set(f.entity_id, f.data);
        }
      }
      const items2 = [];
      for (const e of page) {
        const d = byId.get(e.id) ?? {};
        const attendees = await enrichAttendees(this.graph, parseAttendees(d, e.id));
        items2.push(buildListItem(e, d, attendees));
      }
      return { items: items2, total, limit, offset };
    }
    const win = await this.graph.list_entities_window({
      schema: CAL,
      facet_schema: CAL_DETAILS,
      order: [{ field: { facet_schema: CAL_DETAILS, facet_path: "starts_at" }, desc: true }],
      limit,
      offset
    });
    const items = [];
    for (const { entity, data } of win.items) {
      const d = data ?? {};
      const attendees = await enrichAttendees(this.graph, parseAttendees(d, entity.id));
      items.push(buildListItem(entity, d, attendees));
    }
    return { items, total: win.total, limit, offset };
  }
  async get(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== CAL) {
      throw new Error(`meeting ${params.id} not found`);
    }
    const { entity, facets, links } = detail;
    const d = facets.find((f) => f.schema_id === CAL_DETAILS)?.data ?? {};
    const attendees = await enrichAttendees(this.graph, parseAttendees(d, entity.id));
    const { date, time } = formatDateTime(str(d, "starts_at") ?? undefined, str(d, "ends_at") ?? undefined);
    const facetSummaries = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data
    }));
    const linked_entities = [];
    if (links.length > 0) {
      const neighbourId = (l) => l.from_id === entity.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const l of links) {
        const t = byId.get(neighbourId(l));
        if (!t)
          continue;
        linked_entities.push({
          id: t.id,
          name: t.name && t.name.length > 0 ? t.name : null,
          schema_id: t.schema_id,
          link_kind: l.kind,
          created_at: t.created_at ?? "",
          data: null
        });
      }
    }
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      title: entity.name && entity.name.length > 0 ? entity.name : "Untitled Meeting",
      date,
      time,
      starts_at: str(d, "starts_at"),
      ends_at: str(d, "ends_at"),
      location: str(d, "location"),
      description: str(d, "description"),
      conference_link: str(d, "conference_link"),
      attendees,
      canonical: {},
      facets: facetSummaries,
      linked_entities,
      created_at: entity.created_at ?? ""
    };
  }
  async search(params) {
    const query = (params.query ?? "").toLowerCase();
    const entities = await this.graph.list_entities_by_context(params.context);
    let results = entities.filter((e) => e.schema_id === EVENT).filter((e) => query.length === 0 ? true : e.name.toLowerCase().includes(query)).map((e) => ({
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
    if (params.limit !== undefined && results.length > params.limit) {
      results = results.slice(0, params.limit);
    }
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
  async create(params) {
    if (!params.title || params.title.trim().length === 0) {
      throw new Error("title must be a non-empty string");
    }
    const starts = parseRfc3339(params.starts_at);
    if (starts === null)
      throw new Error(`invalid starts_at: ${params.starts_at}`);
    const ends = parseRfc3339(params.ends_at);
    if (ends === null)
      throw new Error(`invalid ends_at: ${params.ends_at}`);
    if (ends < starts) {
      throw new Error("ends_at must be >= starts_at (ends_at < starts_at is rejected)");
    }
    if (params.client_id) {
      const existing = await this.graph.get_entity(params.client_id);
      if (existing)
        return this.snapshot(existing.id, params);
    }
    const now = new Date().toISOString();
    const entity = await this.graph.create_entity({
      schema_id: CAL,
      name: params.title,
      client_id: params.client_id,
      date: now
    });
    const data = {
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      attendees: normalizeAttendees(params.attendees),
      updated_at: now
    };
    if (params.description !== undefined)
      data.description = params.description;
    if (params.location !== undefined)
      data.location = params.location;
    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: CAL_DETAILS,
      data,
      confidence: 100
    });
    return this.snapshot(entity.id, params);
  }
  snapshot(id, params) {
    const snap = {
      id,
      schema_id: CAL,
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      attendees: normalizeAttendees(params.attendees)
    };
    if (params.description !== undefined)
      snap.description = params.description;
    if (params.location !== undefined)
      snap.location = params.location;
    return snap;
  }
  async ingest(params) {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    for (const env of envelopes) {
      if (!env.user_id) {
        throw new Error(`meetings ingest: envelope.user_id is required (remote_id=${env.remote_id ?? "unknown"})`);
      }
    }
    const dropped = [];
    const triggers = [];
    for (const env of envelopes) {
      if (env.kind === "delete") {
        try {
          await this.ingestDelete(env);
        } catch {
          if (env.remote_id)
            dropped.push(env.remote_id);
        }
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live")
        continue;
      if (!env.remote_id)
        continue;
      await this.ingestUpsert(env, triggers);
    }
    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }
  async ingestDelete(env) {
    if (!env.remote_id)
      return;
    const id = await this.graph.find_by_external_id(env.remote_id);
    if (id)
      await this.graph.delete_entity(id);
  }
  async ingestUpsert(env, triggers) {
    const remoteId = env.remote_id;
    if (!remoteId)
      throw new Error("meetings ingest: envelope missing remote_id");
    const payload = env.payload;
    const name = str(payload, "title") ?? "";
    const entity = {
      key: remoteId,
      schema_id: CAL,
      name,
      facets: [{ schema_id: CAL_DETAILS, data: payload, external_id: remoteId, confidence: 90 }]
    };
    const result = await this.graph.apply_batch({ entities: [entity] });
    const entityId = result.ids[remoteId];
    if (!entityId)
      return;
    if (env.kind !== "live")
      return;
    const touched = [entityId];
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
    for (const att of attendees) {
      const email = str(att, "email");
      if (!email)
        continue;
      const display = str(att, "name");
      const r = await this.rpc.execute("email.ensure_address", {
        address: email,
        display_name: display
      });
      if (r.id)
        touched.push(r.id);
    }
    triggers.push({
      type: "trigger.check",
      event_kind: "new_meeting",
      schema_id: MEETING,
      entity_id: entityId,
      phase: "live",
      touched_entity_ids: touched,
      user_id: env.user_id,
      context: { title: name.length > 0 ? name : null, remote_id: remoteId }
    });
  }
  async syncStatus() {
    return this.graph.sync_state("status");
  }
  async syncReset() {
    return this.graph.sync_state("reset", CAL);
  }
}
__decorate([
  tool("list", {
    description: "List meetings with pagination and optional search.",
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
], MeetingsModule.prototype, "list", null);
__decorate([
  tool("get", {
    description: "Get a full meeting detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], MeetingsModule.prototype, "get", null);
__decorate([
  tool("search", {
    description: "Search events by title.",
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
], MeetingsModule.prototype, "search", null);
__decorate([
  writeTool("create", {
    description: "Create a new meeting (calendar event) with title, start/end times, and optional attendees.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Meeting title (non-empty)" },
        starts_at: { type: "string", format: "date-time" },
        ends_at: { type: "string", format: "date-time" },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: ["string", "null"] },
              email: { type: "string" }
            },
            required: ["email"]
          }
        },
        description: { type: "string" },
        location: { type: "string" },
        client_id: { type: "string", format: "uuid" }
      },
      required: ["title", "starts_at", "ends_at"],
      additionalProperties: false
    }
  })
], MeetingsModule.prototype, "create", null);
__decorate([
  syncHandler("meetings")
], MeetingsModule.prototype, "ingest", null);
__decorate([
  rpc("sync.status", {
    description: "List the meetings sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], MeetingsModule.prototype, "syncStatus", null);
__decorate([
  rpc("sync.reset", {
    description: "Reset meetings sync: delete the caller's calendar events and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], MeetingsModule.prototype, "syncReset", null);

// plugins/modules/meetings/module/index.ts
definePlugin(MeetingsModule);
