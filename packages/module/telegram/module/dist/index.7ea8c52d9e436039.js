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

// plugins/modules/telegram/schema.ts
var CHAT = "telegram.chat";
var CHAT_DETAILS = "telegram.chat.details";
var MESSAGE = "telegram.message";
var MESSAGE_DETAILS = "telegram.message.details";
var PERSON = "contacts.person";
var CONTACT_FACET = "telegram.contact";
var PERSON_CHAT_LINK = "person:telegram.chat";

// plugins/modules/telegram/module/helpers.ts
var INGEST_CHUNK = 200;
var CHAT_BATCH_THRESHOLD = 50;
var INDEXING_THRESHOLD = 100;
var str = (d, k) => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};
var num = (d, k) => typeof d[k] === "number" ? d[k] : null;
var boolFlag = (d, k) => {
  const v = d[k];
  if (typeof v === "boolean")
    return v;
  if (typeof v === "number")
    return v !== 0;
  return null;
};
var chatIdStr = (d) => {
  const v = d.chat_id;
  if (typeof v === "number")
    return String(v);
  if (typeof v === "string")
    return v;
  return "";
};
var chatIdOrNull = (d) => {
  const s = chatIdStr(d);
  return s.length > 0 ? s : null;
};
var URL_RE = /https?:\/\/[^\s<>"']+/g;
function extractUrls(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    out.push(m[0].replace(/[.,;:!?)\]}>"']+$/, ""));
  }
  return out;
}
function mediaTypeToMime(mediaType) {
  switch (mediaType) {
    case "photo":
      return "image/jpeg";
    case "voice":
      return "audio/ogg";
    case "video":
    case "video_note":
    case "animation":
      return "video/mp4";
    case "sticker":
      return "image/webp";
    case "audio":
      return "audio/mpeg";
    case "document":
    default:
      return "application/octet-stream";
  }
}

