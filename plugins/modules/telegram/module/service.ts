// Telegram plugin — backend module (read path, Stage 1). Runs in the V8
// isolate. Ports the native chat_resolver/service read logic: chat list
// (pinned-first, search, top-10 inlined messages), chat-scoped + global message
// list, message detail, set_indexed. Output is byte-compatible with the native
// module (MessageListItem / MessageDetailView / TelegramChatListItem).
//
// Deferred to the Stage 6 frontend cutover (read-time enrichments, verified
// visually there, NOT asserted by any backend test):
//   - link-resolved sender names (native resolve_linked_names "telegram.message:person");
//     Stage 1 uses the record's own sender_name, which ingest writes.
//   - filesystem avatar resolution (native resolve_sender_avatar_fs / resolve_chat_avatar_fs);
//     Stage 1 uses the record's avatar_url / photo_url.
//   - message-detail canonical map + linked_entities (Context panel).

import { connectionReady, reachedEndpoints, rpc, syncComplete, syncHandler, tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
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
  GetParams,
  LinkedEntitySummary,
  MessageDetailView,
  MessageListItem,
  MessagesListParams,
  ReplyParams,
  SendParams,
  SetIndexedParams,
  SetTriggerParams,
  SyncEnvelope,
  TelegramChatListItem,
  TriggerCheck,
} from "../types.ts";
import {
  accountAnchor,
  chatAnchor,
  CHAT,
  MESSAGE,
  TELEGRAM_ACCOUNT,
} from "../schema.ts";
import {
  boolFlag,
  chatIdOrNull,
  chatIdStr,
  extractUrls,
  mediaTypeToMime,
  num,
  str,
  CHAT_BATCH_THRESHOLD,
  INDEXING_THRESHOLD,
  INGEST_CHUNK,
  type Data,
} from "./helpers.ts";
import { runBatchSend } from "./batchSend.ts";

/**
 * What a message exposes on its own initiative: its chat and its sender. Web
 * references and media edges also hang off a message, but they are not part of
 * what this module says a message is.
 */
const EXPOSED_OUTGOING = new Set(["in_chat", "authored_by"]);

export class TelegramModule {
  private readonly graph: GraphService;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  /// The operator's own telegram.account anchor (S4). `null` before the
  /// connection-ready hook has run — the readers then fall back to the
  /// chat dict, which pre-S4 rows still carry.
  private async selfAccountAnchor(): Promise<string | null> {
    const selves = await this.graph.list_entities_by_property_field({
      entity_schema: TELEGRAM_ACCOUNT,
      key: "is_self",
      value: "true",
      limit: 1,
      offset: 0,
    });
    const self = selves.items[0];
    if (!self) return null;
    const id = (self as { properties?: Record<string, unknown> }).properties?.telegram_user_id;
    return typeof id === "number" || typeof id === "string" ? accountAnchor(id) : null;
  }

  /// Per-chat state the OPERATOR observes, from the observed_in edges.
  private async observedStateFor(chatIds: string[]): Promise<Map<string, Data>> {
    const out = new Map<string, Data>();
    if (chatIds.length === 0) return out;
    for (const chatId of chatIds) {
      const links = await this.graph.list_links_for_entity(chatId);
      const edge = links.find((l) => l.kind === "observed_in" && l.to_id === chatId);
      if (edge?.metadata) out.set(chatId, edge.metadata);
    }
    return out;
  }

