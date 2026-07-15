// Email plugin — graph-native module. Read path (Stage 2): list (P2 windowed,
// date-desc, facet inline), get (P1 entity+facets), batch (K·P1). Output is
// byte-compatible with the native module (MessageListItem / MessageDetailView)
// and the UI's plugins/email/ui/types.ts copies.
//
// DB-access guarantees (INV-DB-1/2/4, asserted by module/__tests__/emailRead):
//   - list (no search) = ONE list_entities_window (facet rendered inline) — no
//     canonical read, no per-row facet hydrate.
//   - list (search)    = ONE search_entities_by_name (ids) + ONE
//     list_facets_for_entities over ONLY those ids — 2 crossings, no N+1.
//   - get  = ONE get_entity_full. batch = K get_entity_full (one per id).
//
// Deferred (read-time enrichment, mirrors telegram Stage-1; verified visually
// in the frontend, NOT asserted here): link-resolved linked_entities and the
// canonical map. get returns linked_entities: [] / canonical: {} so it stays a
// single fixed-statement op.

import {
  rpc,
  syncHandler,
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
} from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  PaginatedResponse,
  RawEntity,
  RpcExecutor,
} from "@magnis/plugin-sdk";
import type {
  BatchParams,
  BatchSendParams,
  EmailCanonical,
  EmailFacets,
  EmailTriggerCheck,
  FacetSummary,
  GetParams,
  LinkedEntitySummary,
  ListParams,
  MessageDetailView,
  MessageListItem,
  ReplyParams,
  SendParams,
  SetTriggerParams,
  SyncEnvelope,
} from "../types/index.ts";

const MESSAGE_SCHEMA = "email.message";
const MESSAGE_DETAILS = "email.message.details";
const ADDRESS_SCHEMA = "email.address";
const ADDRESS_DETAILS = "email.address.details";

// PGlite is single-connection, so a sync page must be applied in CHUNKS — at
// most this many TOTAL batch entities (messages + their unique addresses) per
// apply_batch — so each transaction is short and other RPCs aren't starved.
const INGEST_CHUNK = 200;

// Placeholder sender for agent-composed outgoing mail (native parity — the real
// from-address is stamped by the connector when the message actually sends).
const OUTGOING_FROM = "user@magnis.local";

type Data = Record<string, unknown>;

