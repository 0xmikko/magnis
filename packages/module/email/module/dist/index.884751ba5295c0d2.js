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

// plugins/modules/email/module/helpers.ts
var INGEST_CHUNK = 200;
var OUTGOING_FROM = "user@magnis.local";
var str = (d, k) => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};
function lowerAddr(s) {
  if (!s)
    return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
}
function splitRecipients(csv) {
  if (!csv)
    return [];
  const out = [];
  const seen = new Set;
  for (const part of csv.split(",")) {
    const a = part.trim().toLowerCase();
    if (a.length > 0 && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}
function recipientsOf(p) {
  const set = new Set;
  for (const field of ["to_addresses", "cc_addresses", "bcc_addresses"]) {
    for (const r of splitRecipients(str(p, field)))
      set.add(r);
  }
  return [...set];
}
function addressesOf(p) {
  const set = new Set(recipientsOf(p));
  const from = lowerAddr(str(p, "from_address"));
  if (from)
    set.add(from);
  return [...set];
}
function destSubpath(account, remote, attId, filename) {
  const san = (s) => s.replace(/[^A-Za-z0-9._-]/g, "_");
  return `gmail/${san(account)}/${san(remote)}/${san(attId)}_${san(filename)}`;
}
function senderOf(d) {
  return str(d, "from_name") ?? str(d, "from_address");
}
function previewOf(d) {
  return str(d, "snippet") ?? str(d, "body_text");
}
function stripBodyHtml(d) {
  const { body_html: _omit, ...rest } = d;
  return rest;
}
function buildListItem(entity, d) {
  const created = entity.created_at ?? "";
  return {
    id: entity.id,
    schema_id: entity.schema_id,
    sender: senderOf(d),
    subject: entity.name && entity.name.length > 0 ? entity.name : null,
    preview: previewOf(d),
    channel: "email",
    timestamp: str(d, "sent_at") ?? created,
    created_at: created,
    metadata: stripBodyHtml(d)
  };
}

// plugins/modules/email/schema.ts
var MESSAGE_SCHEMA = "email.message";
var MESSAGE_DETAILS = "email.message.details";
var ADDRESS_SCHEMA = "email.address";
var ADDRESS_DETAILS = "email.address.details";

// plugins/modules/email/module/service.ts
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

class EmailModule {
  graph;
  rpc;
  constructor(deps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }
  async emailList(params) {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search.length > 0) {
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [MESSAGE_SCHEMA],
        limit: limit + offset
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const byId = new Map;
      for (const f of facets) {
        if (f.schema_id === MESSAGE_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
          byId.set(f.entity_id, f.data);
        }
      }
      const items2 = page.map((e) => buildListItem(e, byId.get(e.id) ?? {}));
      return { items: items2, total, limit, offset };
    }
    const win = await this.graph.list_entities_window({
      schema: MESSAGE_SCHEMA,
      facet_schema: MESSAGE_DETAILS,
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset
    });
    const items = win.items.map(({ entity, data }) => buildListItem(entity, data ?? {}));
    return { items, total: win.total, limit, offset };
  }
  async emailGet(params) {
    const view = await this.getDetail(params.id);
    if (!view)
      throw new Error(`${MESSAGE_SCHEMA} ${params.id} not found`);
    return view;
  }
  async emailBatch(params) {
    const views = [];
    for (const id of params.ids) {
      const view = await this.getDetail(id);
      if (view)
        views.push(view);
    }
    return views;
  }
  async getDetail(id) {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (detail?.entity.schema_id !== MESSAGE_SCHEMA)
      return null;
    const { entity, facets, links } = detail;
    const d = facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data ?? {};
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
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: senderOf(d),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      body: str(d, "body_text"),
      channel: "email",
      timestamp: str(d, "sent_at") ?? created,
      canonical: {},
      facets: facetSummaries,
      linked_entities,
      created_at: created,
      metadata: d
    };
  }
  async ingest(params) {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped = [];
    const triggers = [];
    const messages = [];
    for (const env of envelopes) {
      if (!env.user_id)
        continue;
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
      messages.push(env);
    }
    let chunk = [];
    let chunkAddrs = new Set;
    const flush = async () => {
      if (chunk.length > 0) {
        await this.ingestMessageBatch(chunk, triggers);
        await Promise.resolve();
      }
      chunk = [];
      chunkAddrs = new Set;
    };
    for (const env of messages) {
      const addrs = addressesOf(env.payload);
      const fresh = addrs.filter((a) => !chunkAddrs.has(a));
      if (chunk.length > 0 && chunk.length + 1 + chunkAddrs.size + fresh.length > INGEST_CHUNK) {
        await flush();
      }
      chunk.push(env);
      for (const a of addrs)
        chunkAddrs.add(a);
    }
    await flush();
    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }
  async ingestDelete(env) {
    if (!env.remote_id)
      return;
    const id = await this.graph.find_by_external_id(env.remote_id);
    if (id)
      await this.graph.delete_entity(id);
  }
  async ingestMessageBatch(messages, triggers) {
    const entities = [];
    const links = [];
    const addrSeen = new Set;
    const linkSeen = new Set;
    const addAddress = (lower, displayName) => {
      const key = `addr:${lower}`;
      if (!addrSeen.has(key)) {
        const data = { address: lower };
        if (displayName)
          data.display_name = displayName;
        entities.push({
          key,
          schema_id: ADDRESS_SCHEMA,
          name: lower,
          idx: lower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data, external_id: `email:address:${lower}`, confidence: 100 }
          ]
        });
        addrSeen.add(key);
      }
      return key;
    };
    const addLink = (from_key, to_key, kind) => {
      const k = `${from_key} ${to_key} ${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind });
        linkSeen.add(k);
      }
    };
    for (const env of messages) {
      const remoteId = env.remote_id;
      if (!remoteId)
        continue;
      const p = env.payload;
      entities.push({
        key: remoteId,
        schema_id: MESSAGE_SCHEMA,
        name: str(p, "subject") ?? "",
        idx: str(p, "thread_id") ?? undefined,
        date: str(p, "sent_at") ?? undefined,
        facets: [{ schema_id: MESSAGE_DETAILS, data: p, external_id: remoteId, confidence: 90 }]
      });
      const from = lowerAddr(str(p, "from_address"));
      if (from)
        addLink(remoteId, addAddress(from, str(p, "from_name")), "sent_from");
      for (const r of recipientsOf(p)) {
        addLink(remoteId, addAddress(r, null), "sent_to");
      }
    }
    const result = await this.graph.apply_batch({ entities, refs: [], links });
    for (const env of messages) {
      const remoteId = env.remote_id;
      if (!remoteId)
        continue;
      const entityId = result.ids[remoteId];
      if (!entityId)
        continue;
      const p = env.payload;
      const attachments = Array.isArray(p.attachments) ? p.attachments : [];
      for (const att of attachments) {
        const attId = str(att, "attachment_id");
        if (!attId)
          continue;
        const filename = str(att, "filename") ?? "attachment";
        await this.graph.file_register({
          external_id: `file:gmail:${env.account_id}:${remoteId}:${attId}`,
          parent_external_id: remoteId,
          link_kind: "attachment",
          name: filename,
          mime_type: str(att, "mime_type") ?? "application/octet-stream",
          size_bytes: typeof att.size === "number" ? att.size : undefined,
          source_ref: {
            message_id: remoteId,
            attachment_id: attId,
            account_id: env.account_id,
            dest_subpath: destSubpath(env.account_id, remoteId, attId, filename)
          },
          source_module: env.source_id,
          source_surface: "email",
          download: true
        });
      }
      if (env.kind === "live") {
        const touched = [entityId];
        for (const r of recipientsOf(p)) {
          const aid = result.ids[`addr:${r}`];
          if (aid)
            touched.push(aid);
        }
        const from = lowerAddr(str(p, "from_address"));
        if (from) {
          const sid = result.ids[`addr:${from}`];
          if (sid)
            touched.push(sid);
        }
        triggers.push({
          type: "trigger.check",
          event_kind: "new_email",
          schema_id: MESSAGE_SCHEMA,
          entity_id: entityId,
          phase: "live",
          touched_entity_ids: touched,
          user_id: env.user_id,
          context: {
            from_address: str(p, "from_address"),
            from_name: str(p, "from_name"),
            subject: str(p, "subject")
          }
        });
      }
    }
  }
  async emailSend(params) {
    return this.sendSingle(params.to, params.subject, params.body_text, params.attachment_ids ?? []);
  }
  async emailReply(params) {
    const attachmentIds = params.attachment_ids ?? [];
    const detail = await this.graph.get_entity_full(params.email_id, { links: false });
    if (detail?.entity.schema_id !== MESSAGE_SCHEMA) {
      throw new Error(`Email not found: ${params.email_id}`);
    }
    const od = detail.facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data ?? {};
    const sender = str(od, "from_address");
    if (!sender) {
      throw new Error("Cannot determine recipient: email has no sender address");
    }
    const subject = str(od, "subject") ?? (detail.entity.name && detail.entity.name.length > 0 ? detail.entity.name : "(no subject)");
    const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
    const inReplyTo = str(od, "message_id");
    await this.resolveOwnedFileNames(attachmentIds);
    const result = await this.graph.source_command({
      action: "send_message",
      draft: {
        to: [{ address: sender }],
        cc: [],
        bcc: [],
        subject: replySubject,
        body_text: params.body_text,
        body_html: null,
        in_reply_to: inReplyTo
      }
    });
    for (const fid of attachmentIds) {
      await this.graph.add_link({ from_id: params.email_id, to_id: fid, kind: "attachment" });
    }
    return {
      status: "sent",
      reply_to: sender,
      subject: replySubject,
      attachment_count: attachmentIds.length,
      result
    };
  }
  async emailBatchSend(params) {
    const messages = params.messages;
    if (messages.length === 0 || messages.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(messages.length)}`);
    }
    messages.forEach((m, i) => {
      if (!m.to)
        throw new Error(`message[${String(i)}]: missing to`);
      if (!m.subject)
        throw new Error(`message[${String(i)}]: missing subject`);
      if (!m.body_text)
        throw new Error(`message[${String(i)}]: missing body_text`);
    });
    const excluded = new Set(params.excluded_indices ?? []);
    const results = [];
    let sent = 0;
    let excludedCount = 0;
    for (const [i, m] of messages.entries()) {
      if (excluded.has(i)) {
        excludedCount++;
        results.push({ id: null, to: m.to, subject: m.subject, status: "excluded", attachment_count: 0 });
        continue;
      }
      const r = await this.sendSingle(m.to, m.subject, m.body_text, m.attachment_ids ?? []);
      sent++;
      results.push({ id: r.id, to: m.to, subject: m.subject, status: "sent", attachment_count: r.attachment_count });
    }
    return { results, total: messages.length, sent, excluded: excludedCount };
  }
  async setTrigger(params) {
    const raw = [...params.from_addresses ?? []];
    if (params.from_address)
      raw.push(params.from_address);
    const addresses = [...new Set(raw.map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0))].sort();
    if (addresses.length === 0) {
      throw new Error("missing from_addresses or from_address");
    }
    const result = await this.graph.apply_batch({
      entities: addresses.map((a) => ({
        key: `addr:${a}`,
        schema_id: ADDRESS_SCHEMA,
        name: a,
        idx: a,
        facets: [
          { schema_id: ADDRESS_DETAILS, data: { address: a }, external_id: `email:address:${a}`, confidence: 100 }
        ]
      })),
      refs: [],
      links: []
    });
    const watchIds = addresses.map((a) => result.ids[`addr:${a}`]).filter((id) => Boolean(id));
    const name = addresses.length <= 3 ? `Email trigger: ${addresses.join(", ")}` : `Email trigger: ${addresses.slice(0, 3).join(", ")} +${String(addresses.length - 3)} more`;
    return this.rpc.execute("triggers.create", {
      name,
      watch_entity_ids: watchIds,
      gate_prompt: params.gate_prompt,
      action_prompt: params.action_prompt,
      schema_filter: "email",
      debounce_seconds: params.debounce_seconds ?? 0,
      episode_id: params.episode_id ?? null
    });
  }
  async syncStatus() {
    return this.graph.sync_state("status");
  }
  async syncReset() {
    return this.graph.sync_state("reset", MESSAGE_SCHEMA);
  }
  async ensureAddress(params) {
    const lower = params.address.trim().toLowerCase();
    if (lower.length === 0) {
      throw new Error("email.ensure_address: 'address' is required");
    }
    const data = { address: lower };
    if (params.display_name)
      data.display_name = params.display_name;
    const r = await this.graph.apply_batch({
      entities: [
        {
          key: "addr",
          schema_id: ADDRESS_SCHEMA,
          name: lower,
          idx: lower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data, external_id: `email:address:${lower}`, confidence: 100 }
          ]
        }
      ],
      refs: [],
      links: []
    });
    const id = r.ids.addr;
    if (!id)
      throw new Error(`email.ensure_address: failed to resolve ${lower}`);
    return { id };
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
  async composerSetAttachments(params) {
    return this.graph.composer("set_attachments", params.thread_key, undefined, params.attachment_ids);
  }
  async resolveOwnedFileNames(fileIds) {
    const names = [];
    for (const fid of fileIds) {
      const det = await this.graph.get_entity_full(fid, { links: false });
      if (!det)
        throw new Error(`file ${fid} not found`);
      const fd = det.facets.find((f) => f.schema_id === "file.details")?.data;
      if (!fd)
        throw new Error(`file ${fid} not found`);
      names.push(typeof fd.name === "string" ? fd.name : "attachment");
    }
    return names;
  }
  async sendSingle(to, subject, bodyText, attachmentIds) {
    const attachmentNames = await this.resolveOwnedFileNames(attachmentIds);
    const toLower = to.trim().toLowerCase();
    const now = new Date().toISOString();
    const facetData = {
      from_address: OUTGOING_FROM,
      to_addresses: to,
      subject,
      body_text: bodyText,
      sent_at: now,
      is_outgoing: true,
      has_attachments: attachmentIds.length > 0,
      attachment_names: attachmentNames
    };
    const msgKey = "out";
    const addrKey = `addr:${toLower}`;
    const result = await this.graph.apply_batch({
      entities: [
        {
          key: msgKey,
          schema_id: MESSAGE_SCHEMA,
          name: subject,
          date: now,
          facets: [{ schema_id: MESSAGE_DETAILS, data: facetData, confidence: 100 }]
        },
        {
          key: addrKey,
          schema_id: ADDRESS_SCHEMA,
          name: toLower,
          idx: toLower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data: { address: toLower }, external_id: `email:address:${toLower}`, confidence: 100 }
          ]
        }
      ],
      refs: [],
      links: [{ from_key: msgKey, to_key: addrKey, kind: "sent_to" }]
    });
    const entityId = result.ids[msgKey];
    if (entityId === undefined)
      throw new Error(`email.send: missing entity id for ${msgKey}`);
    for (const fid of attachmentIds) {
      await this.graph.add_link({ from_id: entityId, to_id: fid, kind: "attachment" });
    }
    try {
      await this.graph.source_command({
        action: "send_message",
        draft: {
          to: [{ address: to }],
          cc: [],
          bcc: [],
          subject,
          body_text: bodyText,
          body_html: null,
          in_reply_to: null
        }
      });
    } catch {}
    return {
      schema_id: MESSAGE_SCHEMA,
      id: entityId,
      subject,
      to,
      body_text: bodyText,
      attachment_count: attachmentIds.length,
      from_address: OUTGOING_FROM,
      sender: OUTGOING_FROM,
      sent_at: now,
      timestamp: now
    };
  }
}
__decorate([
  tool("list", {
    description: "List email messages, newest first. Optional name search.",
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
], EmailModule.prototype, "emailList", null);
__decorate([
  tool("get", {
    description: "Get a single email message detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "emailGet", null);
__decorate([
  tool("batch", {
    description: "Get multiple email message detail views by entity ids.",
    params: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string", format: "uuid" } } },
      required: ["ids"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "emailBatch", null);
__decorate([
  syncHandler("email")
], EmailModule.prototype, "ingest", null);
__decorate([
  writeTool("send", {
    description: "Send a new email to a recipient. Subject and body required. Optionally attach files by entity ID.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string" },
        body_text: { type: "string" },
        attachment_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "File entity IDs to attach"
        }
      },
      required: ["to", "subject", "body_text"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "emailSend", null);
__decorate([
  writeTool("reply", {
    description: "Reply to an email. Reads the original, threads the reply (In-Reply-To), and routes it for sending. Optionally attach files by entity ID.",
    params: {
      type: "object",
      properties: {
        email_id: { type: "string", format: "uuid", description: "Entity ID of the email to reply to" },
        body_text: { type: "string", description: "Plain text body of the reply" },
        attachment_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "File entity IDs to attach"
        }
      },
      required: ["email_id", "body_text"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "emailReply", null);
__decorate([
  writeTool("batch_send", {
    description: "Send multiple emails in one batch (1..50). Each message needs to, subject, body_text. excluded_indices skip specific messages. Returns per-message results.",
    params: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              to: { type: "string" },
              subject: { type: "string" },
              body_text: { type: "string" },
              attachment_ids: { type: "array", items: { type: "string", format: "uuid" } }
            },
            required: ["to", "subject", "body_text"],
            additionalProperties: false
          },
          minItems: 1,
          maxItems: 50
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } }
      },
      required: ["messages"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "emailBatchSend", null);
__decorate([
  writeTool("set_trigger", {
    description: "Set up an automated reaction to incoming emails. Watches one or more email addresses (OR-matching). When any watched address receives an email matching the gate, the action runs.",
    params: {
      type: "object",
      properties: {
        from_addresses: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses to watch (OR-matching: fires for ANY)"
        },
        from_address: { type: "string", description: "Single address (legacy; prefer from_addresses)" },
        gate_prompt: { type: "string", description: "Condition to check on the incoming email" },
        action_prompt: { type: "string", description: "What to do when the condition matches" },
        debounce_seconds: { type: "integer", description: "0=immediate (default for email), >0=batch" },
        episode_id: { type: "string", format: "uuid", description: "Parent episode for context" }
      },
      required: ["from_addresses", "gate_prompt", "action_prompt"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "setTrigger", null);
__decorate([
  rpc("sync.status", {
    description: "List the email sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], EmailModule.prototype, "syncStatus", null);
__decorate([
  rpc("sync.reset", {
    description: "Reset email sync: delete the caller's email messages and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], EmailModule.prototype, "syncReset", null);
__decorate([
  rpc("ensure_address", {
    description: "Find-or-create the email.address entity for an address; returns its entity id.",
    params: {
      type: "object",
      properties: { address: { type: "string" }, display_name: { type: ["string", "null"] } },
      required: ["address"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "ensureAddress", null);
__decorate([
  rpc("composer.read", {
    description: "Read the email reply-composer presence for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false }
  })
], EmailModule.prototype, "composerRead", null);
__decorate([
  rpc("composer.set_text", {
    description: "Replace the email reply-composer text for a thread. Does NOT send.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "composerSetText", null);
__decorate([
  rpc("composer.append_text", {
    description: "Append to the email reply-composer text for a thread. Does NOT send.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "composerAppendText", null);
__decorate([
  rpc("composer.set_attachments", {
    description: "Replace the email reply-composer's attachment ids for a thread. Presence-gated; does NOT send.",
    params: {
      type: "object",
      properties: {
        thread_key: { type: "string" },
        attachment_ids: { type: "array", items: { type: "string" } }
      },
      required: ["thread_key", "attachment_ids"],
      additionalProperties: false
    }
  })
], EmailModule.prototype, "composerSetAttachments", null);

// plugins/modules/email/module/index.ts
definePlugin(EmailModule);