// plugins/modules/telegram/module/batchSend.ts
async function runBatchSend(items, send) {
  const results = [];
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const r = await send(item);
      sent++;
      results.push({ chat_id: item.chat_id, status: "sent", id: r.id ?? null });
    } catch (e) {
      failed++;
      results.push({
        chat_id: item.chat_id,
        status: "failed",
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return { results, total: items.length, sent, failed };
}

// plugins/modules/telegram/module/service.ts
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

class TelegramModule {
  graph;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }
  async detailsFacet(entityId, schema) {
    const facets = await this.graph.list_facets_for_entity(entityId);
    const f = facets.find((x) => x.schema_id === schema);
    return f?.data ?? null;
  }
  buildChatItem(entity, d) {
    const avatar = str(d, "avatar_url") ?? str(d, "photo_url");
    return {
      schema_id: CHAT,
      entity_id: entity.id,
      chat_id: chatIdStr(d),
      chat_title: str(d, "title"),
      last_message: str(d, "last_message_preview"),
      last_message_time: typeof d.last_message_date === "string" ? d.last_message_date : null,
      last_message_sender: str(d, "last_sender_name"),
      is_outgoing: null,
      message_count: null,
      avatar_url: avatar,
      is_pinned: boolFlag(d, "is_pinned") ?? false,
      pin_order: num(d, "pin_order"),
      is_indexed: boolFlag(d, "is_indexed")
    };
  }
  async chatsList(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search) {
      return this.searchChats(search, limit, offset);
    }
    const page = await this.graph.list_entities_window({
      schema: CHAT,
      facet_schema: CHAT_DETAILS,
      order: [
        { field: { facet_schema: CHAT_DETAILS, facet_path: "is_pinned" }, desc: true },
        { field: { facet_schema: CHAT_DETAILS, facet_path: "pin_order" }, desc: false },
        { field: { facet_schema: CHAT_DETAILS, facet_path: "last_message_date" }, desc: true }
      ],
      limit,
      offset
    });
    const items = page.items.map(({ entity, data }) => this.buildChatItem(entity, data ?? {}));
    return { items, total: page.total, limit, offset };
  }
  async searchChats(query, limit, offset) {
    const matches = await this.graph.search_entities_by_name({
      query,
      schema_ids: [CHAT],
      limit: limit + offset
    });
    const total = matches.length;
    const page = matches.slice(offset, offset + limit);
    const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
    const detailsByEntity = new Map;
    for (const f of facets) {
      if (f.schema_id === CHAT_DETAILS && f.entity_id && !detailsByEntity.has(f.entity_id)) {
        detailsByEntity.set(f.entity_id, f.data);
      }
    }
    const items = [];
    for (const e of page) {
      const d = detailsByEntity.get(e.id);
      if (d)
        items.push(this.buildChatItem(e, d));
    }
    return { items, total, limit, offset };
  }
  async messagesList(params) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 50);
    const offset = params.offset ?? 0;
    let chatId = params.chat_id !== undefined ? String(params.chat_id) : null;
    if (chatId === null && params.entity_id) {
      const d = await this.detailsFacet(params.entity_id, CHAT_DETAILS);
      if (d)
        chatId = chatIdStr(d) || null;
    }
    if (chatId !== null) {
      return this.messagesForChat(chatId, limit, offset);
    }
    const page = await this.graph.list_entities({ schema_id: MESSAGE, limit, offset });
    const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
    const byId = new Map;
    for (const f of facets) {
      if (f.schema_id === MESSAGE_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
        byId.set(f.entity_id, f.data);
      }
    }
    const items = page.items.map((e) => this.buildMessageItem(e, byId.get(e.id) ?? {}));
    return { items, total: page.total, limit, offset };
  }
  async messagesForChat(chatId, limit, offset) {
    const page = await this.graph.list_entities_window({
      schema: MESSAGE,
      facet_schema: MESSAGE_DETAILS,
      filter_field: { entity_field: "idx" },
      filter_eq: chatId,
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset
    });
    const items = page.items.map(({ entity, data }) => this.buildMessageItem(entity, data ?? {}));
    return { items, total: page.total, limit, offset };
  }
  buildMessageItem(entity, d) {
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      preview: null,
      channel: "telegram",
      timestamp: typeof d.date === "string" ? d.date : created,
      created_at: created,
      metadata: d
    };
  }
  async messagesGet(params) {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== MESSAGE) {
      throw new Error(`${MESSAGE} ${params.id} not found`);
    }
    const { entity, facets } = detail;
    const d = facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data ?? {};
    const facetSummaries = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data
    }));
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      body: str(d, "text"),
      channel: "telegram",
      timestamp: typeof d.date === "string" ? d.date : created,
      canonical: {},
      facets: facetSummaries,
      linked_entities: [],
      created_at: created,
      metadata: d
    };
  }
  async chatsSetIndexed(params) {
    const found = await this.graph.list_entities_by_facet_field({
      entity_schema: CHAT,
      facet_schema: CHAT_DETAILS,
      field_path: "$.chat_id",
      field_value: String(params.chat_id),
      limit: 1,
      offset: 0
    });
    const entity = found.items.at(0);
    if (!entity)
      throw new Error(`chat ${String(params.chat_id)} not found`);
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const chatFacet = facets.find((f) => f.schema_id === CHAT_DETAILS);
    if (!chatFacet)
      throw new Error(`chat ${String(params.chat_id)} has no ${CHAT_DETAILS} facet`);
    const existing = chatFacet.data ?? {};
    await this.graph.update_facet({
      facet_id: chatFacet.id,
      schema_id: CHAT_DETAILS,
      data: { ...existing, is_indexed: params.is_indexed }
    });
    return { status: "ok" };
  }
  async syncStatus() {
    return this.graph.sync_state("status");
  }
  async syncReset() {
    return this.graph.sync_state("reset", MESSAGE);
  }
  async composerRead() {
    return this.graph.composer("read");
  }
  async composerSetText(params) {
    return this.graph.composer("set_text", params.thread_key, params.text);
  }
  async composerAppendText(params) {
    return this.graph.composer("append_text", params.thread_key, params.text);
  }
  async ingest(params) {
    if (params.backfill_priority) {
      return this.backfillPriority(params.backfill_priority.chat_ids ?? []);
    }
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped = [];
    const triggers = [];
    const chats = [];
    const messages = [];
    for (const env of envelopes) {
      const kind = env.kind;
      if (kind === "delete") {
        try {
          await this.ingestDelete(env);
        } catch {
          if (env.remote_id)
            dropped.push(env.remote_id);
        }
        continue;
      }
      if (kind !== "snapshot" && kind !== "live")
        continue;
      const payload = env.payload;
      const entityType = typeof payload.entity_type === "string" ? payload.entity_type : "message";
      if (entityType === "chat" || entityType === "telegram_chat")
        chats.push({ env, payload });
      else
        messages.push({ env, payload });
    }
    if (chats.length > CHAT_BATCH_THRESHOLD) {
      await this.ingestChatBatch(chats);
    } else {
      for (const { env, payload } of chats) {
        try {
          await this.ingestChat(env, payload);
        } catch {
          if (env.remote_id)
            dropped.push(env.remote_id);
        }
      }
    }
    for (let i = 0;i < messages.length; i += INGEST_CHUNK) {
      await this.ingestMessageBatch(messages.slice(i, i + INGEST_CHUNK), triggers);
      await Promise.resolve();
    }
    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }
  async ingestChatBatch(chats) {
    for (let i = 0;i < chats.length; i += INGEST_CHUNK) {
      const entities = [];
      for (const { env, payload } of chats.slice(i, i + INGEST_CHUNK)) {
        const remoteId = env.remote_id;
        if (!remoteId)
          continue;
        const details = { ...payload };
        delete details.entity_type;
        entities.push({
          key: remoteId,
          schema_id: CHAT,
          name: typeof payload.title === "string" ? payload.title : "",
          facets: [{ schema_id: CHAT_DETAILS, data: details, external_id: remoteId, confidence: 100 }]
        });
      }
      if (entities.length > 0) {
        await this.graph.apply_batch({ entities, refs: [], links: [] });
      }
      await Promise.resolve();
    }
  }
  async ingestMessageBatch(messages, triggers) {
    const chatEntityId = new Map;
    const chatDetails = new Map;
    for (const { payload } of messages) {
      const cid = chatIdOrNull(payload);
      if (cid === null)
        continue;
      const key = cid;
      if (chatEntityId.has(key))
        continue;
      const eid = await this.graph.find_by_external_id(`tg:chat:${key}`);
      chatEntityId.set(key, eid);
      chatDetails.set(key, eid ? await this.detailsFacet(eid, CHAT_DETAILS) : null);
    }
    const senderExists = new Map;
    for (const { payload } of messages) {
      const sid = payload.sender_id;
      if (typeof sid !== "number" || senderExists.has(sid))
        continue;
      senderExists.set(sid, await this.graph.find_by_external_id(`tg:user:${String(sid)}`) !== null);
    }
    const entities = [];
    const refs = [];
    const links = [];
    const refKeys = new Set;
    const personEntityKeys = new Set;
    const linkSeen = new Set;
    const addRef = (key, ext) => {
      if (!refKeys.has(key) && !personEntityKeys.has(key)) {
        refs.push({ key, external_id: ext });
        refKeys.add(key);
      }
    };
    const addLink = (from_key, to_key, kind) => {
      const k = `${from_key}\x00${to_key}\x00${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind });
        linkSeen.add(k);
      }
    };
    for (const { env, payload } of messages) {
      const remoteId = env.remote_id;
      if (!remoteId)
        continue;
      const text = str(payload, "text") ?? "";
      const cid = chatIdOrNull(payload);
      const chatKey = cid !== null ? `chat:${cid}` : null;
      entities.push({
        key: remoteId,
        schema_id: MESSAGE,
        name: text.slice(0, 80),
        idx: cid ?? undefined,
        date: str(payload, "date") ?? undefined,
        facets: [{ schema_id: MESSAGE_DETAILS, data: payload, external_id: remoteId, confidence: 100 }]
      });
      if (cid !== null && chatKey) {
        addRef(chatKey, `tg:chat:${cid}`);
        addLink(remoteId, chatKey, "telegram.message:telegram.chat");
      }
      const sid = payload.sender_id;
      if (typeof sid === "number") {
        const personKey = `user:${String(sid)}`;
        const userExt = `tg:user:${String(sid)}`;
        const details = cid !== null ? chatDetails.get(cid) ?? null : null;
        const exists = senderExists.get(sid) ?? false;
        let linkPerson = false;
        if (exists) {
          addRef(personKey, userExt);
          linkPerson = true;
        } else if (this.shouldIndex(details) && str(payload, "sender_name")) {
          if (!personEntityKeys.has(personKey)) {
            const chatType = details ? str(details, "type") : null;
            entities.push({
              key: personKey,
              schema_id: PERSON,
              name: str(payload, "sender_name") ?? "",
              facets: [
                {
                  schema_id: CONTACT_FACET,
                  data: this.buildContactData(sid, payload, chatType),
                  external_id: userExt,
                  confidence: 90
                }
              ]
            });
            personEntityKeys.add(personKey);
          }
          linkPerson = true;
        }
        if (linkPerson) {
          addLink(remoteId, personKey, "telegram.message:person");
          if (chatKey)
            addLink(personKey, chatKey, PERSON_CHAT_LINK);
        }
      }
    }
    const result = await this.graph.apply_batch({ entities, refs, links });
    const newestPerChat = new Map;
    for (const { env, payload } of messages) {
      const remoteId = env.remote_id;
      if (!remoteId)
        continue;
      const entityId = result.ids[remoteId];
      if (!entityId)
        continue;
      const msgText = str(payload, "text") ?? "";
      for (const url of extractUrls(msgText)) {
        await this.graph.web_register({ url, parent_entity_id: entityId, link_kind: "references" });
      }
      const mediaType = str(payload, "media_type");
      const mChatId = num(payload, "chat_id");
      const mMessageId = num(payload, "message_id");
      if (mediaType && payload.source_ref !== null && payload.source_ref !== undefined && mChatId !== null && mMessageId !== null) {
        const fileChatDetails = chatDetails.get(String(mChatId)) ?? null;
        await this.graph.file_register({
          external_id: `file:telegram:${String(mChatId)}:${String(mMessageId)}`,
          parent_external_id: remoteId,
          link_kind: "telegram.message:file",
          name: str(payload, "file_name") ?? undefined,
          mime_type: mediaTypeToMime(mediaType),
          source_ref: payload.source_ref,
          source_module: env.source_id,
          source_surface: "telegram",
          download: this.shouldIndex(fileChatDetails)
        });
      }
      const cid = chatIdOrNull(payload);
      if (cid !== null) {
        const key = cid;
        const cur = newestPerChat.get(key);
        if (!cur || (str(payload, "date") ?? "") >= (str(cur, "date") ?? "")) {
          newestPerChat.set(key, payload);
        }
      }
      if (env.kind === "live") {
        const touched = [entityId];
        if (cid !== null) {
          const ck = result.ids[`chat:${cid}`];
          if (ck)
            touched.push(ck);
        }
        const sid = payload.sender_id;
        if (typeof sid === "number") {
          const pk = result.ids[`user:${String(sid)}`];
          if (pk)
            touched.push(pk);
        }
        triggers.push({
          type: "trigger.check",
          event_kind: "new_message",
          schema_id: MESSAGE,
          entity_id: entityId,
          phase: "live",
          touched_entity_ids: touched,
          user_id: env.user_id,
          context: { text: str(payload, "text") ?? "", sender_name: str(payload, "sender_name") ?? "" }
        });
      }
    }
    for (const [key, msg] of newestPerChat) {
      const base = chatDetails.get(key);
      const eid = chatEntityId.get(key);
      if (!base || !eid)
        continue;
      const msgDate = str(msg, "date") ?? "";
      if (!msgDate)
        continue;
      const curDate = str(base, "last_message_date") ?? "";
      if (curDate && msgDate < curDate)
        continue;
      await this.graph.attach_facet({
        entity_id: eid,
        schema_id: CHAT_DETAILS,
        data: {
          ...base,
          last_message_date: msgDate,
          last_message_preview: str(msg, "text") ?? "",
          last_sender_name: str(msg, "sender_name") ?? ""
        },
        external_id: `tg:chat:${key}`,
        confidence: 100
      });
    }
  }
  buildContactData(senderId, payload, chatType) {
    const tier = chatType === "private" ? "inner" : "group";
    const info = payload.sender_info && typeof payload.sender_info === "object" ? payload.sender_info : {};
    const data = {
      telegram_user_id: senderId,
      relevance_tier: tier,
      first_name: str(info, "first_name") ?? str(payload, "sender_name") ?? ""
    };
    const lastName = str(info, "last_name");
    const username = str(info, "username");
    const phone = str(info, "phone");
    if (lastName)
      data.last_name = lastName;
    if (username)
      data.username = username;
    if (phone)
      data.phone = phone;
    return data;
  }
  async ingestDelete(envelope) {
    const remoteId = envelope.remote_id;
    if (!remoteId)
      return;
    const entityId = await this.graph.find_by_external_id(remoteId);
    if (entityId)
      await this.graph.delete_entity(entityId);
  }
  async ingestChat(envelope, payload) {
    const remoteId = envelope.remote_id;
    if (!remoteId)
      return;
    let entityId = await this.graph.find_by_external_id(remoteId);
    const existing = entityId ? await this.detailsFacet(entityId, CHAT_DETAILS) : null;
    if (!entityId) {
      const title = typeof payload.title === "string" ? payload.title : "";
      const created = await this.graph.create_entity({ schema_id: CHAT, name: title });
      entityId = created.id;
    }
    const details = { ...payload };
    delete details.entity_type;
    if (existing) {
      for (const k of ["last_message_date", "last_message_preview", "last_sender_name"]) {
        const ev = existing[k];
        if (ev !== null && ev !== undefined && (details[k] === null || details[k] === undefined)) {
          details[k] = ev;
        }
      }
    }
    await this.graph.attach_facet({
      entity_id: entityId,
      schema_id: CHAT_DETAILS,
      data: details,
      external_id: remoteId,
      confidence: 100
    });
  }
  async ingestMessage(envelope, payload) {
    const remoteId = envelope.remote_id;
    if (!remoteId)
      return null;
    let entityId = await this.graph.find_by_external_id(remoteId);
    const createdFresh = entityId === null;
    if (!entityId) {
      const text = typeof payload.text === "string" ? payload.text : "";
      const name = text.slice(0, 80);
      const idx = chatIdOrNull(payload) ?? undefined;
      const date = typeof payload.date === "string" ? payload.date : undefined;
      const created = await this.graph.create_entity({ schema_id: MESSAGE, name, idx, date });
      entityId = created.id;
    }
    try {
      await this.graph.attach_facet({
        entity_id: entityId,
        schema_id: MESSAGE_DETAILS,
        data: payload,
        external_id: remoteId,
        confidence: 100
      });
    } catch (err) {
      if (createdFresh) {
        await this.graph.delete_entity(entityId).catch(() => {
          return;
        });
      }
      throw err;
    }
    const msgText = typeof payload.text === "string" ? payload.text : "";
    for (const url of extractUrls(msgText)) {
      await this.graph.web_register({ url, parent_entity_id: entityId, link_kind: "references" });
    }
    const mediaType = str(payload, "media_type");
    const mChatId = num(payload, "chat_id");
    const mMessageId = num(payload, "message_id");
    if (mediaType && payload.source_ref !== null && payload.source_ref !== undefined && mChatId !== null && mMessageId !== null) {
      await this.graph.file_register({
        external_id: `file:telegram:${String(mChatId)}:${String(mMessageId)}`,
        parent_external_id: remoteId,
        link_kind: "telegram.message:file",
        name: str(payload, "file_name") ?? undefined,
        mime_type: mediaTypeToMime(mediaType),
        source_ref: payload.source_ref,
        source_module: envelope.source_id,
        source_surface: "telegram"
      });
    }
    let chatEntityId = null;
    let chatDetails = null;
    const chatId = chatIdOrNull(payload);
    if (chatId !== null) {
      chatEntityId = await this.graph.find_by_external_id(`tg:chat:${chatId}`);
      if (chatEntityId) {
        await this.graph.add_link({
          from_id: entityId,
          to_id: chatEntityId,
          kind: "telegram.message:telegram.chat"
        });
        chatDetails = await this.detailsFacet(chatEntityId, CHAT_DETAILS);
        await this.denormalizeChatLastMessage(chatEntityId, chatDetails, payload);
      }
    }
    let personId = null;
    const senderId = payload.sender_id;
    if (typeof senderId === "number") {
      personId = await this.ingestSenderContact(entityId, senderId, payload, chatEntityId, chatDetails);
    }
    return { entityId, chatEntityId, personId };
  }
  async denormalizeChatLastMessage(chatEntityId, chatDetails, msg) {
    if (!chatDetails)
      return;
    const msgDate = str(msg, "date") ?? "";
    if (!msgDate)
      return;
    const curDate = str(chatDetails, "last_message_date") ?? "";
    if (curDate && msgDate < curDate)
      return;
    const chatId = num(msg, "chat_id");
    if (chatId === null)
      return;
    await this.graph.attach_facet({
      entity_id: chatEntityId,
      schema_id: CHAT_DETAILS,
      data: {
        ...chatDetails,
        last_message_date: msgDate,
        last_message_preview: str(msg, "text") ?? "",
        last_sender_name: str(msg, "sender_name") ?? ""
      },
      external_id: `tg:chat:${String(chatId)}`,
      confidence: 100
    });
  }
  async backfillPriority(chatIds) {
    if (chatIds.length === 0)
      return { priority: [] };
    const want = new Set(chatIds);
    const page = await this.graph.list_entities_window({
      schema: CHAT,
      facet_schema: CHAT_DETAILS,
      limit: 1e6,
      offset: 0
    });
    const priority = [];
    for (const { data } of page.items) {
      const d = data ?? {};
      const cid = chatIdStr(d);
      if (!cid || !want.has(cid))
        continue;
      if (boolFlag(d, "is_pinned") === true || this.shouldIndex(d))
        priority.push(cid);
    }
    return { priority };
  }
  shouldIndex(chatDetails) {
    if (!chatDetails)
      return true;
    const forced = boolFlag(chatDetails, "is_indexed");
    if (forced !== null)
      return forced;
    const type = str(chatDetails, "type") ?? "";
    if (type === "private")
      return true;
    const memberCount = num(chatDetails, "member_count");
    return memberCount !== null && memberCount <= INDEXING_THRESHOLD;
  }
  async ingestSenderContact(messageEntityId, senderId, payload, chatEntityId, chatDetails) {
    const userExt = `tg:user:${String(senderId)}`;
    const chatType = chatDetails ? str(chatDetails, "type") : null;
    const tier = chatType === "private" ? "inner" : "group";
    let personId = await this.graph.find_by_external_id(userExt);
    if (!personId) {
      if (!this.shouldIndex(chatDetails))
        return null;
      const senderName = str(payload, "sender_name");
      if (!senderName)
        return null;
      const info = payload.sender_info && typeof payload.sender_info === "object" ? payload.sender_info : {};
      const firstName = str(info, "first_name") ?? senderName;
      const person = await this.graph.create_entity({ schema_id: PERSON, name: senderName });
      personId = person.id;
      const contactData = {
        telegram_user_id: senderId,
        relevance_tier: tier,
        first_name: firstName
      };
      const lastName = str(info, "last_name");
      const username = str(info, "username");
      const phone = str(info, "phone");
      if (lastName)
        contactData.last_name = lastName;
      if (username)
        contactData.username = username;
      if (phone)
        contactData.phone = phone;
      await this.graph.attach_facet({
        entity_id: personId,
        schema_id: CONTACT_FACET,
        data: contactData,
        external_id: userExt,
        confidence: 90
      });
    }
    await this.graph.add_link({
      from_id: messageEntityId,
      to_id: personId,
      kind: "telegram.message:person"
    });
    if (chatEntityId) {
      const links = await this.graph.list_links_for_entity(personId);
      const already = links.some((l) => l.to_id === chatEntityId && l.kind === PERSON_CHAT_LINK);
      if (!already) {
        await this.graph.add_link({
          from_id: personId,
          to_id: chatEntityId,
          kind: PERSON_CHAT_LINK
        });
      }
    }
    return personId;
  }
  async messagesSend(params) {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }
  async messagesReply(params) {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }
  async messagesBatchSend(params) {
    const all = params.messages;
    if (all.length === 0 || all.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(all.length)}`);
    }
    const excluded = new Set(params.excluded_indices ?? []);
    const messages = all.filter((_, i) => !excluded.has(i));
    messages.forEach((m, i) => {
      const cid = m.chat_id;
      if (cid === null || cid === undefined || String(cid).length === 0) {
        throw new Error(`message[${String(i)}]: missing chat_id`);
      }
      if (!m.text)
        throw new Error(`message[${String(i)}]: missing text`);
    });
    if (messages.length === 0) {
      return { results: [], total: 0, sent: 0, failed: 0 };
    }
    const outcome = await runBatchSend(messages, (m) => this.sendMessage(m.chat_id, m.text, m.reply_to_message_id, params.account_id));
    return { ...outcome };
  }
  async sendMessage(chatId, text, replyTo, accountId) {
    const payload = { action: "send_message", chat_id: chatId, text };
    if (replyTo !== undefined)
      payload.reply_to_message_id = replyTo;
    const result = await this.graph.source_command(payload, accountId);
    try {
      const messageId = typeof result.message_id === "number" ? result.message_id : 0;
      const remoteId = `tg:msg:${String(chatId)}:${String(messageId)}`;
      const sentPayload = {
        message_id: messageId,
        chat_id: chatId,
        text,
        date: new Date().toISOString(),
        is_outgoing: true,
        sender_name: "You"
      };
      await this.ingestMessage(this.syntheticEnvelope(remoteId, sentPayload, accountId), sentPayload);
      const entityId = await this.graph.find_by_external_id(remoteId);
      return entityId ? { ...result, id: entityId } : result;
    } catch {
      return result;
    }
  }
  async messagesBackfill(params) {
    const payload = {
      action: "backfill_chat",
      chat_id: params.chat_id,
      before_message_id: params.before_message_id ?? 0,
      limit: params.limit ?? 50
    };
    await this.graph.request_backfill(payload, params.account_id);
    return { count: 0, skipped: 0, pending: true };
  }
  async setTrigger(params) {
    const chatExt = `tg:chat:${String(params.chat_id)}`;
    const chatEntityId = await this.graph.find_by_external_id(chatExt);
    if (!chatEntityId) {
      throw new Error(`Telegram chat ${String(params.chat_id)} not found. Sync messages first.`);
    }
    return this.rpc.execute("triggers.create", {
      name: `Telegram trigger: chat ${String(params.chat_id)}`,
      watch_entity_ids: [chatEntityId],
      gate_prompt: params.gate_prompt,
      action_prompt: params.action_prompt,
      schema_filter: "telegram",
      debounce_seconds: params.debounce_seconds ?? 0,
      episode_id: params.episode_id ?? null
    });
  }
  syntheticEnvelope(remoteId, payload, accountId) {
    return {
      source_id: "telegram",
      surface: "telegram",
      account_id: accountId ?? "default",
      user_id: "",
      kind: "live",
      remote_id: remoteId,
      payload,
      timestamp: ""
    };
  }
}
__decorate([
  tool("chats.list", {
    description: "List telegram chats (pinned first, then by last-message time desc). Optional name search.",
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
], TelegramModule.prototype, "chatsList", null);
__decorate([
  tool("messages.list", {
    description: "List telegram messages, newest first. Filter by chat_id (or entity_id of the chat); omit to list all.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        entity_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesList", null);
__decorate([
  tool("messages.get", {
    description: "Get a single telegram message detail by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesGet", null);
__decorate([
  rpc("chats.set_indexed", {
    description: "Mark a telegram chat indexed/unindexed (controls message indexing for search).",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        is_indexed: { type: "boolean" }
      },
      required: ["chat_id", "is_indexed"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "chatsSetIndexed", null);
__decorate([
  rpc("sync.status", {
    description: "List the telegram sync state per account.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], TelegramModule.prototype, "syncStatus", null);
__decorate([
  rpc("sync.reset", {
    description: "Reset telegram sync: delete the caller's telegram messages and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], TelegramModule.prototype, "syncReset", null);
__decorate([
  rpc("composer.read", {
    description: "Read the telegram reply-composer presence for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], TelegramModule.prototype, "composerRead", null);
__decorate([
  rpc("composer.set_text", {
    description: "Replace the telegram reply-composer text for a thread.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "composerSetText", null);
__decorate([
  rpc("composer.append_text", {
    description: "Append to the telegram reply-composer text for a thread.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "composerAppendText", null);
__decorate([
  syncHandler("telegram")
], TelegramModule.prototype, "ingest", null);
__decorate([
  writeTool("messages.send", {
    description: "Send a Telegram message to a chat. May require approval before execution.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        text: { type: "string" },
        reply_to_message_id: { type: "integer" },
        account_id: { type: "string" }
      },
      required: ["chat_id", "text"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesSend", null);
__decorate([
  writeTool("messages.reply", {
    description: "Reply to a specific Telegram message in a chat. May require approval before execution.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        reply_to_message_id: { type: "integer" },
        text: { type: "string" },
        account_id: { type: "string" }
      },
      required: ["chat_id", "reply_to_message_id", "text"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesReply", null);
__decorate([
  writeTool("batch_send", {
    description: `Send Telegram messages to multiple recipients in one batch (1..50). Each message needs chat_id and text; reply_to_message_id is optional. ALWAYS include chat_name — the recipient's human display name (e.g. "Dylan Dewdney") — so the approval card shows who each message goes to instead of a raw chat_id. Use this for multi-recipient outreach so the user reviews ONE approval instead of N separate sends. Returns per-recipient results.`,
    params: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              chat_id: { type: ["integer", "string"] },
              text: { type: "string" },
              reply_to_message_id: { type: "integer" },
              chat_name: { type: "string" }
            },
            required: ["chat_id", "text"],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 50
        },
        account_id: { type: "string" }
      },
      required: ["messages"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesBatchSend", null);
__decorate([
  rpc("messages.backfill", {
    description: "Fetch older messages for a telegram chat (backward pagination).",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        before_message_id: { type: "integer" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        account_id: { type: "string" }
      },
      required: ["chat_id"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "messagesBackfill", null);
__decorate([
  writeTool("set_trigger", {
    description: "Set up an automated reaction to incoming Telegram messages in a chat. When a matching message arrives, the action executes automatically.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: "integer", description: "Telegram chat ID to watch" },
        gate_prompt: { type: "string", description: "Condition to check on incoming message" },
        action_prompt: { type: "string", description: "What to do when the condition matches" },
        debounce_seconds: { type: "integer", description: "0=immediate (default), >0=batch within window" },
        episode_id: { type: "string", format: "uuid", description: "Parent episode for context" }
      },
      required: ["chat_id", "gate_prompt", "action_prompt"],
      additionalProperties: false
    }
  })
], TelegramModule.prototype, "setTrigger", null);

// plugins/modules/telegram/module/index.ts
definePlugin(TelegramModule);