const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/// Lowercased, trimmed address (the hub key); null if empty.
function lowerAddr(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/// Split a comma-separated address list into unique lowercased addresses.
function splitRecipients(csv: string | null): string[] {
  if (!csv) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of csv.split(",")) {
    const a = part.trim().toLowerCase();
    if (a.length > 0 && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/// Every unique recipient address (To + Cc + Bcc), lowercased + deduped. All
/// three are real recipients: each gets a `sent_to` link and is included in a
/// LIVE trigger's touched ids, so a trigger watching a Cc'd/Bcc'd address (e.g.
/// "watch my inbox") fires and the recipient's contact surfaces the message.
function recipientsOf(p: Data): string[] {
  const set = new Set<string>();
  for (const field of ["to_addresses", "cc_addresses", "bcc_addresses"]) {
    for (const r of splitRecipients(str(p, field))) set.add(r);
  }
  return [...set];
}

/// Every unique address (sender + all recipients) a message contributes — used
/// to size the apply_batch chunk by TOTAL entities, not message count.
function addressesOf(p: Data): string[] {
  const set = new Set<string>(recipientsOf(p));
  const from = lowerAddr(str(p, "from_address"));
  if (from) set.add(from);
  return [...set];
}

/// Local destination for a downloaded attachment (host file worker joins
/// files_dir + this). Mirrors the native dest_subpath; each segment sanitized.
function destSubpath(account: string, remote: string, attId: string, filename: string): string {
  const san = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "_");
  return `gmail/${san(account)}/${san(remote)}/${san(attId)}_${san(filename)}`;
}

/// Display sender: the source's from_name, else the raw from_address
/// (mirrors native extract_sender).
function senderOf(d: Data): string | null {
  return str(d, "from_name") ?? str(d, "from_address");
}

/// List preview: the snippet, else the plain-text body (native extract_preview).
function previewOf(d: Data): string | null {
  return str(d, "snippet") ?? str(d, "body_text");
}

/// Strip the heavy rendered HTML from a list row's metadata — the list never
/// renders it, and shipping it per row bloats the page (native strip_body_html).
function stripBodyHtml(d: Data): Data {
  const { body_html: _omit, ...rest } = d;
  return rest;
}

function buildListItem(entity: RawEntity, d: Data): MessageListItem {
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
    metadata: stripBodyHtml(d),
  };
}

export class EmailModule {
  private readonly graph: GraphService<EmailFacets, EmailCanonical>;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<EmailFacets, EmailCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  // ── email.list ────────────────────────────────────────────────
  @tool("list", {
    description: "List email messages, newest first. Optional name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async emailList(params: ListParams): Promise<PaginatedResponse<MessageListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    if (search.length > 0) {
      // Search path: name match returns ids only (no facet); hydrate ONLY the
      // page's ids in one batch facet read — 2 crossings, no per-row N+1.
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [MESSAGE_SCHEMA],
        limit: limit + offset,
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const byId = new Map<string, Data>();
      for (const f of facets) {
        if (f.schema_id === MESSAGE_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
          byId.set(f.entity_id, f.data as Data);
        }
      }
      const items = page.map((e) => buildListItem(e, byId.get(e.id) ?? {}));
      return { items, total, limit, offset };
    }

    // P2: ONE statement — page of email.message ordered by the indexed entity
    // `date` column DESC, each row carrying its latest details facet inline.
    const win = await this.graph.list_entities_window({
      schema: MESSAGE_SCHEMA,
      facet_schema: MESSAGE_DETAILS,
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset,
    });
    const items = win.items.map(({ entity, data }) => buildListItem(entity, (data ?? {}) as Data));
    return { items, total: win.total, limit, offset };
  }

  // ── email.get ─────────────────────────────────────────────────
  @tool("get", {
    description: "Get a single email message detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async emailGet(params: GetParams): Promise<MessageDetailView> {
    const view = await this.getDetail(params.id);
    if (!view) throw new Error(`${MESSAGE_SCHEMA} ${params.id} not found`);
    return view;
  }

  // ── email.batch ───────────────────────────────────────────────
  @tool("batch", {
    description: "Get multiple email message detail views by entity ids.",
    params: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string", format: "uuid" } } },
      required: ["ids"],
      additionalProperties: false,
    },
  })
  async emailBatch(params: BatchParams): Promise<MessageDetailView[]> {
    const views: MessageDetailView[] = [];
    for (const id of params.ids) {
      // K·P1: one get_entity_full per id; a not-found id is skipped (native
      // get_batch parity — it warns + drops rather than failing the batch).
      const view = await this.getDetail(id);
      if (view) views.push(view);
    }
    return views;
  }

  /// P1 detail fetch shared by get/batch. Returns null for a missing or
  /// non-email entity (get throws on null; batch skips it). At most TWO fixed
  /// crossings: P1 get_entity_full (entity + facets + link edges) and, only
  /// when the entity has links, ONE P5 get_entities batch to resolve the
  /// neighbours' names — no per-link N+1.
  private async getDetail(id: string): Promise<MessageDetailView | null> {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (!detail || detail.entity.schema_id !== MESSAGE_SCHEMA) return null;
    const { entity, facets, links } = detail;
    const d = (facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data as Data | undefined) ?? {};
    const facetSummaries: FacetSummary[] = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data,
    }));

    // Resolve link neighbours (attachments, address hub, …) for the Context
    // panel. Link edges carry ids + kind only; one batch get_entities (P5,
    // user-scoped → drops non-owned targets) hydrates names/schemas.
    const linked_entities: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }) =>
        l.from_id === entity.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const l of links) {
        const t = byId.get(neighbourId(l));
        if (!t) continue;
        linked_entities.push({
          id: t.id,
          name: t.name && t.name.length > 0 ? t.name : null,
          schema_id: t.schema_id,
          link_kind: l.kind,
          created_at: t.created_at ?? "",
          data: null,
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
      metadata: d,
    };
  }

  // ── sync ingest (@syncHandler) ────────────────────────────────
  // Invoked by the host PluginModuleController bridge (`email.__sync__`) with a
  // WHOLE page of envelopes. Ports the native ingest pipeline to the apply_batch
  // principle: a page's messages + their unique addresses + sent_from/sent_to
  // links collapse to ONE graph.apply_batch per chunk (idempotent on external_id,
  // links dedup via ON CONFLICT). Attachments + LIVE trigger.check run post-apply
  // (they need the resolved entity ids). The bridge fans the returned
  // trigger_checks out to the event_bus.
  @syncHandler("email")
  async ingest(params: {
    envelopes?: SyncEnvelope[];
  }): Promise<{ ok: boolean; dropped_remote_ids: string[]; trigger_checks: EmailTriggerCheck[] }> {
    const envelopes = Array.isArray(params?.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];
    const triggers: EmailTriggerCheck[] = [];
    const messages: SyncEnvelope[] = [];

    for (const env of envelopes) {
      // Native parity: an envelope with no owning user is skipped (warn) — the
      // dispatcher couldn't resolve user_id, so we cannot user-scope the write.
      if (!env.user_id) continue;
      if (env.kind === "delete") {
        try {
          await this.ingestDelete(env);
        } catch {
          if (env.remote_id) dropped.push(env.remote_id);
        }
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      messages.push(env);
    }

    // Chunk by TOTAL batch entities (messages + unique addresses) so one
    // apply_batch never exceeds INGEST_CHUNK and the lone PGlite connection is
    // freed between chunks.
    let chunk: SyncEnvelope[] = [];
    let chunkAddrs = new Set<string>();
    const flush = async (): Promise<void> => {
      if (chunk.length > 0) {
        await this.ingestMessageBatch(chunk, triggers);
        await Promise.resolve(); // yield so waiting RPCs get the connection
      }
      chunk = [];
      chunkAddrs = new Set();
    };
    for (const env of messages) {
      const addrs = addressesOf(env.payload as Data);
      const fresh = addrs.filter((a) => !chunkAddrs.has(a));
      // Flush BEFORE adding when this message would push the running chunk past
      // the cap. A single message is never split — its {message + folded
      // addresses + sent_from/sent_to links} must land in ONE atomic apply_batch
      // or the links would reference entities outside the fragment. So a lone
      // message contributing >INGEST_CHUNK entities is one larger batch (only
      // reachable past provider recipient limits, ~100); the cap governs the
      // realistic multi-message page.
      if (chunk.length > 0 && chunk.length + 1 + chunkAddrs.size + fresh.length > INGEST_CHUNK) {
        await flush();
      }
      chunk.push(env);
      for (const a of addrs) chunkAddrs.add(a);
    }
    await flush();

    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }

  /// Delete envelope: resolve the email by its source external_id and remove it.
  private async ingestDelete(env: SyncEnvelope): Promise<void> {
    if (!env.remote_id) return;
    const id = await this.graph.find_by_external_id(env.remote_id);
    if (id) await this.graph.delete_entity(id);
  }

  /// One chunk → one apply_batch (messages + folded address entities + links),
  /// then post-apply attachment registration + LIVE trigger.check assembly.
  private async ingestMessageBatch(
    messages: SyncEnvelope[],
    triggers: EmailTriggerCheck[],
  ): Promise<void> {
    const entities: BatchEntityInput[] = [];
    const links: BatchLinkInput[] = [];
    const addrSeen = new Set<string>();
    const linkSeen = new Set<string>();

    const addAddress = (lower: string, displayName: string | null): string => {
      const key = `addr:${lower}`;
      if (!addrSeen.has(key)) {
        const data: Record<string, unknown> = { address: lower };
        if (displayName) data.display_name = displayName;
        entities.push({
          key,
          schema_id: ADDRESS_SCHEMA,
          name: lower,
          idx: lower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data, external_id: `email:address:${lower}`, confidence: 100 },
          ],
        });
        addrSeen.add(key);
      }
      return key;
    };
    const addLink = (from_key: string, to_key: string, kind: string): void => {
      const k = `${from_key} ${to_key} ${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind });
        linkSeen.add(k);
      }
    };

    for (const env of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const p = env.payload as Data;
      entities.push({
        key: remoteId,
        schema_id: MESSAGE_SCHEMA,
        name: str(p, "subject") ?? "",
        idx: str(p, "thread_id") ?? undefined,
        date: str(p, "sent_at") ?? undefined,
        facets: [{ schema_id: MESSAGE_DETAILS, data: p, external_id: remoteId, confidence: 90 }],
      });
      const from = lowerAddr(str(p, "from_address"));
      if (from) addLink(remoteId, addAddress(from, str(p, "from_name")), "sent_from");
      for (const r of recipientsOf(p)) {
        addLink(remoteId, addAddress(r, null), "sent_to");
      }
    }

    // One atomic op (rolls back on failure; idempotent on external_id).
    const result = await this.graph.apply_batch({ entities, refs: [], links });

    // Post-apply: needs the resolved message id.
    for (const env of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const entityId = result.ids[remoteId];
      if (!entityId) continue;
      const p = env.payload as Data;

      const attachments = Array.isArray(p.attachments) ? (p.attachments as Data[]) : [];
      for (const att of attachments) {
        const attId = str(att, "attachment_id");
        if (!attId) continue;
        const filename = str(att, "filename") ?? "attachment";
        await this.graph.file_register({
          external_id: `file:gmail:${env.account_id}:${remoteId}:${attId}`,
          parent_external_id: remoteId,
          link_kind: "attachment",
          name: filename,
          mime_type: str(att, "mime_type") ?? "application/octet-stream",
          size_bytes: typeof att.size === "number" ? (att.size as number) : undefined,
          source_ref: {
            message_id: remoteId,
            attachment_id: attId,
            account_id: env.account_id,
            dest_subpath: destSubpath(env.account_id, remoteId, attId, filename),
          },
          source_module: "google",
          source_surface: "email",
          download: true,
        });
      }

      if (env.kind === "live") {
        const touched = [entityId];
        for (const r of recipientsOf(p)) {
          const aid = result.ids[`addr:${r}`];
          if (aid) touched.push(aid);
        }
        const from = lowerAddr(str(p, "from_address"));
        if (from) {
          const sid = result.ids[`addr:${from}`];
          if (sid) touched.push(sid);
        }
        triggers.push({
          type: "trigger.check",
          event_kind: "new_email",
          schema_id: "email.message",
          entity_id: entityId,
          phase: "live",
          touched_entity_ids: touched,
          user_id: env.user_id,
          context: {
            from_address: str(p, "from_address"),
            from_name: str(p, "from_name"),
            subject: str(p, "subject"),
          },
        });
      }
    }
  }

  // ── send / reply / batch_send (@writeTool) ────────────────────
  // Native-parity flow (NOT telegram's route-then-ingest): create the outgoing
  // email.message FIRST (via apply_batch — recipient email.address + sent_to link
  // folded in), then route the send command best-effort (source failure leaves the
  // created entity — non-fatal). Reply additionally threads in_reply_to from the
  // original and links attachments to the ORIGINAL email.

  @writeTool("send", {
    description:
      "Send a new email to a recipient. Subject and body required. Optionally attach files by entity ID.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string" },
        body_text: { type: "string" },
        attachment_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "File entity IDs to attach",
        },
      },
      required: ["to", "subject", "body_text"],
      additionalProperties: false,
    },
  })
  async emailSend(params: SendParams): Promise<Record<string, unknown>> {
    return this.sendSingle(params.to, params.subject, params.body_text, params.attachment_ids ?? []);
  }

  @writeTool("reply", {
    description:
      "Reply to an email. Reads the original, threads the reply (In-Reply-To), and routes it for sending. Optionally attach files by entity ID.",
    params: {
      type: "object",
      properties: {
        email_id: { type: "string", format: "uuid", description: "Entity ID of the email to reply to" },
        body_text: { type: "string", description: "Plain text body of the reply" },
        attachment_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "File entity IDs to attach",
        },
      },
      required: ["email_id", "body_text"],
      additionalProperties: false,
    },
  })
  async emailReply(params: ReplyParams): Promise<Record<string, unknown>> {
    const attachmentIds = params.attachment_ids ?? [];
    // Read the original (user-scoped); reply has no meaning without it.
    const detail = await this.graph.get_entity_full(params.email_id, { links: false });
    if (!detail || detail.entity.schema_id !== MESSAGE_SCHEMA) {
      throw new Error(`Email not found: ${params.email_id}`);
    }
    const od = (detail.facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data as Data | undefined) ?? {};
    const sender = str(od, "from_address");
    if (!sender) {
      throw new Error("Cannot determine recipient: email has no sender address");
    }
    const subject =
      str(od, "subject") ??
      (detail.entity.name && detail.entity.name.length > 0 ? detail.entity.name : "(no subject)");
    const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
    const inReplyTo = str(od, "message_id");

    // Attachment ownership + file-ness (user-scoped) — fail if the caller
    // doesn't own a file, or the id isn't a real file (no file.details facet).
    await this.resolveOwnedFileNames(attachmentIds);

    // Route the reply (native parity: FATAL on source failure).
    const result = await this.graph.source_command({
      action: "send_message",
      draft: {
        to: [{ address: sender }],
        cc: [],
        bcc: [],
        subject: replySubject,
        body_text: params.body_text,
        body_html: null,
        in_reply_to: inReplyTo,
      },
    });

    // Link attachments to the ORIGINAL email (native parity).
    for (const fid of attachmentIds) {
      await this.graph.add_link({ from_id: params.email_id, to_id: fid, kind: "attachment" });
    }

    return {
      status: "sent",
      reply_to: sender,
      subject: replySubject,
      attachment_count: attachmentIds.length,
      result,
    };
  }

  @writeTool("batch_send", {
    description:
      "Send multiple emails in one batch (1..50). Each message needs to, subject, body_text. excluded_indices skip specific messages. Returns per-message results.",
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
              attachment_ids: { type: "array", items: { type: "string", format: "uuid" } },
            },
            required: ["to", "subject", "body_text"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["messages"],
      additionalProperties: false,
    },
  })
  async emailBatchSend(params: BatchSendParams): Promise<Record<string, unknown>> {
    const messages = params.messages ?? [];
    if (messages.length === 0 || messages.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${messages.length}`);
    }
    messages.forEach((m, i) => {
      if (!m.to) throw new Error(`message[${i}]: missing to`);
      if (!m.subject) throw new Error(`message[${i}]: missing subject`);
      if (!m.body_text) throw new Error(`message[${i}]: missing body_text`);
    });
    const excluded = new Set(params.excluded_indices ?? []);

    const results: Record<string, unknown>[] = [];
    let sent = 0;
    let excludedCount = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
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

  // ── set_trigger (@writeTool) ──────────────────────────────────
  @writeTool("set_trigger", {
    description:
      "Set up an automated reaction to incoming emails. Watches one or more email addresses (OR-matching). When any watched address receives an email matching the gate, the action runs.",
    params: {
      type: "object",
      properties: {
        from_addresses: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses to watch (OR-matching: fires for ANY)",
        },
        from_address: { type: "string", description: "Single address (legacy; prefer from_addresses)" },
        gate_prompt: { type: "string", description: "Condition to check on the incoming email" },
        action_prompt: { type: "string", description: "What to do when the condition matches" },
        debounce_seconds: { type: "integer", description: "0=immediate (default for email), >0=batch" },
        episode_id: { type: "string", format: "uuid", description: "Parent episode for context" },
      },
      required: ["from_addresses", "gate_prompt", "action_prompt"],
      additionalProperties: false,
    },
  })
  async setTrigger(params: SetTriggerParams): Promise<unknown> {
    // Normalize watched addresses: lowercase, dedup, sort (native parity).
    const raw = [...(params.from_addresses ?? [])];
    if (params.from_address) raw.push(params.from_address);
    const addresses = [...new Set(raw.map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0))].sort();
    if (addresses.length === 0) {
      throw new Error("missing from_addresses or from_address");
    }

    // Resolve each address to its email.address entity id. The plugin OWNS
    // email.address, so one apply_batch resolves-or-creates them all and returns
    // the ids — no per-address ensure_address RPC.
    const result = await this.graph.apply_batch({
      entities: addresses.map((a) => ({
        key: `addr:${a}`,
        schema_id: ADDRESS_SCHEMA,
        name: a,
        idx: a,
        facets: [
          { schema_id: ADDRESS_DETAILS, data: { address: a }, external_id: `email:address:${a}`, confidence: 100 },
        ],
      })),
      refs: [],
      links: [],
    });
    const watchIds = addresses.map((a) => result.ids[`addr:${a}`]).filter((id): id is string => Boolean(id));

    const name =
      addresses.length <= 3
        ? `Email trigger: ${addresses.join(", ")}`
        : `Email trigger: ${addresses.slice(0, 3).join(", ")} +${addresses.length - 3} more`;

    // Delegate to the triggers module via the cross-module hub (rpc_calls).
    return this.rpc.execute("triggers.create", {
      name,
      watch_entity_ids: watchIds,
      gate_prompt: params.gate_prompt,
      action_prompt: params.action_prompt,
      schema_filter: "email",
      debounce_seconds: params.debounce_seconds ?? 0,
      episode_id: params.episode_id ?? null,
    });
  }

  // ── sync control (RPC) ────────────────────────────────────────
  @rpc("sync.status", {
    description: "List the email sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncStatus(): Promise<Record<string, unknown>> {
    return this.graph.sync_state("status");
  }

  @rpc("sync.reset", {
    description:
      "Reset email sync: delete the caller's email messages and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncReset(): Promise<Record<string, unknown>> {
    // Namespace-guarded by the host: reset only clears the caller's own
    // email.message entities — telegram.message and others are untouched.
    return this.graph.sync_state("reset", MESSAGE_SCHEMA);
  }

  // ── ensure_address (cross-module hub RPC) ─────────────────────
  // Find-or-create the email.address entity for an address (idempotent per
  // user, lowercased). The cross-module hub target: the contacts plugin and the
  // native meetings module call this (via rpc.execute / rpc_router) to link a
  // person/attendee to their email.address WITHOUT writing email.* themselves
  // (the email plugin owns email.*). Replaces the deleted native shim (DEC-7).
  @rpc("ensure_address", {
    description: "Find-or-create the email.address entity for an address; returns its entity id.",
    params: {
      type: "object",
      properties: { address: { type: "string" }, display_name: { type: ["string", "null"] } },
      required: ["address"],
      additionalProperties: false,
    },
  })
  async ensureAddress(params: { address: string; display_name?: string | null }): Promise<{ id: string }> {
    const lower = (params.address ?? "").trim().toLowerCase();
    if (lower.length === 0) {
      throw new Error("email.ensure_address: 'address' is required");
    }
    const data: Record<string, unknown> = { address: lower };
    if (params.display_name) data.display_name = params.display_name;
    // apply_batch resolves-or-creates by the facet external_id (the same hub key
    // ingest/send use), so this converges on one entity per address per user.
    const r = await this.graph.apply_batch({
      entities: [
        {
          key: "addr",
          schema_id: ADDRESS_SCHEMA,
          name: lower,
          idx: lower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data, external_id: `email:address:${lower}`, confidence: 100 },
          ],
        },
      ],
      refs: [],
      links: [],
    });
    const id = r.ids["addr"];
    if (!id) throw new Error(`email.ensure_address: failed to resolve ${lower}`);
    return { id };
  }

  // ── reply composer (RPC) ──────────────────────────────────────
  // Presence is keyed by the calling module id (== "email"), so the plugin and
  // the native set_attachments path share one composer namespace. Attachments
  // stay native (the host composer op is text-only).
  @rpc("composer.read", {
    description: "Read the email reply-composer presence for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async composerRead(): Promise<Record<string, unknown>> {
    return this.graph.composer("read");
  }

  @rpc("composer.set_text", {
    description: "Replace the email reply-composer text for a thread. Does NOT send.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false,
    },
  })
  async composerSetText(params: { thread_key: string; text: string }): Promise<Record<string, unknown>> {
    return this.graph.composer("set_text", params.thread_key, params.text);
  }

  @rpc("composer.append_text", {
    description: "Append to the email reply-composer text for a thread. Does NOT send.",
    params: {
      type: "object",
      properties: { thread_key: { type: "string" }, text: { type: "string" } },
      required: ["thread_key", "text"],
      additionalProperties: false,
    },
  })
  async composerAppendText(params: { thread_key: string; text: string }): Promise<Record<string, unknown>> {
    return this.graph.composer("append_text", params.thread_key, params.text);
  }

  @rpc("composer.set_attachments", {
    description:
      "Replace the email reply-composer's attachment ids for a thread. Presence-gated; does NOT send.",
    params: {
      type: "object",
      properties: {
        thread_key: { type: "string" },
        attachment_ids: { type: "array", items: { type: "string" } },
      },
      required: ["thread_key", "attachment_ids"],
      additionalProperties: false,
    },
  })
  async composerSetAttachments(params: {
    thread_key: string;
    attachment_ids: string[];
  }): Promise<Record<string, unknown>> {
    return this.graph.composer("set_attachments", params.thread_key, undefined, params.attachment_ids);
  }

  /// Resolve each attachment id to its filename, enforcing native parity: the
  /// entity must be owned by the caller (user-scoped get_entity_full → not null)
  /// AND carry a `file.details` facet. A non-file or detail-less entity is
  /// rejected (NO fallback name) so only real files can be attached/linked.
  /// Returns the per-file display names in input order.
  private async resolveOwnedFileNames(fileIds: string[]): Promise<string[]> {
    const names: string[] = [];
    for (const fid of fileIds) {
      const det = await this.graph.get_entity_full(fid, { links: false });
      if (!det) throw new Error(`file ${fid} not found`);
      const fd = det.facets.find((f) => f.schema_id === "file.details")?.data as Data | undefined;
      if (!fd) throw new Error(`file ${fid} not found`);
      names.push(typeof fd.name === "string" ? (fd.name as string) : "attachment");
    }
    return names;
  }

  /// Create one outgoing email (entity + recipient address + sent_to in one
  /// apply_batch), link attachments, then best-effort source route (non-fatal).
  private async sendSingle(
    to: string,
    subject: string,
    bodyText: string,
    attachmentIds: string[],
  ): Promise<Record<string, unknown>> {
    // Attachment ownership + names (native put attachment_names on the facet;
    // it required a file.details facet — rejected otherwise, no fallback name).
    const attachmentNames = await this.resolveOwnedFileNames(attachmentIds);

    const toLower = to.trim().toLowerCase();
    const now = new Date().toISOString();
    const facetData: Record<string, unknown> = {
      from_address: OUTGOING_FROM,
      to_addresses: to,
      subject,
      body_text: bodyText,
      sent_at: now,
      is_outgoing: true,
      has_attachments: attachmentIds.length > 0,
      attachment_names: attachmentNames,
    };
    // Outgoing message has no stable external_id → always created fresh; the
    // recipient address resolves-or-creates by its external_id (the hub).
    const msgKey = "out";
    const addrKey = `addr:${toLower}`;
    const result = await this.graph.apply_batch({
      entities: [
        {
          key: msgKey,
          schema_id: MESSAGE_SCHEMA,
          name: subject,
          date: now,
          facets: [{ schema_id: MESSAGE_DETAILS, data: facetData, confidence: 100 }],
        },
        {
          key: addrKey,
          schema_id: ADDRESS_SCHEMA,
          name: toLower,
          idx: toLower,
          facets: [
            { schema_id: ADDRESS_DETAILS, data: { address: toLower }, external_id: `email:address:${toLower}`, confidence: 100 },
          ],
        },
      ],
      refs: [],
      links: [{ from_key: msgKey, to_key: addrKey, kind: "sent_to" }],
    });
    const entityId = result.ids[msgKey];

    for (const fid of attachmentIds) {
      await this.graph.add_link({ from_id: entityId, to_id: fid, kind: "attachment" });
    }

    // Best-effort source route — the created entity survives a source failure.
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
          in_reply_to: null,
        },
      });
    } catch {
      // non-fatal: the email.message entity is already persisted.
    }

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
      timestamp: now,
    };
  }
}
