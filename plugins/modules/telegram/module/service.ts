// Telegram plugin — backend module (read path, Stage 1). Runs in the V8
// isolate. Ports the native chat_resolver/service read logic: chat list
// (pinned-first, search, top-10 inlined messages), chat-scoped + global message
// list, message detail, set_indexed. Output is byte-compatible with the native
// module (MessageListItem / MessageDetailView / TelegramChatListItem).
//
// Deferred to the Stage 6 frontend cutover (read-time enrichments, verified
// visually there, NOT asserted by any backend test):
//   - link-resolved sender names (native resolve_linked_names "telegram.message:person");
//     Stage 1 uses the facet's own sender_name, which ingest writes.
//   - filesystem avatar resolution (native resolve_sender_avatar_fs / resolve_chat_avatar_fs);
//     Stage 1 uses the facet's avatar_url / photo_url.
//   - message-detail canonical map + linked_entities (Context panel).

import { rpc, syncHandler, tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  BatchRefInput,
  PaginatedResponse,
  RawEntity,
  RpcExecutor,
} from "@magnis/plugin-sdk";
import type {
  BackfillParams,
  BatchSendParams,
  ChatsListParams,
  FacetSummary,
  GetParams,
  MessageDetailView,
  MessageListItem,
  MessagesListParams,
  ReplyParams,
  SendParams,
  SetIndexedParams,
  SetTriggerParams,
  SyncEnvelope,
  TelegramCanonical,
  TelegramChatListItem,
  TelegramFacets,
} from "../types/index.ts";
import { runBatchSend } from "./batchSend.ts";

const CHAT_SCHEMA = "telegram.chat";
const CHAT_DETAILS = "telegram.chat.details";
const MESSAGE_SCHEMA = "telegram.message";
const MESSAGE_DETAILS = "telegram.message.details";
// Cross-module contact (DEC-10): telegram mints contacts.person from senders.
const PERSON_SCHEMA = "contacts.person";
const CONTACT_FACET = "telegram.contact";
const PERSON_CHAT_LINK = "person:telegram.chat";
// Groups above this member count don't auto-create contacts (native default).
const INDEXING_THRESHOLD = 100;

// PGlite is single-connection, so a sync page (the telegram dialog list is ONE
// ~2400-chat page) must be applied in CHUNKS: at most this many entities per
// graph.apply_batch, so each transaction is short and the lone DB connection is
// freed between batches. Without this, one dispatch monopolizes the connection and
// every other RPC (frontend polls, search indexer) times out.
const INGEST_CHUNK = 200;
// Above this many chats in a page = a bootstrap dialog list → batch + chunk them.
// At/below = a re-sync; keep the per-envelope path that merges last_message_* into
// chat.details (the connector snapshot doesn't carry those fields).
const CHAT_BATCH_THRESHOLD = 50;

/// A trigger.check event the host PluginModuleController bridge forwards to the
/// event_bus for LIVE messages (mirrors native ingest.rs). The trigger
/// evaluator consumes it; bulk Snapshot/backfill ingests never emit one.
interface TriggerCheck {
  type: "trigger.check";
  event_kind: "new_message";
  schema_id: string;
  entity_id: string;
  phase: "live";
  touched_entity_ids: string[];
  user_id: string;
  context: { text: string; sender_name: string };
}

type Data = Record<string, unknown>;
const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};
const num = (d: Data, k: string): number | null => (typeof d[k] === "number" ? (d[k] as number) : null);
const boolFlag = (d: Data, k: string): boolean | null => {
  const v = d[k];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return null;
};
const chatIdStr = (d: Data): string => {
  const v = d.chat_id;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
};
// http(s) URLs in free text, trailing punctuation trimmed.
const URL_RE = /https?:\/\/[^\s<>"']+/g;
function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    out.push(m[0].replace(/[.,;:!?)\]}>"']+$/, ""));
  }
  return out;
}

