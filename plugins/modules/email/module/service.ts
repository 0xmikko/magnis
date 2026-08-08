// Email plugin — graph-native module. Read path: list (windowed,
// date-desc, facet inline), get (entity+facets), batch (one fetch per id). Output is
// byte-compatible with the native module (MessageListItem / MessageDetailView)
// and the UI's plugins/email/ui/types.ts copies.
//
// DB-access guarantees (asserted by module/__tests__/emailRead):
//   - list (no search) = ONE list_entities_window (facet rendered inline) — no
//     canonical read, no per-row facet hydrate.
//   - list (search)    = ONE search_entities_by_name — the matched rows carry
//     their own dictionaries, so there is no hydrate crossing at all.
//   - get  = ONE get_entity_full. batch = K get_entity_full (one per id).
//
// Deferred (read-time enrichment, mirrors the telegram module; verified visually
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
  type PluginLogger,
} from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  PaginatedResponse,
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
} from "../types.ts";
import {
  addressesOf,
  recipientsWithRoles,
  buildListItem,
  destSubpath,
  INGEST_CHUNK,
  lowerAddr,
  normalizeRecipient,
  OUTGOING_FROM,
  senderOf,
  str,
  type Data,
} from "./helpers.ts";
import {
  ADDRESS_SCHEMA,
  MESSAGE_SCHEMA,
} from "../schema.ts";

export class EmailModule {
  private readonly graph: GraphService<EmailFacets, EmailCanonical>;
  private readonly rpc: RpcExecutor;
  private readonly log: PluginLogger;
  constructor(deps: PluginDeps<EmailFacets, EmailCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
    this.log = deps.log;
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
      // Search path: the matched rows already carry their dictionaries, so the
      // page renders straight off them — ONE crossing, no hydrate.
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [MESSAGE_SCHEMA],
        limit: limit + offset,
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      // S5: the dictionary rides the entity rows the search returned.
      const items = page.map((e) =>
        buildListItem(e, ((e as { properties?: unknown }).properties ?? {}) as Data),
      );
      return { items, total, limit, offset };
    }

