// Email plugin — graph-native module. Read path: list (windowed,
// date-desc), get (entity + links), batch (one fetch per id). Output is
// byte-compatible with the native module (MessageListItem / MessageDetailView)
// and the UI's plugins/email/ui/types.ts copies.
//
// DB-access guarantees (asserted by module/__tests__/emailRead):
//   - list (no search) = ONE list_entities_window — no canonical read, no
//     per-row hydrate.
//   - list (search)    = ONE search_entities_by_name — the matched rows carry
//     their own dictionaries, so there is no hydrate crossing at all.
//   - get = one get_entity_full plus one batched neighbour read when linked.

import {
  connectionReady,
  pageLimitMax,
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
  BatchRefInput,
  RawEntity,
  RawSyncableEntity,
  ResolveSyncMigrationParams,
  SetSyncEnabledParams,
  SetSyncEnabledResult,
  SyncChoice,
  SyncMigrationEntity,
  SyncMigrationIssue,
  SyncMigrationStatus,
  SyncSelection,
  SyncSelectionRequest,
  PaginatedResponse,
  RpcExecutor,
  SourceEnvelope,
} from "@magnis/plugin-sdk";
import type {
  BatchParams,
  BatchSendParams,
  EmailTriggerCheck,
  GetParams,
  LinkedEntitySummary,
  ListParams,
  MessageDetailView,
  MessageListItem,
  ReplyParams,
  SendParams,
  SetTriggerParams,
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
  addressBatchEntity,
} from "../schema.ts";

interface AddressSyncState {
  id: string;
  syncEnabled: boolean;
}

function senderAddress(properties: Data): string {
  const address = lowerAddr(str(properties, "address"));
  if (address === null || !/^[^\s<>@]+@[^\s<>@]+$/.test(address)) throw new Error("Email sender has no exact address");
  return address;
}

function savedAddress(entity: RawEntity): RawSyncableEntity {
  if (entity.schema_id !== ADDRESS_SCHEMA || !("syncEnabled" in entity) || typeof entity.syncEnabled !== "boolean"
    || !("syncRevision" in entity) || typeof entity.syncRevision !== "string" || !/^\d+$/.test(entity.syncRevision)) {
    throw new Error(`Email address ${entity.id} has no valid saved synchronization choice`);
  }
  return { ...entity, syncEnabled: entity.syncEnabled, syncRevision: entity.syncRevision };
}

const SEND_PARAMS = {
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
    };
const REPLY_PARAMS = {
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
    };
const BATCH_SEND_PARAMS = {
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
    };
const GET_PARAMS = {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    };
const BATCH_PARAMS = {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string", format: "uuid" } } },
      required: ["ids"],
      additionalProperties: false,
    };