/// Map a telegram media_type to a MIME type. Mirrors the host's
/// `media_type_to_mime` (backend/src/services/file/types.rs) so the plugin can
/// build a source-agnostic file_register command (DEC: file.object survives the
/// cutover).
function mediaTypeToMime(mediaType: string): string {
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

export class TelegramModule {
  private readonly graph: GraphService<TelegramFacets, TelegramCanonical>;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<TelegramFacets, TelegramCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  private async detailsFacet(entityId: string, schema: string): Promise<Data | null> {
    const facets = await this.graph.list_facets_for_entity(entityId);
    const f = facets.find((x) => x.schema_id === schema);
    return (f?.data as Data | undefined) ?? null;
  }

  // ── chats.list ────────────────────────────────────────────────
  private buildChatItem(entity: RawEntity, d: Data): TelegramChatListItem {
    const avatar = str(d, "avatar_url") ?? str(d, "photo_url");
    return {
      schema_id: CHAT_SCHEMA,
      entity_id: entity.id,
      chat_id: chatIdStr(d),
      chat_title: str(d, "title"),
      last_message: str(d, "last_message_preview"),
      last_message_time: typeof d.last_message_date === "string" ? (d.last_message_date as string) : null,
      last_message_sender: str(d, "last_sender_name"),
      is_outgoing: null,
      message_count: null,
      avatar_url: avatar,
      is_pinned: boolFlag(d, "is_pinned") ?? false,
      pin_order: num(d, "pin_order"),
      is_indexed: boolFlag(d, "is_indexed"),
    };
  }

  @tool("chats.list", {
    description: "List telegram chats (pinned first, then by last-message time desc). Optional name search.",
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
  async chatsList(params: ChatsListParams): Promise<PaginatedResponse<TelegramChatListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    if (search) {
      return this.searchChats(search, limit, offset);
    }

    // Postbox-style dialog window: the DB sorts (pinned, pin_order,
    // last_message_date DESC) and returns ONLY this page + the exact total in
    // one host hop. No load-all, no per-chat N+1, no in-app sort. This restores
    // the native `list_chat_dialog_window` (6s → 0.65s), lost when the plugin
    // was ported from the pre-windowed staging line.
    // P2 (graph-read-api §4): pinned-first then recent, ordered by FACET fields
    // (pins live in the chat facet, not entity columns), render facet inline, one
    // statement. Replaces the telegram-specific list_chat_dialog_window.
    const page = await this.graph.list_entities_window({
      schema: CHAT_SCHEMA,
      facet_schema: CHAT_DETAILS,
      order: [
        { field: { facet_schema: CHAT_DETAILS, facet_path: "is_pinned" }, desc: true },
        { field: { facet_schema: CHAT_DETAILS, facet_path: "pin_order" }, desc: false },
        { field: { facet_schema: CHAT_DETAILS, facet_path: "last_message_date" }, desc: true },
      ],
      limit,
      offset,
    });
    const items = page.items.map(({ entity, data }) =>
      this.buildChatItem(entity, (data ?? {}) as Data),
    );
    return { items, total: page.total, limit, offset };
  }

  /// Name search over the user's chats — native `search_chats`: user-scoped
  /// name match (ILIKE) + manual offset, then the matched chats' details facets
  /// to build the rows. Search results are name-ranked, not pinned-sorted.
  private async searchChats(
    query: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<TelegramChatListItem>> {
    const matches = await this.graph.search_entities_by_name({
      query,
      schema_ids: [CHAT_SCHEMA],
      limit: limit + offset,
    });
    const total = matches.length;
    const page = matches.slice(offset, offset + limit);
    const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
    const detailsByEntity = new Map<string, Data>();
    for (const f of facets) {
      // Batch is ordered observed_at DESC → first seen per entity is the latest.
      if (f.schema_id === CHAT_DETAILS && f.entity_id && !detailsByEntity.has(f.entity_id)) {
        detailsByEntity.set(f.entity_id, f.data as Data);
      }
    }
    const items: TelegramChatListItem[] = [];
    for (const e of page) {
      const d = detailsByEntity.get(e.id);
      if (d) items.push(this.buildChatItem(e, d));
    }
    return { items, total, limit, offset };
  }

  // ── messages.list ─────────────────────────────────────────────
  @tool("messages.list", {
    description: "List telegram messages, newest first. Filter by chat_id (or entity_id of the chat); omit to list all.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        entity_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        offset: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
  })
  async messagesList(params: MessagesListParams): Promise<PaginatedResponse<MessageListItem>> {
    // HARD CAP (max 50): a chat reader must never dump a whole history into the
    // agent context (the 37,904-message bug). Clamp server-side regardless of
    // what the caller asks. For date-windowed retrieval use graph.find.
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 50);
    const offset = params.offset ?? 0;

    // Resolve chat_id: explicit chat_id, else entity_id → chat.details.chat_id.
    let chatId: string | null = params.chat_id != null ? String(params.chat_id) : null;
    if (chatId === null && params.entity_id) {
      const d = await this.detailsFacet(params.entity_id, CHAT_DETAILS);
      if (d) chatId = chatIdStr(d) || null;
    }

    if (chatId !== null) {
      return this.messagesForChat(chatId, limit, offset);
    }
    // No chat filter → all of the user's telegram messages. ONE bulk facet read
    // (not a per-message detailsFacet), same anti-N+1 shape as searchChats.
    const page = await this.graph.list_entities({ schema_id: MESSAGE_SCHEMA, limit, offset });
    const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
    const byId = new Map<string, Data>();
    for (const f of facets) {
      if (f.schema_id === MESSAGE_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
        byId.set(f.entity_id, f.data as Data);
      }
    }
    const items = page.items.map((e) => this.buildMessageItem(e, byId.get(e.id) ?? {}));
    return { items, total: page.total, limit, offset };
  }

  private async messagesForChat(
    chatId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<MessageListItem>> {
    // P2 (graph-read-api §4): ONE statement — filter by entity-col idx (= chat_id,
    // index-covered), order by entity-col date DESC, render facet inline. Kills the
    // old ~2N hops (op find_entity_for_user + per-message detailsFacet).
    const page = await this.graph.list_entities_window({
      schema: MESSAGE_SCHEMA,
      facet_schema: MESSAGE_DETAILS,
      filter_field: { entity_field: "idx" },
      filter_eq: chatId,
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset,
    });
    const items = page.items.map(({ entity, data }) =>
      this.buildMessageItem(entity, (data ?? {}) as Data),
    );
    return { items, total: page.total, limit, offset };
  }

  private buildMessageItem(entity: RawEntity, d: Data): MessageListItem {
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      // Native: canonical telegram.message.sender (mapped from sender_name) OR
      // the link-resolved name (deferred). The facet's sender_name is the same source.
      sender: str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      preview: null,
      channel: "telegram",
      timestamp: typeof d.date === "string" ? (d.date as string) : created,
      created_at: created,
      metadata: d,
    };
  }

  // ── messages.get ──────────────────────────────────────────────
  @tool("messages.get", {
    description: "Get a single telegram message detail by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async messagesGet(params: GetParams): Promise<MessageDetailView> {
    // P1 (graph-read-api §4): entity + its facets in ONE fetch, user-scoped.
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== MESSAGE_SCHEMA) {
      throw new Error(`${MESSAGE_SCHEMA} ${params.id} not found`);
    }
    const { entity, facets } = detail;
    const d = (facets.find((f) => f.schema_id === MESSAGE_DETAILS)?.data as Data | undefined) ?? {};
    const facetSummaries: FacetSummary[] = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data,
    }));
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      body: str(d, "text"),
      channel: "telegram",
      timestamp: typeof d.date === "string" ? (d.date as string) : created,
      canonical: {},
      facets: facetSummaries,
      linked_entities: [],
      created_at: created,
      metadata: d,
    };
  }

  // ── chats.set_indexed (RPC-only, frontend toggle) ─────────────
  @rpc("chats.set_indexed", {
    description: "Mark a telegram chat indexed/unindexed (controls message indexing for search).",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        is_indexed: { type: "boolean" },
      },
      required: ["chat_id", "is_indexed"],
      additionalProperties: false,
    },
  })
  async chatsSetIndexed(params: SetIndexedParams): Promise<{ status: string }> {
    const found = await this.graph.list_entities_by_facet_field({
      entity_schema: CHAT_SCHEMA,
      facet_schema: CHAT_DETAILS,
      field_path: "$.chat_id",
      field_value: String(params.chat_id),
      limit: 1,
      offset: 0,
    });
    const entity = found.items[0];
    if (!entity) throw new Error(`chat ${String(params.chat_id)} not found`);
    // Patch the chat's details facet IN PLACE (update_facet by id) — attach_facet
    // would spawn a duplicate since the plugin sets no external_id, and
    // is_indexed is not a canonical-mapped field (so a dup would hide the toggle).
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const chatFacet = facets.find((f) => f.schema_id === CHAT_DETAILS);
    if (!chatFacet) throw new Error(`chat ${String(params.chat_id)} has no ${CHAT_DETAILS} facet`);
    const existing = (chatFacet.data as Data | undefined) ?? {};
    await this.graph.update_facet({
      facet_id: chatFacet.id,
      schema_id: CHAT_DETAILS,
      data: { ...existing, is_indexed: params.is_indexed } as TelegramFacets["telegram.chat.details"],
    });
    return { status: "ok" };
  }

  // ── sync control (RPC) ────────────────────────────────────────
  @rpc("sync.status", {
    description: "List the telegram sync state per account.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncStatus(): Promise<Record<string, unknown>> {
    return this.graph.sync_state("status");
  }

  @rpc("sync.reset", {
    description: "Reset telegram sync: delete the caller's telegram messages and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncReset(): Promise<Record<string, unknown>> {
    // Pass our own message schema — op_sync_state clears it, scoped to the
    // telegram namespace (the op is generalised, no longer hard-coded).
    return this.graph.sync_state("reset", MESSAGE_SCHEMA);
  }

  // ── reply composer (RPC) ──────────────────────────────────────
  @rpc("composer.read", {
    description: "Read the telegram reply-composer presence for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async composerRead(): Promise<Record<string, unknown>> {
    return this.graph.composer("read");
  }

  @rpc("composer.set_text", {
    description: "Replace the telegram reply-composer text for a thread.",
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
    description: "Append to the telegram reply-composer text for a thread.",
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

  // ── sync ingest (@syncHandler) ────────────────────────────────
  // Invoked by the host PluginModuleController bridge (reserved
  // `telegram.__sync__`) for each telegram SourceEnvelope. Ports the native
  // ingest.rs find-or-create pipeline. Stage 2a covers chat + message entities
  // + facets + the message→chat link; contacts/media/web/delete land in 2b–2d.
  @syncHandler("telegram")
  async ingest(
    params: { envelopes?: SyncEnvelope[]; backfill_priority?: { chat_ids?: string[] } },
  ): Promise<
    | { ok: boolean; dropped_remote_ids: string[]; trigger_checks: TriggerCheck[] }
    | { priority: string[] }
  > {
    // The scheduler reuses this reserved sync method to ask which chats are
    // high-priority for backfill (pinned/indexed) — it can't see chat metadata
    // itself. Branch out before the ingest path.
    if (params?.backfill_priority) {
      return this.backfillPriority(params.backfill_priority.chat_ids ?? []);
    }
    // Stage 3: the host bridge dispatches a WHOLE page of envelopes in one call.
    // Chat snapshots + deletes stay per-envelope (few, field-merge / cascade); the
    // message bulk collapses to ONE graph.apply_batch (the native per-message
    // find→create→attach→link pipeline is what made bootstrap take ~5.6h).
    const envelopes = Array.isArray(params?.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];
    const triggers: TriggerCheck[] = [];
    const chats: { env: SyncEnvelope; payload: Data }[] = [];
    const messages: { env: SyncEnvelope; payload: Data }[] = [];

    for (const env of envelopes) {
      const kind = env.kind;
      if (kind === "delete") {
        try {
          await this.ingestDelete(env);
        } catch {
          if (env.remote_id) dropped.push(env.remote_id);
        }
        continue;
      }
      if (kind !== "snapshot" && kind !== "live") continue;
      const payload = (env.payload ?? {}) as Data;
      const entityType = typeof payload.entity_type === "string" ? payload.entity_type : "message";
      if (entityType === "chat" || entityType === "telegram_chat") chats.push({ env, payload });
      else messages.push({ env, payload });
    }

    // Chats: a big page (the bootstrap dialog list) is batched + CHUNKED so it never
    // monopolizes the single PGlite connection; a small page (re-sync) keeps the
    // per-envelope path that merges last_message_* into chat.details.
    if (chats.length > CHAT_BATCH_THRESHOLD) {
      await this.ingestChatBatch(chats);
    } else {
      for (const { env, payload } of chats) {
        try {
          await this.ingestChat(env, payload);
        } catch {
          if (env.remote_id) dropped.push(env.remote_id);
        }
      }
    }

    // Messages in CHUNKS — one apply_batch per chunk, so the connection is freed
    // between batches (a bootstrap message page can be thousands of messages).
    for (let i = 0; i < messages.length; i += INGEST_CHUNK) {
      await this.ingestMessageBatch(messages.slice(i, i + INGEST_CHUNK), triggers);
      await Promise.resolve(); // yield between chunks so waiting RPCs get the connection
    }

    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }

  // Bulk chat ingest for the bootstrap dialog list (one huge page). Batches chat
  // entities + chat.details facets in CHUNKS, freeing the single PGlite connection
  // between batches. No last_message_* merge here: bootstrap chats are new and the
  // connector snapshot has no last-message fields anyway — ingestMessageBatch
  // denormalizes them onto chat.details when messages arrive.
  private async ingestChatBatch(chats: { env: SyncEnvelope; payload: Data }[]): Promise<void> {
    for (let i = 0; i < chats.length; i += INGEST_CHUNK) {
      const entities: BatchEntityInput[] = [];
      for (const { env, payload } of chats.slice(i, i + INGEST_CHUNK)) {
        const remoteId = env.remote_id;
        if (!remoteId) continue;
        const details: Data = { ...payload };
        delete details.entity_type;
        entities.push({
          key: remoteId,
          schema_id: CHAT_SCHEMA,
          name: typeof payload.title === "string" ? payload.title : "",
          facets: [{ schema_id: CHAT_DETAILS, data: details, external_id: remoteId, confidence: 100 }],
        });
      }
      if (entities.length > 0) {
        await this.graph.apply_batch({ entities, refs: [], links: [] });
      }
      await Promise.resolve(); // yield between chunks so waiting RPCs get the connection
    }
  }

  // Bulk message ingest: the whole page becomes ONE graph.apply_batch (message
  // entities + details facets + chat refs + sender contacts + links). Unique chats
  // and senders are read ONCE (not per message), so this kills F1 (the per-message
  // list_links scan — links now dedup via the batch's ON CONFLICT), F2 (per-message
  // chat/sender reads), and F3 (op-per-op). Web/file registration + the chat
  // last-message denorm run after apply (they need the resolved entity id).
  private async ingestMessageBatch(
    messages: { env: SyncEnvelope; payload: Data }[],
    triggers: TriggerCheck[],
  ): Promise<void> {
    // 1. Read each unique chat's entity id + details ONCE (shouldIndex gate + denorm base).
    const chatEntityId = new Map<string, string | null>();
    const chatDetails = new Map<string, Data | null>();
    for (const { payload } of messages) {
      const cid = payload.chat_id;
      if (cid == null) continue;
      const key = String(cid);
      if (chatEntityId.has(key)) continue;
      const eid = await this.graph.find_by_external_id(`tg:chat:${key}`);
      chatEntityId.set(key, eid);
      chatDetails.set(key, eid ? await this.detailsFacet(eid, CHAT_DETAILS) : null);
    }
    // 2. Resolve each unique sender ONCE (exists → ref + link; new → create-if-indexed).
    const senderExists = new Map<number, boolean>();
    for (const { payload } of messages) {
      const sid = payload.sender_id;
      if (typeof sid !== "number" || senderExists.has(sid)) continue;
      senderExists.set(sid, (await this.graph.find_by_external_id(`tg:user:${sid}`)) != null);
    }

    // 3. Build the fragment.
    const entities: BatchEntityInput[] = [];
    const refs: BatchRefInput[] = [];
    const links: BatchLinkInput[] = [];
    const refKeys = new Set<string>();
    const personEntityKeys = new Set<string>();
    const linkSeen = new Set<string>();
    const addRef = (key: string, ext: string): void => {
      if (!refKeys.has(key) && !personEntityKeys.has(key)) {
        refs.push({ key, external_id: ext });
        refKeys.add(key);
      }
    };
    const addLink = (from_key: string, to_key: string, kind: string): void => {
      const k = `${from_key} ${to_key} ${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind });
        linkSeen.add(k);
      }
    };

    for (const { env, payload } of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const text = str(payload, "text") ?? "";
      const cid = payload.chat_id;
      const chatKey = cid != null ? `chat:${String(cid)}` : null;

      entities.push({
        key: remoteId,
        schema_id: MESSAGE_SCHEMA,
        name: text.slice(0, 80),
        idx: cid != null ? String(cid) : undefined,
        date: str(payload, "date") ?? undefined,
        facets: [{ schema_id: MESSAGE_DETAILS, data: payload, external_id: remoteId, confidence: 100 }],
      });

      if (cid != null && chatKey) {
        addRef(chatKey, `tg:chat:${String(cid)}`);
        addLink(remoteId, chatKey, "telegram.message:telegram.chat");
      }

      const sid = payload.sender_id;
      if (typeof sid === "number") {
        const personKey = `user:${sid}`;
        const userExt = `tg:user:${sid}`;
        const details = cid != null ? chatDetails.get(String(cid)) ?? null : null;
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
              schema_id: PERSON_SCHEMA,
              name: str(payload, "sender_name") ?? "",
              facets: [
                {
                  schema_id: CONTACT_FACET,
                  data: this.buildContactData(sid, payload, chatType),
                  external_id: userExt,
                  confidence: 90,
                },
              ],
            });
            personEntityKeys.add(personKey);
          }
          linkPerson = true;
        }
        if (linkPerson) {
          addLink(remoteId, personKey, "telegram.message:person");
          if (chatKey) addLink(personKey, chatKey, PERSON_CHAT_LINK);
        }
      }
    }

    // 4. Apply the whole page in one transaction (throws → page retried by the host).
    const result = await this.graph.apply_batch({ entities, refs, links });

    // 5. Post-apply (needs the resolved message id): URLs, media, live triggers, and
    //    track the newest message per chat for the denorm.
    const newestPerChat = new Map<string, Data>();
    for (const { env, payload } of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const entityId = result.ids[remoteId];
      if (!entityId) continue;

      const msgText = str(payload, "text") ?? "";
      for (const url of extractUrls(msgText)) {
        await this.graph.web_register({ url, parent_entity_id: entityId, link_kind: "references" });
      }
      const mediaType = str(payload, "media_type");
      const mChatId = num(payload, "chat_id");
      const mMessageId = num(payload, "message_id");
      if (mediaType && payload.source_ref != null && mChatId != null && mMessageId != null) {
        // is_indexed gates the byte fetch, not the entity: a non-indexed chat
        // still registers the file.object (the message keeps its attachment) but
        // skips the download — it is pulled on demand when the user opens it.
        const fileChatDetails = chatDetails.get(String(mChatId)) ?? null;
        await this.graph.file_register({
          external_id: `file:telegram:${mChatId}:${mMessageId}`,
          parent_external_id: remoteId,
          link_kind: "telegram.message:file",
          name: str(payload, "file_name") ?? undefined,
          mime_type: mediaTypeToMime(mediaType),
          source_ref: payload.source_ref as Record<string, unknown>,
          // The host file worker routes download_file by (source_module,
          // source_surface) — stamp the envelope's ACTUAL source_id, never a
          // hardcoded name: the surface may be served by a differently-named
          // connector (telegram-ts), and "telegram" would route to a runtime
          // that doesn't exist ("no source runtime for (telegram, telegram)").
          source_module: env.source_id,
          source_surface: "telegram",
          download: this.shouldIndex(fileChatDetails),
        });
      }

      const cid = payload.chat_id;
      if (cid != null) {
        const key = String(cid);
        const cur = newestPerChat.get(key);
        if (!cur || (str(payload, "date") ?? "") >= (str(cur, "date") ?? "")) {
          newestPerChat.set(key, payload);
        }
      }

      if (env.kind === "live") {
        const touched = [entityId];
        if (cid != null) {
          const ck = result.ids[`chat:${String(cid)}`];
          if (ck) touched.push(ck);
        }
        const sid = payload.sender_id;
        if (typeof sid === "number") {
          const pk = result.ids[`user:${sid}`];
          if (pk) touched.push(pk);
        }
        triggers.push({
          type: "trigger.check",
          event_kind: "new_message",
          schema_id: MESSAGE_SCHEMA,
          entity_id: entityId,
          phase: "live",
          touched_entity_ids: touched,
          user_id: env.user_id,
          context: { text: str(payload, "text") ?? "", sender_name: str(payload, "sender_name") ?? "" },
        });
      }
    }

    // 6. Denorm each unique chat's last-message fields onto its full details (so the
    //    title etc. survive). Present-to-past sync ingests newest-first → newest wins.
    for (const [key, msg] of newestPerChat) {
      const base = chatDetails.get(key);
      const eid = chatEntityId.get(key);
      if (!base || !eid) continue;
      const msgDate = str(msg, "date") ?? "";
      if (!msgDate) continue;
      const curDate = str(base, "last_message_date") ?? "";
      if (curDate && msgDate < curDate) continue;
      await this.graph.attach_facet({
        entity_id: eid,
        schema_id: CHAT_DETAILS,
        data: {
          ...base,
          last_message_date: msgDate,
          last_message_preview: str(msg, "text") ?? "",
          last_sender_name: str(msg, "sender_name") ?? "",
        } as TelegramFacets["telegram.chat.details"],
        external_id: `tg:chat:${key}`,
        confidence: 100,
      });
    }
  }

  // Build a telegram.contact facet from a message sender (extracted from the
  // per-message ingestSenderContact so the batch path reuses the exact shape).
  private buildContactData(senderId: number, payload: Data, chatType: string | null): Data {
    const tier = chatType === "private" ? "inner" : "group";
    const info =
      payload.sender_info && typeof payload.sender_info === "object" ? (payload.sender_info as Data) : {};
    const data: Data = {
      telegram_user_id: senderId,
      relevance_tier: tier,
      first_name: str(info, "first_name") ?? str(payload, "sender_name") ?? "",
    };
    const lastName = str(info, "last_name");
    const username = str(info, "username");
    const phone = str(info, "phone");
    if (lastName) data.last_name = lastName;
    if (username) data.username = username;
    if (phone) data.phone = phone;
    return data;
  }

  // Delete the entity behind a remote_id (user-scoped). Mirrors native
  // ingest_delete; delete_entity cascades the entity's facets + links.
  private async ingestDelete(envelope: SyncEnvelope): Promise<void> {
    const remoteId = envelope.remote_id;
    if (!remoteId) return;
    const entityId = await this.graph.find_by_external_id(remoteId);
    if (entityId) await this.graph.delete_entity(entityId);
  }

  private async ingestChat(envelope: SyncEnvelope, payload: Data): Promise<void> {
    const remoteId = envelope.remote_id;
    if (!remoteId) return;
    let entityId = await this.graph.find_by_external_id(remoteId);
    // Preserve any last-message fields already denormalized onto this chat by
    // ingestMessage — the incoming snapshot doesn't carry them, so a plain
    // re-attach would wipe the chat's preview + recency key on every re-sync.
    const existing = entityId ? await this.detailsFacet(entityId, CHAT_DETAILS) : null;
    if (!entityId) {
      const title = typeof payload.title === "string" ? payload.title : "";
      const created = await this.graph.create_entity({ schema_id: CHAT_SCHEMA, name: title });
      entityId = created.id;
    }
    // The chat.details facet carries everything except the routing discriminant.
    const details: Data = { ...payload };
    delete details.entity_type;
    if (existing) {
      for (const k of ["last_message_date", "last_message_preview", "last_sender_name"]) {
        if (existing[k] != null && details[k] == null) details[k] = existing[k];
      }
    }
    await this.graph.attach_facet({
      entity_id: entityId,
      schema_id: CHAT_DETAILS,
      data: details as TelegramFacets["telegram.chat.details"],
      external_id: remoteId,
      confidence: 100,
    });
  }

  private async ingestMessage(
    envelope: SyncEnvelope,
    payload: Data,
  ): Promise<{ entityId: string; chatEntityId: string | null; personId: string | null } | null> {
    const remoteId = envelope.remote_id;
    if (!remoteId) return null;
    let entityId = await this.graph.find_by_external_id(remoteId);
    // createdFresh drives the A5 orphan-rollback below (a fresh entity whose
    // facet fails to attach must be deleted). Native ingest had no re-sync skip:
    // a re-delivered message re-runs enrichment (idempotent facet upsert + denorm
    // + person link). The windowed chats.list removed the DB contention that the
    // old Fix-B skip was papering over, so re-runs are cheap and correct again.
    const createdFresh = entityId == null;
    if (!entityId) {
      const text = typeof payload.text === "string" ? payload.text : "";
      const name = text.slice(0, 80);
      const idx = payload.chat_id != null ? String(payload.chat_id) : undefined;
      // Date the entity by the MESSAGE date (native parity): with idx=chat_id it
      // feeds the chat index entities(schema_id, idx, date DESC).
      const date = typeof payload.date === "string" ? payload.date : undefined;
      const created = await this.graph.create_entity({ schema_id: MESSAGE_SCHEMA, name, idx, date });
      entityId = created.id;
    }
    try {
      await this.graph.attach_facet({
        entity_id: entityId,
        schema_id: MESSAGE_DETAILS,
        data: payload as TelegramFacets["telegram.message.details"],
        external_id: remoteId,
        confidence: 100,
      });
    } catch (err) {
      // A5: a fresh message entity was created above but its required details
      // facet failed to attach — roll back the orphan. Without its external-id
      // facet a retry would never find it (find_by_external_id) and would mint
      // ANOTHER orphan each time. Then rethrow so the caller skips this envelope
      // cleanly (INV-19 backfill tolerance).
      if (createdFresh) {
        await this.graph.delete_entity(entityId).catch(() => undefined);
      }
      throw err;
    }

    // Register any URLs in the message text as web.link entities (referenced
    // by the message). Mirrors native ingest's web.extractor pass.
    const msgText = typeof payload.text === "string" ? (payload.text as string) : "";
    for (const url of extractUrls(msgText)) {
      await this.graph.web_register({ url, parent_entity_id: entityId, link_kind: "references" });
    }

    // Register downloadable media as a file.object (mirrors native ingest's
    // file_service.register). Gate: both media_type and source_ref present —
    // non-downloadable types (web page, contact, geo, poll) carry a media_type
    // but no source_ref, so they register no file.
    const mediaType = str(payload, "media_type");
    const mChatId = num(payload, "chat_id");
    const mMessageId = num(payload, "message_id");
    if (mediaType && payload.source_ref != null && mChatId != null && mMessageId != null) {
      await this.graph.file_register({
        external_id: `file:telegram:${mChatId}:${mMessageId}`,
        parent_external_id: remoteId,
        link_kind: "telegram.message:file",
        name: str(payload, "file_name") ?? undefined,
        mime_type: mediaTypeToMime(mediaType),
        source_ref: payload.source_ref as Record<string, unknown>,
        // Envelope source_id, never hardcoded — see ingestMessageBatch.
        source_module: envelope.source_id,
        source_surface: "telegram",
      });
    }

    // Resolve the message's chat (same owner; user-scoped find) for the link
    // + the contact tier/index gate. Read its details once and reuse them for
    // both the last-message denormalization and the sender-contact tier gate.
    let chatEntityId: string | null = null;
    let chatDetails: Data | null = null;
    const chatId = payload.chat_id;
    if (chatId != null) {
      chatEntityId = await this.graph.find_by_external_id(`tg:chat:${String(chatId)}`);
      if (chatEntityId) {
        await this.graph.add_link({
          from_id: entityId,
          to_id: chatEntityId,
          kind: "telegram.message:telegram.chat",
        });
        chatDetails = await this.detailsFacet(chatEntityId, CHAT_DETAILS);
        await this.denormalizeChatLastMessage(chatEntityId, chatDetails, payload);
      }
    }

    // Cross-module contact from the message sender (DEC-10).
    let personId: string | null = null;
    const senderId = payload.sender_id;
    if (typeof senderId === "number") {
      personId = await this.ingestSenderContact(entityId, senderId, payload, chatEntityId, chatDetails);
    }
    return { entityId, chatEntityId, personId };
  }

  /// Denormalize the chat's latest message onto its details facet. The real
  /// connector's chat snapshot carries no last-message fields, so without this
  /// chats.list would have no preview and no recency key. Updates only when the
  /// incoming message is at least as new as the stored one — present-to-past
  /// sync ingests newest-first, so the first write per chat wins and older
  /// messages are skipped. O(1) per message; keeps chats.list O(page).
  private async denormalizeChatLastMessage(
    chatEntityId: string,
    chatDetails: Data | null,
    msg: Data,
  ): Promise<void> {
    if (!chatDetails) return;
    const msgDate = str(msg, "date") ?? "";
    if (!msgDate) return;
    const curDate = str(chatDetails, "last_message_date") ?? "";
    if (curDate && msgDate < curDate) return; // older than the stored last message
    const chatId = num(msg, "chat_id");
    if (chatId == null) return;
    await this.graph.attach_facet({
      entity_id: chatEntityId,
      schema_id: CHAT_DETAILS,
      data: {
        ...chatDetails,
        last_message_date: msgDate,
        last_message_preview: str(msg, "text") ?? "",
        last_sender_name: str(msg, "sender_name") ?? "",
      } as TelegramFacets["telegram.chat.details"],
      external_id: `tg:chat:${String(chatId)}`,
      confidence: 100,
    });
  }

  /// Mirror native `should_index_chat` (threshold 100): private chats always
  /// index; groups only when member_count ≤ threshold; an explicit is_indexed
  /// overrides; missing chat details defaults to indexed.
  // Backfill priority: of the given chats, return those that are pinned OR
  // indexed — the scheduler drains these to completion before the rest, so the
  // user's important chats get deep history first and a huge public group can't
  // hold up the queue. Missing details default to indexed (shouldIndex(null)).
  private async backfillPriority(chatIds: string[]): Promise<{ priority: string[] }> {
    if (chatIds.length === 0) return { priority: [] };
    const want = new Set(chatIds);
    // ONE host hop: pull every chat + its details (same windowed query chats.list
    // uses), then classify — instead of a find_by_external_id + detailsFacet N+1
    // per chat (which cost ~56s for 100 chats on the single PGlite connection).
    const page = await this.graph.list_entities_window({
      schema: CHAT_SCHEMA,
      facet_schema: CHAT_DETAILS,
      limit: 1_000_000,
      offset: 0,
    });
    const priority: string[] = [];
    for (const { data } of page.items) {
      const d = (data ?? {}) as Data;
      const cid = chatIdStr(d);
      if (!cid || !want.has(cid)) continue;
      if (boolFlag(d, "is_pinned") === true || this.shouldIndex(d)) priority.push(cid);
    }
    return { priority };
  }

  private shouldIndex(chatDetails: Data | null): boolean {
    if (!chatDetails) return true;
    const forced = boolFlag(chatDetails, "is_indexed");
    if (forced !== null) return forced;
    const type = str(chatDetails, "type") ?? "";
    if (type === "private") return true;
    const memberCount = num(chatDetails, "member_count");
    return memberCount !== null && memberCount <= INDEXING_THRESHOLD;
  }

  // Create/reuse a contacts.person from a message sender, gated by chat
  // indexing, and link message→person + person→chat. Existing senders
  // (by tg:user:<id>) are reused — never duplicated.
  private async ingestSenderContact(
    messageEntityId: string,
    senderId: number,
    payload: Data,
    chatEntityId: string | null,
    chatDetails: Data | null,
  ): Promise<string | null> {
    const userExt = `tg:user:${senderId}`;
    const chatType = chatDetails ? str(chatDetails, "type") : null;
    const tier = chatType === "private" ? "inner" : "group";

    let personId = await this.graph.find_by_external_id(userExt);
    if (!personId) {
      // Only mint a NEW contact when the chat is indexed (large groups don't).
      if (!this.shouldIndex(chatDetails)) return null;
      const senderName = str(payload, "sender_name");
      if (!senderName) return null;
      const info = (payload.sender_info && typeof payload.sender_info === "object")
        ? (payload.sender_info as Data)
        : {};
      // first_name is required on telegram.contact — fall back to the display name.
      const firstName = str(info, "first_name") ?? senderName;
      const person = await this.graph.create_entity({ schema_id: PERSON_SCHEMA, name: senderName });
      personId = person.id;
      const contactData: Data = {
        telegram_user_id: senderId,
        relevance_tier: tier,
        first_name: firstName,
      };
      const lastName = str(info, "last_name");
      const username = str(info, "username");
      const phone = str(info, "phone");
      if (lastName) contactData.last_name = lastName;
      if (username) contactData.username = username;
      if (phone) contactData.phone = phone;
      await this.graph.attach_facet({
        entity_id: personId,
        schema_id: CONTACT_FACET,
        data: contactData as TelegramFacets["telegram.contact"],
        external_id: userExt,
        confidence: 90,
      });
    }

    await this.graph.add_link({
      from_id: messageEntityId,
      to_id: personId,
      kind: "telegram.message:person",
    });
    if (chatEntityId) {
      const links = await this.graph.list_links_for_entity(personId);
      const already = links.some((l) => l.to_id === chatEntityId && l.kind === PERSON_CHAT_LINK);
      if (!already) {
        await this.graph.add_link({
          from_id: personId,
          to_id: chatEntityId,
          kind: PERSON_CHAT_LINK,
        });
      }
    }
    return personId;
  }

  // ── send / reply / backfill (source commands) ─────────────────
  @writeTool("messages.send", {
    description: "Send a Telegram message to a chat. May require approval before execution.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        text: { type: "string" },
        reply_to_message_id: { type: "integer" },
        account_id: { type: "string" },
      },
      required: ["chat_id", "text"],
      additionalProperties: false,
    },
  })
  async messagesSend(params: SendParams): Promise<Record<string, unknown>> {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }

  @writeTool("messages.reply", {
    description: "Reply to a specific Telegram message in a chat. May require approval before execution.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        reply_to_message_id: { type: "integer" },
        text: { type: "string" },
        account_id: { type: "string" },
      },
      required: ["chat_id", "reply_to_message_id", "text"],
      additionalProperties: false,
    },
  })
  async messagesReply(params: ReplyParams): Promise<Record<string, unknown>> {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }

  @writeTool("batch_send", {
    description:
      "Send Telegram messages to multiple recipients in one batch (1..50). Each message needs chat_id and text; reply_to_message_id is optional. ALWAYS include chat_name — the recipient's human display name (e.g. \"Dylan Dewdney\") — so the approval card shows who each message goes to instead of a raw chat_id. Use this for multi-recipient outreach so the user reviews ONE approval instead of N separate sends. Returns per-recipient results.",
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
              chat_name: { type: "string" },
            },
            required: ["chat_id", "text"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        account_id: { type: "string" },
      },
      required: ["messages"],
      additionalProperties: false,
    },
  })
  async messagesBatchSend(params: BatchSendParams): Promise<Record<string, unknown>> {
    const all = params.messages ?? [];
    if (all.length === 0 || all.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${all.length}`);
    }
    // The approval card applies per-message text edits into `messages` and lists
    // skipped recipients in `excluded_indices`; drop those before sending.
    const excluded = new Set(params.excluded_indices ?? []);
    const messages = all.filter((_, i) => !excluded.has(i));
    messages.forEach((m, i) => {
      if (m.chat_id == null || String(m.chat_id).length === 0) {
        throw new Error(`message[${i}]: missing chat_id`);
      }
      if (!m.text) throw new Error(`message[${i}]: missing text`);
    });
    if (messages.length === 0) {
      return { results: [], total: 0, sent: 0, failed: 0 };
    }

    // SEQUENTIAL per-recipient loop over the existing single-send path (mirrors
    // email.batch_send). Each send gets the connector's FLOOD_WAIT handling
    // (DEC-2); sequential pacing avoids a burst on the shared MTProto socket.
    // R3: runBatchSend isolates each send so a mid-batch failure (e.g. a long
    // FLOOD_WAIT) is recorded per-recipient and does NOT abort the batch — partial
    // progress is reported and a re-approval can't double-send the delivered ones.
    const outcome = await runBatchSend(messages, (m) =>
      this.sendMessage(m.chat_id, m.text, m.reply_to_message_id, params.account_id),
    );
    return { ...outcome };
  }

  // Route an Execute send_message command to the telegram source, then ingest
  // the sent message so it appears in the graph (mirrors native send + ingest).
  private async sendMessage(
    chatId: number | string,
    text: string,
    replyTo: number | undefined,
    accountId: string | undefined,
  ): Promise<Record<string, unknown>> {
    const payload: Data = { action: "send_message", chat_id: chatId, text };
    if (replyTo != null) payload.reply_to_message_id = replyTo;
    const result = await this.graph.source_command(payload, accountId);
    // The message is DELIVERED past this point. Local ingest + entity lookup are
    // best-effort enrichment: a failure here must NOT propagate as a send failure,
    // else a delivered message is reported "failed" (batch_send / single send) and
    // a manual retry double-sends it. The missing local copy is reconciled by the
    // normal sync, not by failing an already-delivered send (Codex round-2).
    try {
      const messageId = typeof result.message_id === "number" ? (result.message_id as number) : 0;
      const remoteId = `tg:msg:${String(chatId)}:${messageId}`;
      const sentPayload: Data = {
        message_id: messageId,
        chat_id: chatId,
        text,
        date: new Date().toISOString(),
        is_outgoing: true,
        sender_name: "You",
      };
      await this.ingestMessage(this.syntheticEnvelope(remoteId, sentPayload, accountId), sentPayload);
      const entityId = await this.graph.find_by_external_id(remoteId);
      return entityId ? { ...result, id: entityId } : result;
    } catch {
      return result;
    }
  }

  @rpc("messages.backfill", {
    description: "Fetch older messages for a telegram chat (backward pagination).",
    params: {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        before_message_id: { type: "integer" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        account_id: { type: "string" },
      },
      required: ["chat_id"],
      additionalProperties: false,
    },
  })
  async messagesBackfill(
    params: BackfillParams,
  ): Promise<{ count: number; skipped: number; pending: boolean }> {
    const payload: Data = {
      action: "backfill_chat",
      chat_id: params.chat_id,
      before_message_id: params.before_message_id ?? 0,
      limit: params.limit ?? 50,
    };
    // FIRE-AND-FORGET. The connector fetch is network-bound (the Telegram server
    // can take tens of seconds) and the plugin runs ALL its ops on ONE worker
    // channel (dispatcher.rs), so awaiting the fetch here would freeze every
    // other telegram read (`messages.list`/`chats.list`) behind it. Instead the
    // host runs fetch + ingest as a detached task and emits `sync.backfill` when
    // the page lands; the UI reloads on that event. We return immediately.
    await this.graph.request_backfill(payload, params.account_id);
    return { count: 0, skipped: 0, pending: true };
  }

  // ── triggers ──────────────────────────────────────────────────
  @writeTool("set_trigger", {
    description:
      "Set up an automated reaction to incoming Telegram messages in a chat. When a matching message arrives, the action executes automatically.",
    params: {
      type: "object",
      properties: {
        chat_id: { type: "integer", description: "Telegram chat ID to watch" },
        gate_prompt: { type: "string", description: "Condition to check on incoming message" },
        action_prompt: { type: "string", description: "What to do when the condition matches" },
        debounce_seconds: { type: "integer", description: "0=immediate (default), >0=batch within window" },
        episode_id: { type: "string", format: "uuid", description: "Parent episode for context" },
      },
      required: ["chat_id", "gate_prompt", "action_prompt"],
      additionalProperties: false,
    },
  })
  async setTrigger(params: SetTriggerParams): Promise<unknown> {
    const chatExt = `tg:chat:${String(params.chat_id)}`;
    const chatEntityId = await this.graph.find_by_external_id(chatExt);
    if (!chatEntityId) {
      throw new Error(`Telegram chat ${String(params.chat_id)} not found. Sync messages first.`);
    }
    // Delegate to the triggers module via the cross-module hub (rpc_calls).
    return this.rpc.execute("triggers.create", {
      name: `Telegram trigger: chat ${String(params.chat_id)}`,
      watch_entity_ids: [chatEntityId],
      gate_prompt: params.gate_prompt,
      action_prompt: params.action_prompt,
      schema_filter: "telegram",
      debounce_seconds: params.debounce_seconds ?? 0,
      episode_id: params.episode_id ?? null,
    });
  }

  // Build a SyncEnvelope for re-ingesting a message produced by a source
  // command (send result / backfill batch). user_id is empty here — the graph
  // ops are owner-scoped by the dispatch ModuleContext, not this field.
  private syntheticEnvelope(remoteId: string, payload: Data, accountId: string | undefined): SyncEnvelope {
    return {
      source_id: "telegram",
      surface: "telegram",
      account_id: accountId ?? "default",
      user_id: "",
      kind: "live",
      remote_id: remoteId,
      payload,
      timestamp: "",
    };
  }
}