    // ONE statement — page of email.message ordered by the indexed entity
    // `date` column DESC, each row carrying its latest details facet inline.
    const win = await this.graph.list_entities_window({
      schema: MESSAGE_SCHEMA,

      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset,
    });
    const items = win.items.map(({ entity }) =>
      buildListItem(entity, ((entity as { properties?: unknown }).properties ?? {}) as Data),
    );
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
      // One get_entity_full per id; a not-found id is skipped (native
      // get_batch parity — it warns + drops rather than failing the batch).
      const view = await this.getDetail(id);
      if (view) views.push(view);
    }
    return views;
  }

  /// Detail fetch shared by get/batch. Returns null for a missing or
  /// non-email entity (get throws on null; batch skips it). At most TWO fixed
  /// crossings: get_entity_full (entity + facets + link edges) and, only
  /// when the entity has links, ONE get_entities batch to resolve the
  /// neighbours' names — no per-link N+1.
  private async getDetail(id: string): Promise<MessageDetailView | null> {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (detail?.entity.schema_id !== MESSAGE_SCHEMA) return null;
    const { entity, facets, links } = detail;
    // S5: the message DICT is the record; the frozen facet stays the archive.
    const d = ((entity as { properties?: unknown }).properties ?? {}) as Data;
    const facetSummaries: FacetSummary[] = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data,
    }));

    // Resolve link neighbours (attachments, address hub, …) for the Context
    // panel. Link edges carry ids + kind only; one batch get_entities
    // (user-scoped → drops non-owned targets) hydrates names/schemas.
    const linked_entities: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }): string =>
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
          // S5: a neighbour carries its own dictionary — the attachment row
          // renders its size from the file node, not from a copy the message
          // used to keep.
          data: t.properties ?? null,
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
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
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
      const addrs = addressesOf(env.payload);
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
    // S5: the remote id IS the node's anchor — resolution goes through the
    // one chokepoint, not the retired facet external id.
    const id = await this.graph.find_by_anchor(env.remote_id);
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
          anchor: `email:address:${lower}`,
          properties: data,
          confidence: 100,
        });
        addrSeen.add(key);
      }
      return key;
    };
    const addLink = (
      from_key: string,
      to_key: string,
      kind: string,
      declared_by: string,
      metadata?: Record<string, unknown>,
    ): void => {
      const k = `${from_key} ${to_key} ${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind, declared_by, ...(metadata ? { metadata } : {}) });
        linkSeen.add(k);
      }
    };

    for (const env of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const p = env.payload as Data;
      // S5 (plan §7): the message DICT is the record, minus what the edges
      // now represent — the attachments array and the three joined recipient
      // strings. The from/to addresses stay as edges to shared address nodes.
      const dict: Data = { ...p };
      delete dict.attachments;
      delete dict.to_addresses;
      delete dict.cc_addresses;
      delete dict.bcc_addresses;
      entities.push({
        key: remoteId,
        schema_id: MESSAGE_SCHEMA,
        name: str(p, "subject") ?? "",
        idx: str(p, "thread_id") ?? undefined,
        date: str(p, "sent_at") ?? undefined,
        anchor: remoteId,
        properties: dict,
        // The provider is the observer of a message it delivered; the module's
        // own certainty in the dictionary it just wrote is 90, as the facet it
        // replaced carried.
        confidence: 90,
      });
      const from = lowerAddr(str(p, "from_address"));
      // S5: authorship is `authored_by` — the relation, not a channel-shaped
      // kind. `sent_from` retires with this writer.
      if (from) addLink(remoteId, addAddress(from, str(p, "from_name")), "authored_by", remoteId);
      for (const r of recipientsWithRoles(p)) {
        addLink(remoteId, addAddress(r.addr, null), "sent_to", remoteId, { role: r.role });
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
          link_kind: "file.attachment",
          name: filename,
          mime_type: str(att, "mime_type") ?? "application/octet-stream",
          size_bytes: typeof att.size === "number" ? (att.size) : undefined,
          source_ref: {
            message_id: remoteId,
            attachment_id: attId,
            account_id: env.account_id,
            dest_subpath: destSubpath(env.account_id, remoteId, attId, filename),
          },
          // The host file worker routes download_file by (source_module,
          // source_surface) — stamp the envelope's ACTUAL source_id, never a
          // hardcoded name: the email surface may be served by a
          // differently-named connector (google-ts).
          source_module: env.source_id,
          source_surface: "email",
          download: true,
        });
      }

      if (env.kind === "live") {
        // @tested-by: tst_be_emailingest_trigger_006
        // @invariant: INV-9 — only the SENDER is a trigger candidate. Listing
        // recipients too meant a trigger watching the user's own address fired
        // on the user's own traffic: the RFQ we had just sent counted as "a
        // reply arrived". A trigger watches who it hears FROM, not who was
        // copied.
        const touched = [entityId];
        const from = lowerAddr(str(p, "from_address"));
        if (from) {
          const sid = result.ids[`addr:${from}`];
          if (sid) touched.push(sid);
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
            subject: str(p, "subject"),
            // @invariant: INV-10 — without the event's own timestamp the
            // engine cannot tell a delayed backfill from a fresh arrival, so
            // it fired on history. The engine fails closed when this is absent.
            occurred_at: str(p, "sent_at"),
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
    if (detail?.entity.schema_id !== MESSAGE_SCHEMA) {
      throw new Error(`Email not found: ${params.email_id}`);
    }
    const od = ((detail.entity as { properties?: unknown }).properties ?? {}) as Data;
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

    // @tested-by: tst_module_email_reply_004
    // @invariant: INV-5 — the same receipt rule as `send`. `reply` reported
    // `status: "sent"` for whatever the connector returned, including a success
    // with nothing in it, and it did so while writing attachment links to the
    // ORIGINAL email — so a reply that never left still mutated the graph.
    // Checked BEFORE those links, so a refusal leaves no trace.
    if (!str(result, "message_id")) {
      throw new Error(
        "email.reply: the source accepted the reply but returned no provider id — " +
          "treating this as NOT sent. Check the connector's own logs; a silent " +
          "success here means the mail never reached the provider.",
      );
    }

    // Link attachments to the ORIGINAL email (native parity).
    for (const fid of attachmentIds) {
      await this.graph.add_link({ from_id: params.email_id, to_id: fid, kind: "file.attachment" });
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
    const messages = params.messages;
    if (messages.length === 0 || messages.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(messages.length)}`);
    }
    // @tested-by: tst_module_email_send_003
    // @invariant: INV-7 — validate EVERY recipient before sending ANY of them.
    // Validating lazily would leave earlier messages already delivered when a
    // later address turns out to be malformed, and an outgoing mail cannot be
    // recalled.
    messages.forEach((m, i) => {
      if (!m.to) throw new Error(`message[${String(i)}]: missing to`);
      if (!m.subject) throw new Error(`message[${String(i)}]: missing subject`);
      if (!m.body_text) throw new Error(`message[${String(i)}]: missing body_text`);
      try {
        normalizeRecipient(m.to);
      } catch (error) {
        throw new Error(`message[${String(i)}]: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    });
    const excluded = new Set(params.excluded_indices ?? []);

    const results: Record<string, unknown>[] = [];
    let sent = 0;
    let failed = 0;
    let excludedCount = 0;
    for (const [i, m] of messages.entries()) {
      if (excluded.has(i)) {
        excludedCount++;
        results.push({ id: null, to: m.to, subject: m.subject, status: "excluded", attachment_count: 0 });
        continue;
      }
      // @tested-by: tst_module_email_send_007
      // @invariant: INV-8 — a refusal on message N must not discard the outcome
      // of messages 1..N-1: those are already delivered and un-recallable, so
      // dropping their results loses the only record the caller gets. Report
      // every message and keep going.
      try {
        const r = await this.sendSingle(m.to, m.subject, m.body_text, m.attachment_ids ?? []);
        sent++;
        results.push({ id: r.id, to: m.to, subject: m.subject, status: "sent", attachment_count: r.attachment_count });
      } catch (sendError) {
        failed++;
        results.push({
          id: null,
          to: m.to,
          subject: m.subject,
          status: "failed",
          attachment_count: 0,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
    return { results, total: messages.length, sent, failed, excluded: excludedCount };
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
        anchor: `email:address:${a}`,
        properties: { address: a },
      })),
      refs: [],
      links: [],
    });
    const watchIds = addresses.map((a) => result.ids[`addr:${a}`]).filter((id): id is string => Boolean(id));

    const name =
      addresses.length <= 3
        ? `Email trigger: ${addresses.join(", ")}`
        : `Email trigger: ${addresses.slice(0, 3).join(", ")} +${String(addresses.length - 3)} more`;

    // Delegate to the triggers module via the cross-module hub (`[permissions] call`).
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
  // (the email plugin owns email.*). Replaces the deleted native shim.
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
    const ids = await this.ensureAddressBatch([params]);
    const id = ids[0];
    if (!id) throw new Error(`email.ensure_address: failed to resolve ${params.address}`);
    return { id };
  }

  // ── ensure_addresses (batched, S3) ─────────────────────────────
  // The address owner mints (plan §7): contacts hands over every address a
  // sync page observed in ONE call; each get-or-creates by the
  // `email:address:<lower>` ANCHOR through the chokepoint, so callers can
  // also reference the node by that anchor with no id wired back.
  @rpc("ensure_addresses", {
    description: "Get-or-create email.address entities for many addresses (batched).",
    params: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              address: { type: "string" },
              display_name: { type: "string" },
            },
            required: ["address"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  })
  async ensureAddresses(params: {
    items: { address: string; display_name?: string | null }[];
  }): Promise<{ ids: string[] }> {
    return { ids: await this.ensureAddressBatch(params.items) };
  }

  private async ensureAddressBatch(
    items: { address: string; display_name?: string | null }[],
  ): Promise<string[]> {
    const lowers = items.map((p) => p.address.trim().toLowerCase());
    if (lowers.some((l) => l.length === 0)) {
      throw new Error("email.ensure_address: 'address' is required");
    }
    const entities = [];
    const seen = new Set<string>();
    for (const [i, lower] of lowers.entries()) {
      if (seen.has(lower)) continue;
      seen.add(lower);
      const item = items[i];
      const data: Record<string, unknown> = { address: lower };
      if (item?.display_name) data.display_name = item.display_name;
      entities.push({
        key: lower,
        schema_id: ADDRESS_SCHEMA,
        name: lower,
        idx: lower,
        // S3: the anchor is THE resolver — claimed through the chokepoint on
        // create, so re-ensures and anchor-refs converge on one node.
        // S5: the address DICT is the record; the facet retired with it.
        anchor: `email:address:${lower}`,
        properties: data,
      });
    }
    const r = await this.graph.apply_batch({ entities, refs: [], links: [] });
    return lowers.map((lower) => {
      const id = r.ids[lower];
      if (!id) throw new Error(`email.ensure_address: failed to resolve ${lower}`);
      return id;
    });
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
      names.push(typeof fd.name === "string" ? (fd.name) : "attachment");
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
    // @tested-by: tst_module_email_send_002
    // @invariant: INV-7 — reject a malformed recipient BEFORE any read, write
    // or provider call. `to.trim().toLowerCase()` accepted anything, including
    // the JSON text of an array, and let Gmail refuse it downstream.
    const toLower = normalizeRecipient(to);

    // Attachment ownership + names (native put attachment_names on the facet;
    // it required a file.details facet — rejected otherwise, no fallback name).
    const attachmentNames = await this.resolveOwnedFileNames(attachmentIds);
    const now = new Date().toISOString();
    // @tested-by: tst_module_email_send_004, tst_module_email_send_006
    // @invariant: INV-5 — route BEFORE persisting. A refusal must leave no
    // trace: the demo's failure was a stored "outgoing" message for mail Gmail
    // had rejected. No ledger is needed to make this safe — see the write
    // below for why the tool never throws once the provider has accepted.
    const routed = await this.graph.source_command({
      action: "send_message",
      draft: {
        to: [{ address: toLower }],
        cc: [],
        bcc: [],
        subject,
        body_text: bodyText,
        body_html: null,
        in_reply_to: null,
      },
    });
    const providerMessageId = str(routed, "message_id");
    const providerThreadId = str(routed, "thread_id");
    // @tested-by: tst_module_email_send_008
    // @invariant: INV-5 — a provider that accepted a message returns its id.
    // A success WITHOUT one is not proof of delivery, and treating it as one is
    // how a send that never reached Gmail was reported as sent: the plugin had
    // stopped swallowing the error, but the CONNECTOR returned ok having done
    // nothing. No id, no send — and nothing is persisted, because this throws
    // before the graph write below.
    if (!providerMessageId) {
      throw new Error(
        "email.send: the source accepted the message but returned no provider id — " +
          "treating this as NOT sent. Check the connector's own logs; a silent " +
          "success here means the mail never reached the provider.",
      );
    }

    const facetData: Record<string, unknown> = {
      from_address: OUTGOING_FROM,
      to_addresses: to,
      subject,
      body_text: bodyText,
      sent_at: now,
      is_outgoing: true,
      provider_message_id: providerMessageId,
      has_attachments: attachmentIds.length > 0,
      attachment_names: attachmentNames,
    };
    // @tested-by: tst_module_email_send_006
    // @invariant: INV-27 — the provider has ACCEPTED by this point, so the mail
    // is gone and cannot be recalled. Throwing here would report a failed send
    // and invite a retry, which would deliver the message a SECOND time. The
    // graph write is an optimistic view, not the record: Gmail's Sent folder is
    // ingested with no label filter, so the next sync creates this message
    // properly on its own. A failure is therefore logged and surfaced, never
    // thrown.
    let entityId: string | null = null;
    let graphWriteFailed = false;
    try {
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
            // @tested-by: tst_module_email_send_005
            // @invariant: INV-6 — Gmail returns the id it will later hand back as
            // `remote_id` when sync ingests our own Sent folder, and ingest
            // matches on the facet `external_id` and nothing else. Carrying it
            // here is what makes the copy arriving from Sent UPDATE this entity
            // instead of creating a second one. Without it every sent email
            // exists in the graph twice.
            idx: providerThreadId ?? undefined,
            date: now,
            // S5: the sent copy is a node with a DICT under the provider's own
            // id as its anchor — that anchor is what makes the copy arriving
            // from Sent update THIS node instead of creating a second one.
            anchor: providerMessageId,
            properties: facetData,
          },
          {
            key: addrKey,
            schema_id: ADDRESS_SCHEMA,
            name: toLower,
            idx: toLower,
            anchor: `email:address:${toLower}`,
            properties: { address: toLower },
          },
        ],
        refs: [],
        links: [{ from_key: msgKey, to_key: addrKey, kind: "sent_to" }],
      });
      const messageEntityId = result.ids[msgKey];
      if (messageEntityId === undefined) throw new Error(`email.send: missing entity id for ${msgKey}`);

      for (const fid of attachmentIds) {
        await this.graph.add_link({ from_id: messageEntityId, to_id: fid, kind: "file.attachment" });
      }

      entityId = messageEntityId;
    } catch (writeError) {
      graphWriteFailed = true;
      await this.log.log("warn", "outgoing email persisted only in the mailbox", {
        provider_message_id: providerMessageId,
        to: toLower,
        reason: writeError instanceof Error ? writeError.message : String(writeError),
      });
    }

    return {
      schema_id: MESSAGE_SCHEMA,
      id: entityId,
      provider_message_id: providerMessageId,
      graph_write_failed: graphWriteFailed,
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