export class EmailModule {
  private readonly graph: GraphService;
  private readonly rpc: RpcExecutor;
  private readonly log: PluginLogger;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
    this.log = deps.log;
  }

  @tool("get", { entity: "email.message", description: "Get an email by id or multiple emails by ids.", params: { oneOf: [GET_PARAMS, BATCH_PARAMS] } })
  async get(params: GetParams | BatchParams): Promise<MessageDetailView | MessageDetailView[]> {
    if ("id" in params && "ids" in params) throw new Error("Choose one get form: id or ids");
    return "ids" in params ? this.emailBatch(params) : this.emailGet(params);
  }

  @writeTool("create", {
    entity: "email.message",
    description: "Create an email: {to,subject,body_text}, reply {email_id,body_text}, or batch {messages:[{to,subject,body_text}],excluded_indices?}; attachment_ids supported.",
    params: { oneOf: [SEND_PARAMS, REPLY_PARAMS, BATCH_SEND_PARAMS] },
    allowlist_gate: { target_type: "email_address", target_arg: "to", batch_arg: "messages" },
  })
  async create(params: SendParams | ReplyParams | BatchSendParams): Promise<Record<string, unknown>> {
    // @tested-by: tst_module_email_create_001
    if (["to", "email_id", "messages"].filter((key) => key in params).length !== 1) {
      throw new Error("Choose one email create form: to, email_id or messages");
    }
    if ("messages" in params) return this.emailBatchSend(params);
    if ("email_id" in params) return this.emailReply(params);
    return this.emailSend(params);
  }

  // ── email.list ────────────────────────────────────────────────
  @rpc("list", {
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
    // `date` column DESC; each row's dictionary rides on the entity.
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
  @rpc("get", {
    description: "Get a single email message detail view by entity id.",
    params: GET_PARAMS,
  })
  async emailGet(params: GetParams): Promise<MessageDetailView> {
    const view = await this.getDetail(params.id);
    if (!view) throw new Error(`${MESSAGE_SCHEMA} ${params.id} not found`);
    return view;
  }

  // ── email.batch ───────────────────────────────────────────────
  @rpc("batch", {
    description: "Get multiple email message detail views by entity ids.",
    params: BATCH_PARAMS,
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
  /// crossings: get_entity_full (entity + link edges) and, only
  /// when the entity has links, ONE get_entities batch to resolve the
  /// neighbours' names — no per-link N+1.
  private async getDetail(id: string): Promise<MessageDetailView | null> {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (detail?.entity.schema_id !== MESSAGE_SCHEMA) return null;
    const { entity, links } = detail;
    // S5: the message DICT is the record.
    const d = ((entity as { properties?: unknown }).properties ?? {}) as Data;

    // Resolve link neighbours (attachments, address hub, …) for the Context
    // panel. Link edges carry ids + kind only; one batch get_entities
    // (user-scoped → drops non-owned targets) hydrates names/schemas.
    const linked_entities: LinkedEntitySummary[] = [];
    let senderSync: MessageDetailView["senderSync"] = null;
    const authors = links.filter((link) => link.from_id === entity.id && link.kind === "authored_by" && link.validUntil === null);
    if (authors.length > 1) throw new Error(`Email ${id} has conflicting sender links`);
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }): string =>
        l.from_id === entity.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      const author = authors[0];
      if (author !== undefined) {
        const target = byId.get(author.to_id);
        if (target === undefined) throw new Error(`Email ${id} sender is missing`);
        const saved = savedAddress(target);
        senderSync = { id: saved.id, syncEnabled: saved.syncEnabled, syncRevision: saved.syncRevision };
      }
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
      linked_entities,
      senderSync,
      created_at: created,
      metadata: d,
    };
  }

  // ── sync ingest (@syncHandler) ────────────────────────────────
  private async readAddresses(addresses: readonly string[]): Promise<Map<string, AddressSyncState>> {
    const unique = [...new Set(addresses)];
    const known = new Map<string, AddressSyncState>();
    if (unique.length === 0) return known;
    const ids = await this.graph.find_by_anchors(unique.map((address) => `email:address:${address}`));
    if (ids.length !== unique.length) throw new Error("Email address lookup length mismatch");
    const found = ids.filter((id): id is string => id !== null);
    if (found.length === 0) return known;
    const rows = new Map((await this.graph.get_entities(found)).map((row) => [row.id, row]));
    unique.forEach((address, index) => {
      const id = ids[index];
      if (id === null) return;
      const row = id === undefined ? undefined : rows.get(id);
      if (row === undefined) throw new Error("Email address lookup returned an incomplete result");
      const saved = savedAddress(row);
      if (senderAddress(saved.properties ?? {}) !== address) throw new Error("Email address anchor does not match its identity");
      known.set(address, { id: saved.id, syncEnabled: saved.syncEnabled });
    });
    return known;
  }

  private async admitEnvelopes(incoming: readonly SourceEnvelope[]): Promise<{ envelopes: SourceEnvelope[]; addresses: Map<string, AddressSyncState>; deleteTargets: Map<string, string> }> {
    const owned: { env: SourceEnvelope; address: string }[] = [];
    const controls: SourceEnvelope[] = [];
    const deleteTargets = new Map<string, string>();
    for (const env of incoming) {
      if (!env.user_id) continue;
      if (!env.remote_id) throw new Error("Email event has no remote ID");
      if (env.payload.entity_type === "mailbox") { controls.push(env); continue; }
      const from = lowerAddr(str(env.payload, "from_address"));
      if (from !== null) {
        owned.push({ env, address: senderAddress({ address: from }) });
        continue;
      }
      const id = await this.graph.find_by_anchor(env.remote_id);
      if (id === null && env.kind === "delete") continue;
      if (id === null) throw new Error("Email event has no sender or stored message ownership");
      if (env.kind === "delete") deleteTargets.set(env.remote_id, id);
      const stored = await this.graph.get_entity_full(id, { links: true });
      if (stored?.entity.schema_id !== MESSAGE_SCHEMA) throw new Error("Email event does not refer to a stored message");
      const authors = stored.links.filter((link) => link.from_id === id && link.kind === "authored_by" && link.validUntil === null);
      const author = authors[0];
      if (authors.length !== 1 || author === undefined) throw new Error("Email event has no unique stored sender");
      const row = await this.graph.get_entity(author.to_id);
      if (row === null) throw new Error("Email event refers to a missing sender");
      const address = senderAddress(savedAddress(row).properties ?? {});
      owned.push({ env: env.kind === "delete" ? env : { ...env, payload: { ...stored.entity.properties, ...env.payload, from_address: address } }, address });
    }
    const addresses = await this.readAddresses(owned.flatMap(({ env, address }) => [address, ...addressesOf(env.payload)]));
    const discovered = new Map<string, string | null>();
    for (const { env, address } of owned) {
      if (addresses.has(address)) continue;
      if (env.kind === "delete") throw new Error("Email deletion refers to an undiscovered sender");
      discovered.set(address, str(env.payload, "from_name"));
    }
    if (discovered.size > 0) {
      const syncEnabled = await this.syncCreationRule();
      const entities = [...discovered].map(([address, name]) => addressBatchEntity(`addr:${address}`, address, name, syncEnabled));
      const created = await this.graph.apply_batch({ entities, refs: [], links: [] });
      for (const address of discovered.keys()) {
        const id = created.ids[`addr:${address}`];
        if (id === undefined) throw new Error(`Email sender discovery failed for ${address}`);
        addresses.set(address, { id, syncEnabled });
      }
    }
    const groups = new Map<string, Set<string>>();
    for (const { env, address } of owned) {
      const state = addresses.get(address);
      if (state === undefined || typeof env.remote_id !== "string") throw new Error("Email event has no sender identity");
      let ids = groups.get(state.id);
      if (ids === undefined) { ids = new Set(); groups.set(state.id, ids); }
      ids.add(env.remote_id);
    }
    const allowed = new Set(await this.graph.admitSyncEntities([...groups].map(([entityId, ids]) => ({ entityId, remoteIds: [...ids] })), controls.map((env) => {
      if (typeof env.remote_id !== "string") throw new Error("Email control has no remote ID");
      return env.remote_id;
    })));
    return { envelopes: [...controls, ...owned.flatMap(({ env }) => typeof env.remote_id === "string" && allowed.has(env.remote_id) && env.payload.entity_type !== "sender" ? [env] : [])], addresses, deleteTargets };
  }

  // Invoked by the host PluginModuleController bridge (`email.__sync__`) with a
  // WHOLE page of envelopes. Ports the native ingest pipeline to the apply_batch
  // principle: a page's messages + their unique addresses + sent_from/sent_to
  // links collapse to ONE graph.apply_batch per chunk (idempotent on external_id,
  // links dedup via ON CONFLICT). Attachments + LIVE trigger.check run post-apply
  // (they need the resolved entity ids). The bridge fans the returned
  // trigger_checks out to the event_bus.
  @syncHandler("email")
  async ingest(params: {
    envelopes?: SourceEnvelope[];
    /** The pass the worker is in; absent for a Source effect outside a
     * worker, which states nothing. */
    generation?: string;
  }): Promise<{ dropped_remote_ids: string[]; trigger_checks: EmailTriggerCheck[]; plan?: Record<string, { total: number; skipped: number }> }> {
    const incoming = Array.isArray(params.envelopes) ? params.envelopes : [];
    if (incoming.length === 0) return { dropped_remote_ids: [], trigger_checks: [] };
    const { envelopes, addresses, deleteTargets } = await this.admitEnvelopes(incoming);
    const dropped: string[] = [];
    const triggers: EmailTriggerCheck[] = [];
    const messages: SourceEnvelope[] = [];
    // What the page states for the plan, as the Source counted the mailbox:
    // the whole of it on the mailbox envelope that opens a pass, one more per
    // new mail (history delivers it live) and one less per removal.
    // @tested-by: tst_module_email_plan_001
    const stated = typeof params.generation === "string" && params.generation !== "";
    const plan = { total: 0, skipped: 0 };

    for (const env of envelopes) {
      // Native parity: an envelope with no owning user is skipped (warn) — the
      // dispatcher couldn't resolve user_id, so we cannot user-scope the write.
      if (!env.user_id) continue;
      if (env.kind === "delete") {
        try {
          if (await this.ingestDelete(env, typeof env.remote_id !== "string" ? undefined : deleteTargets.get(env.remote_id))) plan.total -= 1;
        } catch {
          if (env.remote_id) dropped.push(env.remote_id);
        }
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      if (env.payload.entity_type === "mailbox") {
        const total = env.payload.messages_total;
        const skipped = env.payload.skipped;
        if (typeof total !== "number" || typeof skipped !== "number") {
          throw new Error("email ingest refused: a mailbox envelope must carry messages_total and skipped");
        }
        plan.total += total;
        plan.skipped += skipped;
        continue;
      }
      messages.push(env);
    }

    // Chunk by TOTAL batch entities (messages + unique addresses) so one
    // apply_batch never exceeds INGEST_CHUNK and the lone PGlite connection is
    // freed between chunks.
    let chunk: SourceEnvelope[] = [];
    let chunkAddrs = new Set<string>();
    const flush = async (): Promise<void> => {
      if (chunk.length > 0) {
        plan.total += await this.ingestMessageBatch(chunk, triggers, stated, addresses);
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

    if (!stated) return { dropped_remote_ids: dropped, trigger_checks: triggers };
    return { dropped_remote_ids: dropped, trigger_checks: triggers, plan: { [MESSAGE_SCHEMA]: plan } };
  }

  /// Delete envelope: resolve the email by its source external_id and remove it.
  private async ingestDelete(env: SourceEnvelope, storedId?: string): Promise<boolean> {
    if (!env.remote_id) return false;
    // S5: the remote id IS the node's anchor — resolution goes through the
    // one chokepoint.
    const id = storedId ?? await this.graph.find_by_anchor(env.remote_id);
    if (!id) return false;
    await this.graph.delete_entity(id);
    return true;
  }

  /// One chunk → one apply_batch (messages + folded address entities + links),
  /// then post-apply attachment registration + LIVE trigger.check assembly.
  private async ingestMessageBatch(
    messages: SourceEnvelope[],
    triggers: EmailTriggerCheck[],
    countLive: boolean,
    addresses: Map<string, AddressSyncState>,
  ): Promise<number> {
    const entities: BatchEntityInput[] = [];
    const refs: BatchRefInput[] = [];
    const links: BatchLinkInput[] = [];
    const addrSeen = new Set<string>();
    const newAddresses = new Map<string, boolean>();
    const linkSeen = new Set<string>();
    const hasNewAddresses = messages.some((env) => addressesOf(env.payload).some((address) => !addresses.has(address)));
    const initialEnabled = hasNewAddresses ? await this.syncCreationRule() : null;

    const addAddress = (lower: string, displayName: string | null): string => {
      const key = `addr:${lower}`;
      if (!addrSeen.has(key)) {
        const known = addresses.get(lower);
        if (known?.syncEnabled === false) refs.push({ key, anchor: `email:address:${lower}` });
        else {
          const syncEnabled = known?.syncEnabled ?? initialEnabled;
          if (syncEnabled === null) throw new Error("Email address creation requires an explicit synchronization choice");
          entities.push({ ...addressBatchEntity(key, lower, displayName, syncEnabled), confidence: 100 });
          if (known === undefined) newAddresses.set(lower, syncEnabled);
        }
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
      delete dict.id;
      if (typeof dict.message_id_header === "string") dict.message_id = dict.message_id_header;
      delete dict.message_id_header;
      if (dict.thread_id === null) delete dict.thread_id;
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
        // own certainty in the dictionary it just wrote is 90, as the record it
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

    // @tested-by: tst_module_google_003
    // Graph's batch totals include address nodes, so check only live message
    // anchors before the atomic write and count keys that it actually admitted.
    const liveIds = countLive
      ? [...new Set(messages.filter((env) => env.kind === "live").map((env) => env.remote_id).filter((id): id is string => Boolean(id)))]
      : [];
    const existing = liveIds.length > 0 ? await this.graph.find_by_anchors(liveIds) : [];
    if (existing.length !== liveIds.length) throw new Error("email ingest: anchor lookup length mismatch");

    // One atomic op (rolls back on failure; idempotent on external_id).
    const result = await this.graph.apply_batch({ entities, refs, links });
    for (const [address, syncEnabled] of newAddresses) {
      const id = result.ids[`addr:${address}`];
      if (id === undefined) throw new Error(`Email recipient creation failed for ${address}`);
      addresses.set(address, { id, syncEnabled });
    }
    const createdLive = liveIds.filter((id, index) => existing[index] === null && result.ids[id] !== undefined).length;

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
          // Historical bytes load on demand; eager backfill competes with
          // message hydration for the same Gmail per-user quota.
          // @tested-by: tst_module_email_ingest_003
          download: env.kind === "live",
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
    return createdLive;
  }

  // ── send / reply / batch_send (@writeTool) ────────────────────
  // Native-parity flow (NOT telegram's route-then-ingest): create the outgoing
  // email.message FIRST (via apply_batch — recipient email.address + sent_to link
  // folded in), then route the send command best-effort (source failure leaves the
  // created entity — non-fatal). Reply additionally threads in_reply_to from the
  // original and links attachments to the ORIGINAL email.

  @rpc("send", {
    description:
      "Send a new email to a recipient. Subject and body required. Optionally attach files by entity ID.",
    params: SEND_PARAMS,
  })
  async emailSend(params: SendParams): Promise<Record<string, unknown>> {
    return this.sendSingle(params.to, params.subject, params.body_text, params.attachment_ids ?? []);
  }

  @rpc("reply", {
    description:
      "Reply to an email. Reads the original, threads the reply (In-Reply-To), and routes it for sending. Optionally attach files by entity ID.",
    params: REPLY_PARAMS,
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
    // doesn't own a file, or the id isn't a real file (empty dictionary).
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

  @rpc("batch_send", {
    description:
      "Send multiple emails in one batch (1..50). Each message needs to, subject, body_text. excluded_indices skip specific messages. Returns per-message results.",
    params: BATCH_SEND_PARAMS,
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
  @rpc("set_trigger", {
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
      required: ["gate_prompt", "action_prompt"],
      anyOf: [{ required: ["from_addresses"] }, { required: ["from_address"] }],
      additionalProperties: false,
    },
  })
  async setTrigger(params: SetTriggerParams): Promise<unknown> {
    // @tested-by: tst_module_email_trigger_validation_001
    if (!params.gate_prompt.trim() || !params.action_prompt.trim()) throw new Error("gate_prompt and action_prompt are required");
    if (params.debounce_seconds !== undefined && (!Number.isInteger(params.debounce_seconds) || params.debounce_seconds < 0)) throw new Error("invalid debounce_seconds");
    if (params.episode_id !== undefined) {
      const parent = await this.graph.get_entity_full(params.episode_id, { links: false });
      if (parent?.entity.schema_id !== "episodes.episode") throw new Error(`episode not found: ${params.episode_id}`);
    }
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
    const watchIds = await this.ensureAddressBatch(addresses.map((address) => ({ address })));

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
      ...(params.episode_id === undefined ? {} : { episode_id: params.episode_id }),
    });
  }

  // ── sync control (RPC) ────────────────────────────────────────
  private async syncEntities(): Promise<readonly SyncMigrationEntity[]> {
    const rows: SyncMigrationEntity[] = [];
    let after: string | null = null;
    do {
      const page = await this.graph.listSyncMigrationEntities({ schemaId: ADDRESS_SCHEMA, after, limit: pageLimitMax });
      if (page.next !== null && (page.next === after || page.items.length === 0)) throw new Error("Email migration page did not advance");
      rows.push(...page.items);
      after = page.next;
    } while (after !== null);
    return rows;
  }

  @tool("syncMigration", { entity: "email.address", description: "Read unresolved email sender synchronization choices.", params: { type: "object", properties: {}, additionalProperties: false } })
  async syncMigration(): Promise<SyncMigrationStatus> {
    const issues: SyncMigrationIssue[] = [];
    for (const row of await this.syncEntities()) {
      if (row.syncEnabled !== null && row.syncRevision !== null) continue;
      try {
        senderAddress(row.properties);
        issues.push({ target: { schemaId: ADDRESS_SCHEMA, key: row.id }, legacyIds: [row.id], accounts: [], message: "Synchronization choice has not been initialized" });
      } catch (error) {
        issues.push({ target: null, legacyIds: [row.id], accounts: [], message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { complete: issues.length === 0, issues };
  }

  @connectionReady()
  async onConnectionReady(): Promise<{ ok: boolean }> {
    for (const issue of (await this.syncMigration()).issues) {
      if (issue.target !== null) await this.graph.updateEntitySyncEnabled({ id: issue.target.key, syncEnabled: true });
    }
    await this.graph.syncState("apply");
    return { ok: true };
  }

  @writeTool("resolveSyncMigration", { entity: "email.address", description: "Choose synchronization for an unresolved sender address.", params: {
    type: "object", properties: {
      target: { type: "object", properties: { schemaId: { const: ADDRESS_SCHEMA }, key: { type: "string" } }, required: ["schemaId", "key"], additionalProperties: false },
      syncEnabled: { type: "boolean" },
    }, required: ["target", "syncEnabled"], additionalProperties: false,
  } })
  async resolveSyncMigration(params: ResolveSyncMigrationParams): Promise<SyncMigrationStatus> {
    const issue = (await this.syncMigration()).issues.find((item) => item.target?.key === params.target.key);
    if (params.target.schemaId !== ADDRESS_SCHEMA || issue === undefined) throw new Error("Email migration target is missing or already initialized");
    await this.graph.updateEntitySyncEnabled({ id: params.target.key, syncEnabled: params.syncEnabled });
    await this.graph.syncState("apply");
    return this.syncMigration();
  }

  private async syncCreationRule(): Promise<boolean> {
    const rule = (await this.graph.moduleSettings()).newSenderSyncEnabled;
    if (rule !== "true" && rule !== "false") throw new Error("Email newSenderSyncEnabled setting is missing or invalid");
    return rule === "true";
  }

  @rpc("sync.selection", { description: "Read saved exact-sender choices across email accounts.", params: {
    type: "object", properties: { sourceId: { type: "string" }, accountId: { type: "string" }, accountGeneration: { type: "integer" } },
    required: ["sourceId", "accountId", "accountGeneration"], additionalProperties: false,
  } })
  async syncSelection(_params: SyncSelectionRequest): Promise<SyncSelection> {
    const choices: SyncChoice[] = [];
    for (const row of await this.syncEntities()) {
      if (row.syncEnabled === null || row.syncRevision === null) throw new Error("Email synchronization migration is incomplete");
      if (!/^\d+$/.test(row.syncRevision)) throw new Error("Email sender has an invalid synchronization revision");
      choices.push({ id: row.id, scopeId: senderAddress(row.properties), syncEnabled: row.syncEnabled, syncRevision: row.syncRevision });
    }
    return { surface: "email", choices, unknownSenderEnabled: await this.syncCreationRule() };
  }

  @writeTool("setSyncEnabled", { entity: "email.address", description: "Start or stop receiving mail from this exact sender across threads and accounts.", params: {
    type: "object", properties: { id: { type: "string", format: "uuid" }, syncEnabled: { type: "boolean" } },
    required: ["id", "syncEnabled"], additionalProperties: false,
  } })
  async setSyncEnabled(params: SetSyncEnabledParams): Promise<SetSyncEnabledResult> {
    let syncRevision: string;
    try {
      const row = await this.graph.get_entity(params.id);
      if (row?.schema_id !== ADDRESS_SCHEMA) throw new Error("Synchronization target is not an email address");
      ({ syncRevision } = await this.graph.updateEntitySyncEnabled(params));
    } catch (error) {
      return { results: [{ identityId: params.id, targetId: params.id, kind: "failed", message: error instanceof Error ? error.message : String(error) }] };
    }
    const saved = { identityId: params.id, targetId: params.id, kind: "saved" as const, syncEnabled: params.syncEnabled, syncRevision };
    try {
      await this.graph.syncState("apply");
      return { results: [{ ...saved, application: { kind: "pending" } }] };
    } catch (error) {
      return { results: [{ ...saved, application: { kind: "failed", message: error instanceof Error ? error.message : String(error) } }] };
    }
  }

  @rpc("sync.status", {
    description: "List the email sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncStatus(): Promise<Record<string, unknown>> {
    return this.graph.syncState("status");
  }

  @rpc("sync.reset", {
    description:
      "Reset email sync: delete the caller's email messages and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncReset(): Promise<Record<string, unknown>> {
    // Namespace-guarded by the host: reset only clears the caller's own
    // email.message entities — telegram.message and others are untouched.
    return this.graph.syncState("reset", MESSAGE_SCHEMA);
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
    const syncEnabled = await this.syncCreationRule();
    for (const [i, lower] of lowers.entries()) {
      if (seen.has(lower)) continue;
      seen.add(lower);
      const item = items[i];
      entities.push(addressBatchEntity(lower, lower, item?.display_name ?? null, syncEnabled));
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
  /// AND be a `file.object` whose dictionary names it. A non-file or
  /// nameless entity is rejected (NO fallback name) so only real files can be
  /// attached/linked.
  /// Returns the per-file display names in input order.
  private async resolveOwnedFileNames(fileIds: string[]): Promise<string[]> {
    const names: string[] = [];
    for (const fid of fileIds) {
      const det = await this.graph.get_entity_full(fid, { links: false });
      if (!det) throw new Error(`file ${fid} not found`);
      if (det.entity.schema_id !== "file.object") throw new Error(`file ${fid} not found`);
      const fd = ((det.entity as { properties?: unknown }).properties ?? {}) as Data;
      names.push(typeof fd.name === "string" ? fd.name : "attachment");
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

    // Attachment ownership + names (native put attachment_names on the record;
    // it required a file dictionary — rejected otherwise, no fallback name).
    const attachmentNames = await this.resolveOwnedFileNames(attachmentIds);
    const addressSyncEnabled = await this.syncCreationRule();
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

    const messageDict: Record<string, unknown> = {
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
            // matches on the anchor and nothing else. Carrying it
            // here is what makes the copy arriving from Sent UPDATE this entity
            // instead of creating a second one. Without it every sent email
            // exists in the graph twice.
            idx: providerThreadId ?? undefined,
            date: now,
            // S5: the sent copy is a node with a DICT under the provider's own
            // id as its anchor — that anchor is what makes the copy arriving
            // from Sent update THIS node instead of creating a second one.
            anchor: providerMessageId,
            properties: messageDict,
          },
          addressBatchEntity(addrKey, toLower, null, addressSyncEnabled),
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