  // ── chats.list ────────────────────────────────────────────────
  private buildChatItem(entity: RawEntity, d: Data): TelegramChatListItem {
    const avatar = str(d, "avatar_url") ?? str(d, "photo_url");
    const sourceAccounts = Array.isArray(d.sources)
      ? d.sources.flatMap((source) => {
          if (source === null || typeof source !== "object" || Array.isArray(source)) return [];
          const account = (source as Record<string, unknown>).account;
          return typeof account === "string" && account !== "" ? [account] : [];
        })
      : [];
    const exactAccounts = [...new Set(sourceAccounts)];
    return {
      schema_id: CHAT,
      entity_id: entity.id,
      chat_id: chatIdStr(d),
      account_id: exactAccounts.length === 1 ? (exactAccounts[0] ?? null) : null,
      chat_title: str(d, "title"),
      last_message: str(d, "last_message_preview"),
      last_message_time: typeof d.last_message_date === "string" ? (d.last_message_date) : null,
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
    // (pins live in the chat record, not entity columns), render record inline, one
    // statement. Replaces the telegram-specific list_chat_dialog_window.
    // S4: the chat DICT holds what the chat is; per-account state (pins,
    // unread) rides the operator's observed_in edge, so the order keys read
    // the EDGE dictionary — one correlated subselect each, still one
    // statement, still no N+1.
    const selfAnchor = await this.selfAccountAnchor();
    const pinField = selfAnchor
      ? { edge_kind: "observed_in", observer_anchor: selfAnchor, edge_path: "is_pinned" }
      : { property_path: "is_pinned" };
    const orderField = selfAnchor
      ? { edge_kind: "observed_in", observer_anchor: selfAnchor, edge_path: "pin_order" }
      : { property_path: "pin_order" };
    const page = await this.graph.list_entities_window({
      schema: CHAT,
      order: [
        { field: pinField, desc: true },
        { field: orderField, desc: false },
        { field: { property_path: "last_message_date" }, desc: true },
      ],
      limit,
      offset,
    });
    const state = await this.observedStateFor(page.items.map(({ entity }) => entity.id));
    const items = page.items.map(({ entity }) =>
      this.buildChatItem(entity, {
        ...(((entity as { properties?: unknown }).properties ?? {}) as Data),
        ...(state.get(entity.id) ?? {}),
      }),
    );
    return { items, total: page.total, limit, offset };
  }

  @rpc("chats.get", {
    description: "Resolve one Telegram chat and its exact actionable Source account.",
    params: {
      type: "object",
      properties: { entity_id: { type: "string" } },
      required: ["entity_id"],
      additionalProperties: false,
    },
  })
  async chatsGet(params: { entity_id: string }): Promise<TelegramChatListItem> {
    const entity = await this.graph.get_entity(params.entity_id);
    if (entity?.schema_id !== CHAT) {
      throw new Error(`${CHAT} ${params.entity_id} not found`);
    }
    const state = await this.observedStateFor([entity.id]);
    return this.buildChatItem(entity, {
      ...((entity.properties ?? {}) as Data),
      ...(state.get(entity.id) ?? {}),
    });
  }

  /// Name search over the user's chats — native `search_chats`: user-scoped
  /// name match (ILIKE) + manual offset, then the matched chats' details records
  /// to build the rows. Search results are name-ranked, not pinned-sorted.
  private async searchChats(
    query: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<TelegramChatListItem>> {
    const matches = await this.graph.search_entities_by_name({
      query,
      schema_ids: [CHAT],
      limit: limit + offset,
    });
    const total = matches.length;
    const page = matches.slice(offset, offset + limit);
    const dicts = new Map<string, Data>();
    for (const e of page) {
      dicts.set(e.id, ((e as { properties?: unknown }).properties ?? {}) as Data);
    }
    // S4: the chat DICT rides the entity rows the search returned; the
    // operator's observed state composes on top.
    const state = await this.observedStateFor(page.map((e) => e.id));
    const items: TelegramChatListItem[] = [];
    for (const e of page) {
      const d = dicts.get(e.id);
      if (d) items.push(this.buildChatItem(e, { ...d, ...(state.get(e.id) ?? {}) }));
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
    let chatId: string | null = params.chat_id !== undefined ? String(params.chat_id) : null;
    if (chatId === null && params.entity_id) {
      const chatEntity = await this.graph.get_entity(params.entity_id);
    const d = chatEntity
      ? {
          ...(((chatEntity as { properties?: unknown }).properties ?? {}) as Data),
          ...((await this.observedStateFor([params.entity_id])).get(params.entity_id) ?? {}),
        }
      : null;
      if (d) chatId = chatIdStr(d) || null;
    }

    if (chatId !== null) {
      return this.messagesForChat(chatId, limit, offset);
    }
    // No chat filter → all of the user's telegram messages. ONE bulk record read
    // (not a per-message detailsFacet), same anti-N+1 shape as searchChats.
    const page = await this.graph.list_entities({ schema_id: MESSAGE, limit, offset });
    const byId = new Map<string, Data>();
    for (const e of page.items) {
      byId.set(e.id, ((e as { properties?: unknown }).properties ?? {}) as Data);
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
    // index-covered), order by entity-col date DESC, render record inline. Kills the
    // old ~2N hops (op find_entity_for_user + per-message detailsFacet).
    const page = await this.graph.list_entities_window({
      schema: MESSAGE,
      filter_field: { entity_field: "idx" },
      filter_eq: chatId,
      order: [{ field: { entity_field: "date" }, desc: true }],
      limit,
      offset,
    });
    const senders = await this.senderNamesFor(page.items.map(({ entity }) => entity.id));
    const items = page.items.map(({ entity }) =>
      this.buildMessageItem(
        entity,
        ((entity as { properties?: unknown }).properties ?? {}) as Data,
        senders.get(entity.id) ?? null,
      ),
    );
    return { items, total: page.total, limit, offset };
  }

  /// S4: the sender's display name comes from the authored_by ACCOUNT
  /// replica — `sender_name` left the message dict when the edge became the
  /// representation, so a renamed account is no longer frozen in every row.
  private async senderNamesFor(messageIds: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (messageIds.length === 0) return out;
    const authorIdByMessage = new Map<string, string>();
    for (const id of messageIds) {
      const links = await this.graph.list_links_for_entity(id);
      const edge = links.find((l) => l.kind === "authored_by" && l.from_id === id);
      if (edge) authorIdByMessage.set(id, edge.to_id);
    }
    const authorIds = [...new Set(authorIdByMessage.values())];
    if (authorIds.length === 0) return out;
    const authors = await this.graph.get_entities(authorIds);
    const nameById = new Map(authors.map((a) => [a.id, a.name]));
    for (const [messageId, authorId] of authorIdByMessage) {
      out.set(messageId, nameById.get(authorId) ?? null);
    }
    return out;
  }

  private buildMessageItem(entity: RawEntity, d: Data, sender?: string | null): MessageListItem {
    const created = entity.created_at ?? "";
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: sender ?? str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      preview: null,
      channel: "telegram",
      timestamp: typeof d.date === "string" ? (d.date) : created,
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
    // P1 (graph-read-api §4): the entity in ONE fetch, user-scoped.
    // P4: with its links. Returning nothing because the fetch asked for
    // nothing was not a decision about what a message exposes.
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== MESSAGE) {
      throw new Error(`${MESSAGE} ${params.id} not found`);
    }
    const { entity, links } = detail;
    // S4: the message DICT is the record.
    const d = ((entity as { properties?: unknown }).properties ?? {}) as Data;
    const senderName = (await this.senderNamesFor([entity.id])).get(entity.id) ?? null;
    const created = entity.created_at ?? "";

    // P4 — telegram's choice, stated: a message exposes its chat, its sender,
    // and whatever points at it. Outgoing keeps the kind, incoming wears `~`,
    // the convention projects and companies already use.
    // @tested-by: tst_mod_tg_001
    // @invariant: a message never lists itself, and one relation per endpoint
    // survives — the first one found supplies the label.
    // Outgoing is restricted to the two the contract names. A message also has
    // outgoing `references` edges to web links and edges to media, and exposing
    // those here would make `messages.get` answer about things this module
    // never claimed to expose. Everything that POINTS AT the message is
    // returned, whatever it is.
    const exposed = links.filter(
      (link) => link.from_id !== entity.id || EXPOSED_OUTGOING.has(link.kind),
    );
    const reached = reachedEndpoints(
      [{ links: exposed, ownerIds: new Set([entity.id]) }],
      new Set([entity.id]),
    );
    const endpointIds = [...reached.keys()];
    const endpoints = endpointIds.length === 0 ? [] : await this.graph.get_entities(endpointIds);
    const endpointById = new Map(endpoints.map((e) => [e.id, e] as const));
    const linked_entities: LinkedEntitySummary[] = [];
    for (const [id, kind] of reached) {
      const target = endpointById.get(id);
      if (target === undefined) continue;
      linked_entities.push({
        id: target.id,
        name: target.name,
        schema_id: target.schema_id,
        link_kind: kind,
        created_at: (target as { created_at?: string }).created_at ?? new Date(0).toISOString(),
        data: null,
      });
    }
    return {
      id: entity.id,
      schema_id: entity.schema_id,
      sender: senderName ?? str(d, "sender_name"),
      subject: entity.name && entity.name.length > 0 ? entity.name : null,
      body: str(d, "text"),
      channel: "telegram",
      timestamp: typeof d.date === "string" ? (d.date) : created,
      canonical: {},
      linked_entities,
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
    // S4: the chat resolves through the anchor chokepoint and the toggle is
    // ONE dictionary merge — no record, no duplicate-row hazard.
    const entityId = await this.graph.find_by_anchor(chatAnchor(String(params.chat_id)));
    if (!entityId) throw new Error(`chat ${String(params.chat_id)} not found`);
    await this.graph.update_properties({
      entity_id: entityId,
      properties: { is_indexed: params.is_indexed },
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
    return this.graph.sync_state("reset", MESSAGE);
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
  // + records + the message→chat link; contacts/media/web/delete land in 2b–2d.
  /// S4: the connection is provider-verified — mint the OPERATOR's own
  /// telegram.account node before any envelope routes. The identity key is
  /// the numeric telegram user id the probe reported; the anchor makes the
  /// mint idempotent across reconnects and repairs.
  @connectionReady()
  async onConnectionReady(params: {
    user_id: string;
    source_id: string;
    account_id: string;
    identity_key: string;
  }): Promise<{ ok: boolean }> {
    const key = params.identity_key;
    if (!key) throw new Error("connection_ready: identity_key is required");
    await this.graph.apply_batch({
      entities: [
        {
          key: "self",
          schema_id: TELEGRAM_ACCOUNT,
          name: "",
          anchor: accountAnchor(key),
          properties: { telegram_user_id: Number(key), is_self: true },
        },
      ],
      refs: [],
      links: [],
    });
    return { ok: true };
  }

  /// S4 (plan §8): the drain terminated — the reported set is COMPLETE.
  /// A chat the operator's account still observes but the connector no
  /// longer reports has been LEFT: its observed_in edge decays (the chat
  /// node and its history stay — leaving is not deleting). A rejoin is the
  /// next drain reporting it again, which restores the edge to canonical.
  /// Idempotent: a second run over the same set changes nothing.
  @syncComplete()
  async onSyncComplete(params: {
    user_id: string;
    source_id: string;
    account_id: string;
    identity_key?: string | null;
    observed_remote_ids?: string[];
  }): Promise<{ decayed: number; restored: number }> {
    const identityKey = params.identity_key;
    if (!identityKey) return { decayed: 0, restored: 0 };
    const selfId = await this.graph.find_by_anchor(accountAnchor(identityKey));
    if (!selfId) return { decayed: 0, restored: 0 };

    // The chat ids the drain reported (its envelopes are `tg:chat:<id>`).
    const reported = new Set(
      (params.observed_remote_ids ?? [])
        .filter((id) => id.startsWith("tg:chat:"))
        .map((id) => id.slice("tg:chat:".length)),
    );
    // A drain that reported no chats at all says nothing about membership —
    // refuse to decay the whole set off an empty page (NO FALLBACKS).
    if (reported.size === 0) return { decayed: 0, restored: 0 };

    let decayed = 0;
    let restored = 0;
    const links = await this.graph.list_links_for_entity(selfId, true);
    for (const link of links) {
      if (link.kind !== "observed_in" || link.from_id !== selfId) continue;
      const chat = await this.graph.get_entity(link.to_id);
      const props = ((chat as { properties?: unknown } | null)?.properties ?? {}) as Data;
      const chatId = chatIdOrNull(props);
      if (chatId === null) continue;
      const isReported = reported.has(chatId);
      const isDecayed = link.status === "decayed";
      if (!isReported && !isDecayed) {
        await this.graph.set_link_status(link.id, "decayed");
        decayed += 1;
      } else if (isReported && isDecayed) {
        await this.graph.set_link_status(link.id, "canonical");
        restored += 1;
      }
    }
    return { decayed, restored };
  }

  @syncHandler("telegram")
  async ingest(
    params: { envelopes?: SyncEnvelope[]; backfill_priority?: { chat_ids?: string[] } },
  ): Promise<
    | { dropped_remote_ids: string[]; trigger_checks: TriggerCheck[] }
    | { priority: string[] }
  > {
    // The scheduler reuses this reserved sync method to ask which chats are
    // high-priority for backfill (pinned/indexed) — it can't see chat metadata
    // itself. Branch out before the ingest path.
    if (params.backfill_priority) {
      return this.backfillPriority(params.backfill_priority.chat_ids ?? []);
    }
    // Stage 3: the host bridge dispatches a WHOLE page of envelopes in one call.
    // Chat snapshots + deletes stay per-envelope (few, field-merge / cascade); the
    // message bulk collapses to ONE graph.apply_batch (the native per-message
    // find→create→attach→link pipeline is what made bootstrap take ~5.6h).
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    // S4: telegram data is identity-scoped — per-account chat state rides
    // observed_in edges keyed by the OBSERVING account. The router stamps
    // identity_key host-side from the provider-verified subject; an
    // unstamped page means the account never probed → refuse loudly
    // (backfill-or-reauth), never guess an identity.
    const identityKey = envelopes.find((e) => e.kind === "snapshot" || e.kind === "live")
      ?.identity_key;
    if (envelopes.some((e) => (e.kind === "snapshot" || e.kind === "live") && !e.identity_key)) {
      throw new Error(
        "telegram ingest refused: envelope carries no identity_key — reconnect the account (the probe backfills the provider identity)",
      );
    }
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
      const payload = env.payload;
      const entityType = typeof payload.entity_type === "string" ? payload.entity_type : "message";
      if (entityType === "chat" || entityType === "telegram_chat") {
        chats.push({ env, payload });
        continue;
      }
      // S4: a message node is identified by its message_id (the envelope's
      // remote_id is its anchor) — an envelope without one has no identity,
      // so it is DROPPED and reported, never fatal to the page. The record
      // schema used to catch this; the identity rule catches it now. A
      // missing chat_id costs only the in_chat edge, not the node.
      if (num(payload, "message_id") === null) {
        if (env.remote_id) dropped.push(env.remote_id);
        continue;
      }
      messages.push({ env, payload });
    }

    // Chats: a big page (the bootstrap dialog list) is batched + CHUNKED so it never
    // monopolizes the single PGlite connection; a small page (re-sync) keeps the
    // per-envelope path that merges last_message_* into chat.details.
    if (chats.length > 0) {
      await this.ingestChatBatch(chats, identityKey);
    }

    // Messages in CHUNKS — one apply_batch per chunk, so the connection is freed
    // between batches (a bootstrap message page can be thousands of messages).
    for (let i = 0; i < messages.length; i += INGEST_CHUNK) {
      await this.ingestMessageBatch(messages.slice(i, i + INGEST_CHUNK), triggers);
      await Promise.resolve(); // yield between chunks so waiting RPCs get the connection
    }

    return { dropped_remote_ids: dropped, trigger_checks: triggers };
  }

  // Bulk chat ingest for the bootstrap dialog list (one huge page). Batches chat
  // entities + chat.details records in CHUNKS, freeing the single PGlite connection
  // between batches.
  private async ingestChatBatch(
    chats: { env: SyncEnvelope; payload: Data }[],
    identityKey: string | undefined,
  ): Promise<void> {
    // A connector restart can emit another bootstrap-sized dialog snapshot for
    // chats that already exist. Those snapshots intentionally omit fields that
    // are derived by message ingest (and any locally resolved avatar), so load
    // the current DICTIONARIES once and preserve those fields during the
    // batch upsert (S4: the chat dict is the record — no dictionary writes).
    //
    // @tested-by: tst_mod_tg_ingest_001
    // @invariant: repeated bootstrap snapshots never erase chat list previews,
    // recency, sender names, or locally resolved avatar URLs.
    const existingByChatId = new Map<string, Data>();
    if (chats.length > CHAT_BATCH_THRESHOLD) {
      const current = await this.graph.list_entities_window({
        schema: CHAT,
        limit: 1_000_000,
        offset: 0,
      });
      for (const { entity } of current.items) {
        const details = ((entity as { properties?: unknown }).properties ?? {}) as Data;
        const chatId = chatIdOrNull(details);
        if (chatId !== null) existingByChatId.set(chatId, details);
      }
    } else {
      // A live page touches a handful of chats — read exactly those.
      for (const { payload } of chats) {
        const chatId = chatIdOrNull(payload);
        if (chatId === null || existingByChatId.has(chatId)) continue;
        const eid = await this.graph.find_by_anchor(chatAnchor(chatId));
        if (!eid) continue;
        const e = await this.graph.get_entity(eid);
        const props = ((e as { properties?: unknown } | null)?.properties ?? {}) as Data;
        existingByChatId.set(chatId, props);
      }
    }

    // Per-account chat STATE (unread counts, pins) rides the observed_in
    // edge from the OPERATOR's account — the fields are what one account
    // observes, not what the chat is (plan §6/§7).
    const STATE_KEYS = ["unread_count", "unread_mark", "is_pinned", "pin_order"];

    for (let i = 0; i < chats.length; i += INGEST_CHUNK) {
      const entities: BatchEntityInput[] = [];
      const refs: BatchRefInput[] = [];
      const links: BatchLinkInput[] = [];
      let selfEntity = false;
      for (const { env, payload } of chats.slice(i, i + INGEST_CHUNK)) {
        const remoteId = env.remote_id;
        if (!remoteId) continue;
        const state: Data = {};
        const details: Data = {};
        for (const [key, value] of Object.entries(payload)) {
          if (key === "entity_type" || value === null || value === undefined) continue;
          if (STATE_KEYS.includes(key)) state[key] = value;
          else details[key] = value;
        }
        const chatId = chatIdOrNull(payload);
        const existing = chatId === null ? undefined : existingByChatId.get(chatId);
        if (existing !== undefined) {
          for (const key of [
            "last_message_date",
            "last_message_preview",
            "last_sender_name",
            "avatar_url",
            "photo_url",
          ]) {
            if (
              existing[key] !== null &&
              existing[key] !== undefined &&
              (details[key] === null || details[key] === undefined)
            ) {
              details[key] = existing[key];
            }
          }
        }
        entities.push({
          key: remoteId,
          schema_id: CHAT,
          name: typeof payload.title === "string" ? payload.title : "",
          anchor: chatId !== null ? chatAnchor(chatId) : undefined,
          properties: details,
          confidence: 100,
        });
        // The edge IS the membership fact — a reported chat always gets it,
        // with the observed state as its dictionary when the page carries
        // any. (The complete-set reconciliation decays exactly these.)
        if (identityKey) {
          // @tested-by: tst_module_telegram_003, tst_e2e_tg_001_chat_list_renders
          // @invariant: the observer and its membership edge are one atomic
          // graph fragment; ingest cannot depend on an earlier lifecycle hook.
          if (!selfEntity) {
            entities.unshift({
              key: "self",
              schema_id: TELEGRAM_ACCOUNT,
              name: "",
              anchor: accountAnchor(identityKey),
              properties: { telegram_user_id: Number(identityKey), is_self: true },
            });
            selfEntity = true;
          }
          links.push({
            from_key: "self",
            to_key: remoteId,
            kind: "observed_in",
            declared_by: remoteId,
            metadata: state,
          });
        }
      }
      if (entities.length > 0) {
        await this.graph.apply_batch({ entities, refs, links });
      }
      await Promise.resolve(); // yield between chunks so waiting RPCs get the connection
    }
  }

  // Bulk message ingest: the whole page becomes ONE graph.apply_batch (message
  // entities + details records + chat refs + sender contacts + links). Unique chats
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
      const cid = chatIdOrNull(payload);
      if (cid === null) continue;
      const key = cid;
      if (chatEntityId.has(key)) continue;
      const eid = await this.graph.find_by_anchor(chatAnchor(key));
      chatEntityId.set(key, eid);
      if (eid) {
        const e = await this.graph.get_entity(eid);
        chatDetails.set(key, ((e as { properties?: unknown } | null)?.properties ?? null) as Data | null);
      } else {
        chatDetails.set(key, null);
      }
    }
    // 2+3. Build the fragment (S4, plan §7): the message DICT is the record
    // (minus chat_id / sender_id / sender_name — edges are the
    // representation), the sender becomes a telegram.account replica node
    // discovered on sight (anchored, so re-ingest converges), and the edges
    // carry the structure: authored_by (message → account), in_chat
    // (message → chat), observed_participant (account → chat). The
    // contacts.person minting is GONE — hubs attach through identity, never
    // through a sync writer.
    const entities: BatchEntityInput[] = [];
    const refs: BatchRefInput[] = [];
    const links: BatchLinkInput[] = [];
    const accountKeys = new Set<string>();
    const linkSeen = new Set<string>();
    const chatRefKeys = new Set<string>();
    const addChatRef = (key: string, cid: string): void => {
      if (!chatRefKeys.has(key)) {
        refs.push({ key, anchor: chatAnchor(cid) });
        chatRefKeys.add(key);
      }
    };
    const addLink = (
      from_key: string,
      to_key: string,
      kind: string,
      declared_by: string,
    ): void => {
      const k = `${from_key} ${to_key} ${kind}`;
      if (!linkSeen.has(k)) {
        links.push({ from_key, to_key, kind, declared_by });
        linkSeen.add(k);
      }
    };

    for (const { env, payload } of messages) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const text = str(payload, "text") ?? "";
      const cid = chatIdOrNull(payload);
      const chatKey = cid !== null ? `chat:${cid}` : null;

      const dict: Data = { ...payload };
      delete dict.entity_type;
      delete dict.chat_id;
      delete dict.sender_id;
      delete dict.sender_name;

      entities.push({
        key: remoteId,
        schema_id: MESSAGE,
        name: text.slice(0, 80),
        idx: cid ?? undefined,
        date: str(payload, "date") ?? undefined,
        anchor: remoteId,
        properties: dict,
        confidence: 90,
      });

      if (cid !== null && chatKey) {
        addChatRef(chatKey, cid);
        addLink(remoteId, chatKey, "in_chat", remoteId);
      }

      const sid = payload.sender_id;
      if (typeof sid === "number") {
        const accountKey = `acct:${String(sid)}`;
        if (!accountKeys.has(accountKey)) {
          const props: Data = { telegram_user_id: sid };
          const displayName = str(payload, "sender_name");
          if (displayName) props.display_name = displayName;
          const info =
            payload.sender_info && typeof payload.sender_info === "object"
              ? (payload.sender_info as Data)
              : {};
          for (const key of ["first_name", "last_name", "username", "phone"]) {
            const v = str(info, key);
            if (v) props[key] = v;
          }
          entities.push({
            key: accountKey,
            schema_id: TELEGRAM_ACCOUNT,
            name: displayName ?? "",
            anchor: accountAnchor(sid),
            properties: props,
          });
          accountKeys.add(accountKey);
        }
        addLink(remoteId, accountKey, "authored_by", remoteId);
        if (chatKey) addLink(accountKey, chatKey, "observed_participant", remoteId);
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
      if (
        mediaType &&
        payload.source_ref !== null &&
        payload.source_ref !== undefined &&
        mChatId !== null &&
        mMessageId !== null
      ) {
        // is_indexed gates the byte fetch, not the entity: a non-indexed chat
        // still registers the file.object (the message keeps its attachment) but
        // skips the download — it is pulled on demand when the user opens it.
        const fileChatDetails = chatDetails.get(String(mChatId)) ?? null;
        await this.graph.file_register({
          external_id: `file:telegram:${String(mChatId)}:${String(mMessageId)}`,
          parent_external_id: remoteId,
          link_kind: "file.attachment",
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
          if (ck) touched.push(ck);
        }
        const sid = payload.sender_id;
        if (typeof sid === "number") {
          const pk = result.ids[`acct:${String(sid)}`];
          if (pk) touched.push(pk);
        }
        triggers.push({
          type: "trigger.check",
          event_kind: "new_message",
          schema_id: MESSAGE,
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
      await this.graph.update_properties({
        entity_id: eid,
        properties: {
          last_message_date: msgDate,
          last_message_preview: str(msg, "text") ?? "",
          last_sender_name: str(msg, "sender_name") ?? "",
        },
      });
    }
  }


  // Delete the entity behind a remote_id (user-scoped). Mirrors native
  // ingest_delete; delete_entity cascades the entity's links.
  private async ingestDelete(envelope: SyncEnvelope): Promise<void> {
    const remoteId = envelope.remote_id;
    if (!remoteId) return;
    // S4: messages and chats resolve by ANCHOR — their remote_id IS the
    // anchor form.
    const entityId = await this.graph.find_by_anchor(remoteId);
    if (entityId) await this.graph.delete_entity(entityId);
  }

  private async backfillPriority(chatIds: string[]): Promise<{ priority: string[] }> {
    if (chatIds.length === 0) return { priority: [] };
    const want = new Set(chatIds);
    // ONE host hop: pull every chat + its details (same windowed query chats.list
    // uses), then classify — instead of a find_by_external_id + detailsFacet N+1
    // per chat (which cost ~56s for 100 chats on the single PGlite connection).
    const page = await this.graph.list_entities_window({
      schema: CHAT,
      limit: 1_000_000,
      offset: 0,
    });
    // S4: pins are the OPERATOR's observed state (edge), the rest is the dict.
    const wanted = page.items.filter(({ entity }) => {
      const cid = chatIdStr(((entity as { properties?: unknown }).properties ?? {}) as Data);
      return want.has(cid);
    });
    const state = await this.observedStateFor(wanted.map(({ entity }) => entity.id));
    const priority: string[] = [];
    for (const { entity } of wanted) {
      const d = {
        ...(((entity as { properties?: unknown }).properties ?? {}) as Data),
        ...(state.get(entity.id) ?? {}),
      };
      const cid = chatIdStr(d);
      if (!cid) continue;
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
    const all = params.messages;
    if (all.length === 0 || all.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(all.length)}`);
    }
    // The approval card applies per-message text edits into `messages` and lists
    // skipped recipients in `excluded_indices`; drop those before sending.
    const excluded = new Set(params.excluded_indices ?? []);
    const messages = all.filter((_, i) => !excluded.has(i));
    messages.forEach((m, i) => {
      // chat_id is declared number|string but arrives from unvalidated tool-call
      // JSON, so it can be missing at runtime — widen before the presence guard.
      const cid = m.chat_id as number | string | null | undefined;
      if (cid === null || cid === undefined || String(cid).length === 0) {
        throw new Error(`message[${String(i)}]: missing chat_id`);
      }
      if (!m.text) throw new Error(`message[${String(i)}]: missing text`);
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
    if (replyTo !== undefined) payload.reply_to_message_id = replyTo;
    const result = await this.graph.source_command(payload, accountId);
    // The message is DELIVERED past this point. Local ingest + entity lookup are
    // best-effort enrichment: a failure here must NOT propagate as a send failure,
    // else a delivered message is reported "failed" (batch_send / single send) and
    // a manual retry double-sends it. The missing local copy is reconciled by the
    // normal sync, not by failing an already-delivered send (Codex round-2).
    try {
      const messageId = typeof result.message_id === "number" ? result.message_id : 0;
      const remoteId = `tg:msg:${String(chatId)}:${String(messageId)}`;
      const sentPayload: Data = {
        message_id: messageId,
        chat_id: chatId,
        text,
        date: new Date().toISOString(),
        is_outgoing: true,
        sender_name: "You",
      };
      await this.ingestMessageBatch(
        [{ env: this.syntheticEnvelope(remoteId, sentPayload, accountId), payload: sentPayload }],
        [],
      );
      const entityId = await this.graph.find_by_anchor(remoteId);
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
    const chatEntityId = await this.graph.find_by_anchor(chatAnchor(String(params.chat_id)));
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
