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

import { connectionReady, reachedEndpoints, rpc, syncHandler, tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  BatchRefInput,
  LinkSummary,
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
  INDEXING_THRESHOLD,
  BOOTSTRAP_MESSAGES_PER_CHAT,
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

const SEND_PARAMS = {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        text: { type: "string" },
        reply_to_message_id: { type: "integer" },
        account_id: { type: "string" },
      },
      required: ["chat_id", "text"],
      additionalProperties: false,
    };
const REPLY_PARAMS = {
      type: "object",
      properties: {
        chat_id: { type: ["integer", "string"] },
        reply_to_message_id: { type: "integer" },
        text: { type: "string" },
        account_id: { type: "string" },
      },
      required: ["chat_id", "reply_to_message_id", "text"],
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
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["messages"],
      additionalProperties: false,
    };
const CHAT_GET_PARAMS = { oneOf: [
  { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"], additionalProperties: false },
  { type: "object", properties: { chat_id: { type: ["integer", "string"] } }, required: ["chat_id"], additionalProperties: false },
] };
const MESSAGE_GET_PARAMS = {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    };

interface IngestedChatState {
  readonly entityId: string;
  readonly details: Data;
}

/** One message envelope of a page with everything derived from it read once:
 * the ids a payload carries are parsed here, not in each loop that needs them. */
interface PageMessage {
  readonly env: SyncEnvelope;
  readonly payload: Data;
  readonly remoteId: string;
  readonly chatId: string | null;
  readonly senderId: number | null;
  readonly isLive: boolean;
}

/** What the page knows about one chat: its node, when the graph holds one, and
 * the dictionary that node carries. A chat the page never resolved is absent. */
interface ChatEntry {
  readonly entityId: string | null;
  readonly details: Data | null;
}
type ChatContext = ReadonlyMap<string, ChatEntry>;

/** The one transaction a page writes. Entities, refs and links are keyed, so
 * the fragment itself is the deduplication — no Set rides beside it. */
interface Fragment {
  readonly entities: Map<string, BatchEntityInput>;
  readonly refs: Map<string, BatchRefInput>;
  readonly links: Map<string, BatchLinkInput>;
}

/** What the page produces once its fragment holds resolved ids: the host calls
 * it still owes, gathered so they leave in as few calls as the host allows. */
interface PageEffects {
  readonly webLinks: WebLinkInput[];
  readonly files: FileRegisterInput[];
  readonly chatUpdates: ChatUpdate[];
  readonly triggers: TriggerCheck[];
}

type WebLinkInput = Parameters<GraphService["web_register"]>[0];
type FileRegisterInput = Parameters<GraphService["file_register"]>[0];
type ChatUpdate = Parameters<GraphService["update_properties"]>[0];

/** What one page states for the worker's plan: per schema, the count
 * relative to the statement the operator's observed_in edges held before the
 * page; and every chat the page touched whose history the plan leaves out. */
interface PlanDelta { total: number; skipped: number }
interface PageStatement {
  readonly chats: PlanDelta;
  readonly messages: PlanDelta;
  readonly excluded: Set<string>;
}

/** One envelope, read once: the ids a payload carries are parsed here so no
 * later step parses them again. */
function pageMessageOf({ env, payload }: { env: SyncEnvelope; payload: Data }): PageMessage {
  const senderId = payload.sender_id;
  return {
    env,
    payload,
    remoteId: env.remote_id ?? "",
    chatId: chatIdOrNull(payload),
    senderId: typeof senderId === "number" ? senderId : null,
    isLive: env.kind === "live",
  };
}

/** How many live messages each chat gained on this page. */
function countLiveByChat(page: readonly PageMessage[], newLiveMessages: ReadonlySet<string>): Map<string, number> {
  const live = new Map<string, number>();
  const remaining = new Set(newLiveMessages);
  for (const message of page) {
    if (!message.isLive || message.chatId === null || !remaining.delete(message.remoteId)) continue;
    live.set(message.chatId, (live.get(message.chatId) ?? 0) + 1);
  }
  return live;
}

/** The message's dictionary: the payload minus what the edges represent. */
function messageDictionary(payload: Data): Data {
  const { entity_type: _entityType, chat_id: _chatId, sender_id: _senderId, sender_name: _senderName, ...rest } = payload;
  return rest;
}

/** The sender's replica node, discovered on sight; anchored, so re-ingest converges. */
function senderEntity(message: PageMessage, identityKey: string | undefined): BatchEntityInput | null {
  if (message.senderId === null) return null;
  const displayName = str(message.payload, "sender_name");
  const info = message.payload.sender_info && typeof message.payload.sender_info === "object"
    ? (message.payload.sender_info as Data)
    : {};
  const properties: Data = { telegram_user_id: message.senderId };
  if (String(message.senderId) === identityKey) properties.is_self = true;
  if (displayName) properties.display_name = displayName;
  for (const key of ["first_name", "last_name", "username", "phone"] as const) {
    const value = str(info, key);
    if (value) properties[key] = value;
  }
  return {
    key: `acct:${String(message.senderId)}`,
    schema_id: TELEGRAM_ACCOUNT,
    name: displayName ?? "",
    anchor: accountAnchor(message.senderId),
    properties,
  };
}

/** The page as one fragment: the message dictionaries, the senders they
 * discovered, and the edges that carry the structure — authored_by (message →
 * account), in_chat (message → chat), observed_participant (account → chat).
 * Keyed maps ARE the deduplication. Pure: no graph, no await.
 * @tested-by: tst_module_telegram_004 */
function buildFragment(page: readonly PageMessage[], identityKey: string | undefined): Fragment {
  const fragment: Fragment = { entities: new Map(), refs: new Map(), links: new Map() };
  const link = (from_key: string, to_key: string, kind: string, declared_by: string): void => {
    fragment.links.set(`${from_key} ${to_key} ${kind}`, { from_key, to_key, kind, declared_by });
  };
  for (const message of page) {
    const text = str(message.payload, "text") ?? "";
    const chatKey = message.chatId === null ? null : `chat:${message.chatId}`;
    fragment.entities.set(message.remoteId, {
      key: message.remoteId,
      schema_id: MESSAGE,
      name: Array.from(text).slice(0, 80).join(""),
      idx: message.chatId ?? undefined,
      date: str(message.payload, "date") ?? undefined,
      anchor: message.remoteId,
      properties: messageDictionary(message.payload),
      confidence: 90,
    });
    if (message.chatId !== null && chatKey !== null) {
      fragment.refs.set(chatKey, { key: chatKey, anchor: chatAnchor(message.chatId) });
      link(message.remoteId, chatKey, "in_chat", message.remoteId);
    }
    const sender = senderEntity(message, identityKey);
    if (sender === null) continue;
    if (!fragment.entities.has(sender.key)) fragment.entities.set(sender.key, sender);
    link(message.remoteId, sender.key, "authored_by", message.remoteId);
    if (chatKey !== null) link(sender.key, chatKey, "observed_participant", message.remoteId);
  }
  return fragment;
}

/** The attachment a message carries, or nothing. `is_indexed` gates the byte
 * fetch, not the entity: a non-indexed chat still registers the file.object —
 * the bytes are pulled on demand when the user opens it. */
function attachmentOf(
  message: PageMessage,
  chats: ChatContext,
  shouldDownload: (details: Data | null) => boolean,
): FileRegisterInput[] {
  const mediaType = str(message.payload, "media_type");
  const messageId = num(message.payload, "message_id");
  const sourceRef = message.payload.source_ref;
  if (!mediaType || message.chatId === null || messageId === null || sourceRef === null || sourceRef === undefined) return [];
  return [{
    external_id: `file:telegram:${message.chatId}:${String(messageId)}`,
    parent_external_id: message.remoteId,
    link_kind: "file.attachment",
    name: str(message.payload, "file_name") ?? undefined,
    mime_type: mediaTypeToMime(mediaType),
    source_ref: sourceRef as Record<string, unknown>,
    // The host file worker routes download_file by (source_module,
    // source_surface) — stamp the envelope's ACTUAL source_id, never a
    // hardcoded name: the surface may be served by a differently-named
    // connector (telegram-ts), and "telegram" would route to a runtime that
    // doesn't exist ("no source runtime for (telegram, telegram)").
    source_module: message.env.source_id,
    source_surface: "telegram",
    download: shouldDownload(chats.get(message.chatId)?.details ?? null),
  }];
}

/** The trigger check a live message raises: the backend fires a watch only for
 * an event that says when it happened (INV-10, fail closed) — the message's
 * own date is that. */
function triggerOf(message: PageMessage, entityId: string, ids: Record<string, string>): TriggerCheck {
  const touched = [entityId];
  const chatEntityId = message.chatId === null ? undefined : ids[`chat:${message.chatId}`];
  if (chatEntityId) touched.push(chatEntityId);
  const senderEntityId = message.senderId === null ? undefined : ids[`acct:${String(message.senderId)}`];
  if (senderEntityId) touched.push(senderEntityId);
  const occurredAt = str(message.payload, "date");
  return {
    type: "trigger.check",
    event_kind: "new_message",
    schema_id: MESSAGE,
    entity_id: entityId,
    phase: "live",
    touched_entity_ids: touched,
    user_id: message.env.user_id,
    context: {
      text: str(message.payload, "text") ?? "",
      sender_name: str(message.payload, "sender_name") ?? "",
      ...(occurredAt === null ? {} : { occurred_at: occurredAt }),
    },
  };
}

/** Each chat's newest message on this page. Present-to-past sync ingests
 * newest-first, so the first one wins ties. */
function newestByChat(page: readonly PageMessage[]): Map<string, Data> {
  const newest = new Map<string, Data>();
  for (const message of page) {
    if (message.chatId === null) continue;
    const current = newest.get(message.chatId);
    if (!current || (str(message.payload, "date") ?? "") >= (str(current, "date") ?? "")) {
      newest.set(message.chatId, message.payload);
    }
  }
  return newest;
}

/** The chat's denorm after this page: its newest message's fields, and the live
 * messages it gained. A chat the page's own chat batch already folded is
 * skipped; a live message older than the newest still moves the count.
 * @tested-by: tst_mod_tg_ingest_002 */
function chatUpdatesOf(
  page: readonly PageMessage[],
  chats: ChatContext,
  pageChatState: ReadonlyMap<string, IngestedChatState>,
  newLiveMessages: ReadonlySet<string>,
): ChatUpdate[] {
  const live = countLiveByChat(page, newLiveMessages);
  const updates: ChatUpdate[] = [];
  for (const [chatId, message] of newestByChat(page)) {
    if (pageChatState.has(chatId)) continue;
    const entry = chats.get(chatId);
    const entityId = entry?.entityId ?? null;
    const details = entry?.details ?? null;
    if (entityId === null || details === null) continue;
    const date = str(message, "date") ?? "";
    const held = str(details, "last_message_date") ?? "";
    if (!date || (held && date < held)) continue;
    const gained = live.get(chatId) ?? 0;
    const count = num(details, "message_count");
    updates.push({
      entity_id: entityId,
      properties: {
        last_message_date: date,
        last_message_preview: str(message, "text") ?? "",
        last_sender_name: str(message, "sender_name") ?? "",
        ...(gained > 0 && count !== null ? { message_count: count + gained } : {}),
      },
    });
    live.delete(chatId);
  }
  // A live message older than its chat's newest still happened: the count moves
  // even when the preview does not.
  for (const [chatId, gained] of live) {
    const entry = chats.get(chatId);
    const count = entry?.details ? num(entry.details, "message_count") : null;
    if (entry?.entityId === null || entry?.entityId === undefined || count === null) continue;
    updates.push({ entity_id: entry.entityId, properties: { message_count: count + gained } });
  }
  return updates;
}

/** Everything the committed page still owes the host, gathered in one pass per
 * concern. Pure: the ids are in hand, nothing here talks to the graph. */
function buildEffects(
  page: readonly PageMessage[],
  ids: Record<string, string>,
  chats: ChatContext,
  pageChatState: ReadonlyMap<string, IngestedChatState>,
  shouldDownload: (details: Data | null) => boolean,
  newLiveMessages: ReadonlySet<string>,
): PageEffects {
  const written = page.flatMap((message) => {
    const entityId = ids[message.remoteId];
    return entityId === undefined ? [] : [{ message, entityId }];
  });
  return {
    webLinks: written.flatMap(({ message, entityId }) =>
      extractUrls(str(message.payload, "text") ?? "").map((url) => ({
        url,
        parent_entity_id: entityId,
        link_kind: "references",
      }))),
    files: written.flatMap(({ message }) => attachmentOf(message, chats, shouldDownload)),
    chatUpdates: chatUpdatesOf(page, chats, pageChatState, newLiveMessages),
    triggers: written.flatMap(({ message, entityId }) => (message.isLive ? [triggerOf(message, entityId, ids)] : [])),
  };
}

function emptyStatement(): PageStatement {
  return { chats: { total: 0, skipped: 0 }, messages: { total: 0, skipped: 0 }, excluded: new Set() };
}

/** The statement as the host reads it: per schema the surface reports on. */
function planOf(statement: PageStatement): Record<string, PlanDelta> {
  return { [CHAT]: { ...statement.chats }, [MESSAGE]: { ...statement.messages } };
}

/** The operator's observed_in edge to one chat, and what it holds. */
interface MembershipEdge {
  readonly edge: LinkSummary | undefined;
  readonly metadata: Data;
  /** The messages the plan stated for the chat in this pass, or null when
   * the edge was stated in another pass (or never). */
  readonly stated: PlanDelta | null;
}

export class TelegramModule {
  private readonly graph: GraphService;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  private async operatorAccount(): Promise<RawEntity | null> {
    const selves = await this.graph.list_entities_by_property_field({
      entity_schema: TELEGRAM_ACCOUNT,
      key: "is_self",
      value: "true",
      limit: 1,
      offset: 0,
    });
    return selves.items[0] ?? null;
  }

  /// Load only the operator's pinned observed state. Pins live on observed_in,
  /// but traversing the account also walks thousands of message edges and
  /// exceeds the graph's interactive safety limit. The edge predicate keeps
  /// this query proportional to the small pinned set.
  private async operatorObservedState(): Promise<{
    readonly byChatId: Map<string, Data>;
    readonly orderedChats: RawEntity[];
    readonly total: number;
    readonly observerAnchor: string;
  } | null> {
    const self = await this.operatorAccount();
    if (!self) return null;
    const { anchor } = self;
    if (!anchor) throw new Error("Telegram operator account is missing its anchor");

    const { pinnedChats, pinnedTotal } = await this.pinnedChatsWindow(anchor);
    const byChatId = await this.observedStateFor(pinnedChats.map(({ id }) => id), self.id);
    const orderedChats = pinnedChats
      .sort((left, right) => {
        const leftState = byChatId.get(left.id) ?? {};
        const rightState = byChatId.get(right.id) ?? {};
        const pinOrder = (num(leftState, "pin_order") ?? Number.MAX_SAFE_INTEGER) -
          (num(rightState, "pin_order") ?? Number.MAX_SAFE_INTEGER);
        if (pinOrder !== 0) return pinOrder;
        const leftProperties = ((left.properties ?? {}) as Data);
        const rightProperties = ((right.properties ?? {}) as Data);
        const recency = (str(rightProperties, "last_message_date") ?? "").localeCompare(
          str(leftProperties, "last_message_date") ?? "",
        );
        return recency !== 0 ? recency : left.id.localeCompare(right.id);
      });
    return { byChatId, orderedChats, total: pinnedTotal, observerAnchor: anchor };
  }

  /// The operator's pinned chats through the edge-filtered chat window:
  /// proportional to the pinned set, never a traversal per chat.
  /// @tested-by: tst_module_telegram_read_004, tst_bts_prt_ops_030, tst_module_telegram_plan_001
  private async pinnedChatsWindow(observerAnchor: string): Promise<{ pinnedChats: RawEntity[]; pinnedTotal: number }> {
    const pinned = await this.observedChatsWindow(observerAnchor, {
      edgePath: "is_pinned", op: "eq", eq: "true",
      order: [{ field: { property_path: "last_message_date" }, desc: true }],
    });
    return { pinnedChats: pinned, pinnedTotal: pinned.length };
  }

  /// The chats one observed_in edge key selects, five hundred at a time: the
  /// host frames an answer at one mebibyte, so a roster of thousands never
  /// comes in one window. A window that ends before its declared total is
  /// refused.
  /// @tested-by: tst_module_telegram_read_004, tst_module_telegram_plan_001
  private async observedChatsWindow(
    observerAnchor: string,
    filter: { edgePath: string; op: "eq" | "distinct"; eq: string; order?: { field: { property_path: string }; desc: boolean }[] },
  ): Promise<RawEntity[]> {
    const chats: RawEntity[] = [];
    const pageSize = 500;
    let total: number;
    do {
      const page = await this.graph.list_entities_window({
        schema: CHAT,
        filter_field: { edge_kind: "observed_in", observer_anchor: observerAnchor, edge_path: filter.edgePath },
        filter_op: filter.op,
        filter_eq: filter.eq,
        ...(filter.order === undefined ? {} : { order: filter.order }),
        limit: pageSize,
        offset: chats.length,
      });
      total = page.total;
      chats.push(...page.items.map(({ entity }) => entity));
      if (page.items.length === 0 && chats.length < total) {
        throw new Error("Telegram chat window ended before its declared total");
      }
    } while (chats.length < total);
    return chats;
  }

  /// The operator's observed_in edge to each chat, whatever its status.
  private async observedEdgesFor(chatIds: readonly string[], observerId: string): Promise<Map<string, LinkSummary>> {
    const out = new Map<string, LinkSummary>();
    for (const chatId of chatIds) {
      // @tested-by: tst_module_telegram_read_004
      // Filter before Graph traversal: a dense chat's in_chat edges are not observer state.
      const page = await this.graph.list_linked({
        parent_id: chatId,
        link_kind: "observed_in",
        direction: "in",
        limit: 1000,
        offset: 0,
      });
      if (page.items.length !== page.total) {
        throw new Error("Telegram observer window ended before its declared total");
      }
      const edge = page.items.find(({ link }) =>
        link.kind === "observed_in" && link.from_id === observerId && link.to_id === chatId
      )?.link;
      if (edge !== undefined) out.set(chatId, edge);
    }
    return out;
  }

  /// Per-chat state the OPERATOR observes, from its canonical observed_in edges.
  private async observedStateFor(chatIds: string[], observerId?: string): Promise<Map<string, Data>> {
    const out = new Map<string, Data>();
    if (chatIds.length === 0) return out;
    const currentObserver = observerId ?? (await this.operatorAccount())?.id;
    if (currentObserver === undefined) return out;
    for (const [chatId, edge] of await this.observedEdgesFor(chatIds, currentObserver)) {
      if (edge.validUntil === null && edge.metadata) out.set(chatId, edge.metadata);
    }
    return out;
  }

  /// The operator's edges to the chats a worker's page touches, with what each
  /// holds of the plan: the statement counts only when it was made in this pass.
  private async membershipEdges(
    identityKey: string,
    generation: string | null,
    chatEntityIds: readonly string[],
  ): Promise<{ selfId: string | null; edges: Map<string, MembershipEdge> }> {
    const edges = new Map<string, MembershipEdge>();
    if (chatEntityIds.length === 0) return { selfId: null, edges };
    const selfId = await this.graph.find_by_anchor(accountAnchor(identityKey));
    if (selfId === null) return { selfId, edges };
    for (const [chatId, edge] of await this.observedEdgesFor(chatEntityIds, selfId)) {
      const metadata = edge.metadata ?? {};
      const samePass = generation !== null && metadata.sync_pass === generation;
      const total = num(metadata, "sync_total");
      const stated = samePass && total !== null ? { total, skipped: num(metadata, "sync_skipped") ?? 0 } : null;
      edges.set(chatId, { edge, metadata, stated });
    }
    return { selfId, edges };
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
      message_count: num(d, "message_count"),
      avatar_url: avatar,
      is_pinned: boolFlag(d, "is_pinned") ?? false,
      pin_order: num(d, "pin_order"),
      is_indexed: boolFlag(d, "is_indexed"),
    };
  }

  @rpc("chats.list", {
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
    const observed = await this.operatorObservedState();
    if (observed === null) {
      const page = await this.graph.list_entities_window({
        schema: CHAT,
        order: [
          { field: { property_path: "is_pinned" }, desc: true },
          { field: { property_path: "pin_order" }, desc: false },
          { field: { property_path: "last_message_date" }, desc: true },
        ],
        limit,
        offset,
      });
      return {
        items: page.items.map(({ entity }) => this.buildChatItem(entity, {
          ...(((entity as { properties?: unknown }).properties ?? {}) as Data),
        })),
        total: page.total,
        limit,
        offset,
      };
    }

    const pinned = observed.orderedChats.slice(offset, offset + limit);
    const regularLimit = Math.max(0, limit - pinned.length);
    const regularOffset = Math.max(0, offset - observed.total);
    const regular = await this.graph.list_entities_window({
      schema: CHAT,
      filter_field: {
        edge_kind: "observed_in",
        observer_anchor: observed.observerAnchor,
        edge_path: "is_pinned",
      },
      filter_op: "distinct",
      filter_eq: "true",
      order: [{ field: { property_path: "last_message_date" }, desc: true }],
      limit: regularLimit,
      offset: regularOffset,
    });
    const items = pinned.map((entity) =>
      this.buildChatItem(entity, {
        ...(((entity as { properties?: unknown }).properties ?? {}) as Data),
        ...(observed.byChatId.get(entity.id) ?? {}),
      }),
    );
    items.push(...regular.items.map(({ entity }) =>
      this.buildChatItem(entity, {
        ...(((entity as { properties?: unknown }).properties ?? {}) as Data),
        is_pinned: false,
        pin_order: null,
      })));
    return { items, total: observed.total + regular.total, limit, offset };
  }

  @tool("get", { entity: "telegram.chat", description: "Get a Telegram chat by entity_id or raw chat_id.", params: CHAT_GET_PARAMS })
  @rpc("chats.get", {
    description: "Resolve one Telegram chat and its exact actionable Source account.",
    params: CHAT_GET_PARAMS,
  })
  async chatsGet(params: { entity_id: string } | { chat_id: number | string }): Promise<TelegramChatListItem> {
    if ("entity_id" in params && "chat_id" in params) throw new Error("Choose one chat get form");
    const entityId = "entity_id" in params ? params.entity_id : await this.chatEntityId(params.chat_id);
    const entity = await this.graph.get_entity(entityId);
    if (entity?.schema_id !== CHAT) {
      throw new Error(`${CHAT} ${entityId} not found`);
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
  @rpc("messages.list", {
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
    // @tested-by: tst_module_telegram_read_005 — one bounded author-link read per message page.
    const links = await this.graph.list_links_for_entities(messageIds);
    for (const id of messageIds) {
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
  @tool("get", { entity: "telegram.message", description: "Get a Telegram message by id.", params: MESSAGE_GET_PARAMS })
  @rpc("messages.get", {
    description: "Get a single telegram message detail by entity id.",
    params: MESSAGE_GET_PARAMS,
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

  /** End the stamped operator's active membership at Telegram's own time. */
  private async endMembership(payload: Data, identityKey: string | undefined): Promise<void> {
    if (identityKey === undefined) throw new Error("telegram membership end requires identity_key");
    const telegramUserId = num(payload, "telegram_user_id");
    if (telegramUserId === null || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
      throw new Error("telegram membership end requires telegram_user_id");
    }
    if (String(telegramUserId) !== identityKey) return;

    const chatId = chatIdOrNull(payload);
    if (chatId === null) throw new Error("telegram membership end requires chat_id");
    const validUntil = str(payload, "valid_until");
    if (validUntil === null) throw new Error("telegram membership end requires valid_until");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(validUntil)
      || Number.isNaN(Date.parse(validUntil))) {
      throw new Error("telegram membership end requires an exact RFC3339 valid_until");
    }

    const selfId = await this.graph.find_by_anchor(accountAnchor(identityKey));
    if (selfId === null) return;
    const chatEntityId = await this.graph.find_by_anchor(chatAnchor(chatId));
    if (chatEntityId === null) return;
    const edge = (await this.observedEdgesFor([chatEntityId], selfId)).get(chatEntityId);
    if (edge?.validUntil !== null) return;
    // @tested-by: tst_module_telegram_007
    // @invariant: valid_until is provider evidence, never Magnis wall time.
    await this.graph.end_link(edge.id, validUntil);
  }

  @syncHandler("telegram")
  async ingest(
    params: {
      envelopes?: SyncEnvelope[];
      /** The pass the worker is in (`initial:<row>:<lease>`); absent for a
       * Source effect outside a worker, which states nothing. */
      generation?: string;
    },
  ): Promise<{
    dropped_remote_ids: string[];
    trigger_checks: TriggerCheck[];
    plan?: Record<string, PlanDelta>;
    excluded?: string[];
  }> {
    const generation = typeof params.generation === "string" && params.generation !== "" ? params.generation : null;
    const statement = emptyStatement();
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
        if (kind === "live" && ("valid_until" in payload || "telegram_user_id" in payload)) {
          await this.endMembership(payload, identityKey);
          continue;
        }
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

    const newestMessageByChat = new Map<string, Data>();
    for (const { payload } of messages) {
      const chatId = chatIdOrNull(payload);
      if (chatId === null) continue;
      const current = newestMessageByChat.get(chatId);
      if (!current || (str(payload, "date") ?? "") >= (str(current, "date") ?? "")) {
        newestMessageByChat.set(chatId, payload);
      }
    }

    // Chats: the page's existing chats are read in two Graph calls, then written
    // batched + CHUNKED so the write never monopolizes the single connection.
    let pageChatState = new Map<string, IngestedChatState>();
    if (chats.length > 0) {
      pageChatState = await this.ingestChatBatch(chats, identityKey, newestMessageByChat, generation, statement);
    }

    // @tested-by: tst_module_telegram_004
    await this.ingestMessageBatch(messages, triggers, identityKey, pageChatState, generation, statement);

    // @tested-by: tst_module_telegram_plan_001 — a page outside a worker states nothing.
    if (generation === null) return { dropped_remote_ids: dropped, trigger_checks: triggers };
    return { dropped_remote_ids: dropped, trigger_checks: triggers, plan: planOf(statement), excluded: [...statement.excluded] };
  }

  /** One packet's existing chats in two Graph calls: anchors → ids, ids → dictionaries. */
  private async readChatsByAnchor(chatIds: readonly string[]): Promise<Map<string, IngestedChatState>> {
    const known = new Map<string, IngestedChatState>();
    const unique = [...new Set(chatIds)];
    if (unique.length === 0) return known;
    const ids = await this.graph.find_by_anchors(unique.map((chatId) => chatAnchor(chatId)));
    const found: { chatId: string; entityId: string }[] = [];
    unique.forEach((chatId, index) => {
      const entityId = ids[index];
      if (entityId) found.push({ chatId, entityId });
    });
    if (found.length === 0) return known;
    const entities = await this.graph.get_entities(found.map((item) => item.entityId));
    const byId = new Map(entities.map((item) => [item.id, item]));
    for (const { chatId, entityId } of found) {
      known.set(chatId, { entityId, details: byId.get(entityId)?.properties ?? {} });
    }
    return known;
  }

  // Bulk chat ingest for the bootstrap dialog list (one huge page). Batches chat
  // entities + chat.details records in CHUNKS, freeing the single PGlite connection
  // between batches.
  private async ingestChatBatch(
    chats: { env: SyncEnvelope; payload: Data }[],
    identityKey: string | undefined,
    newestMessageByChat: ReadonlyMap<string, Data>,
    generation: string | null,
    statement: PageStatement,
  ): Promise<Map<string, IngestedChatState>> {
    // A connector restart can emit another bootstrap-sized dialog snapshot for
    // chats that already exist. Those snapshots intentionally omit fields that
    // are derived by message ingest (and any locally resolved avatar), so load
    // the current DICTIONARIES once and preserve those fields during the
    // batch upsert (S4: the chat dict is the record — no dictionary writes).
    //
    // @tested-by: tst_mod_tg_ingest_001
    // @invariant: repeated bootstrap snapshots never erase chat list previews,
    // recency, sender names, or locally resolved avatar URLs.
    // @tested-by: tst_module_telegram_006
    // @invariant: a packet reads its own chats in two Graph calls — anchors,
    // then entities — never one lookup per chat and never the whole account.
    const existingByChatId = new Map<string, Data>();
    const existingEntityByChatId = new Map<string, string>();
    const packetChatIds: string[] = [];
    for (const { payload } of chats) {
      const chatId = chatIdOrNull(payload);
      if (chatId !== null) packetChatIds.push(chatId);
    }
    for (const [chatId, known] of await this.readChatsByAnchor(packetChatIds)) {
      existingByChatId.set(chatId, known.details);
      existingEntityByChatId.set(chatId, known.entityId);
    }
    // The operator's edge to each existing chat is read before it is written
    // again: the page's observed state joins what the edge holds, and the plan
    // is stated against the edge's statement — a chat first seen has no edge
    // and is stated in full.
    // @tested-by: tst_module_telegram_plan_001
    const membership = identityKey
      ? await this.membershipEdges(identityKey, generation, [...existingEntityByChatId.values()])
      : { selfId: null, edges: new Map<string, MembershipEdge>() };

    // Per-account chat STATE (unread counts, pins) rides the observed_in
    // edge from the OPERATOR's account — the fields are what one account
    // observes, not what the chat is (plan §6/§7).
    const STATE_KEYS = ["unread_count", "unread_mark", "is_pinned", "pin_order"];
    const ingestedByChatId = new Map<string, IngestedChatState>();

    for (let i = 0; i < chats.length; i += INGEST_CHUNK) {
      const entities: BatchEntityInput[] = [];
      const refs: BatchRefInput[] = [];
      const links: BatchLinkInput[] = [];
      const stateByRemoteId = new Map<string, { readonly chatId: string; readonly details: Data }>();
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
            // Telegram's exact count from an earlier read: a snapshot that
            // omits it (CatchUp, a live page) must not erase it.
            "message_count",
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
        const newestMessage = chatId === null ? undefined : newestMessageByChat.get(chatId);
        if (newestMessage !== undefined) {
          const newestDate = str(newestMessage, "date") ?? "";
          const currentDate = str(details, "last_message_date") ?? "";
          if (newestDate && (!currentDate || newestDate >= currentDate)) {
            details.last_message_date = newestDate;
            details.last_message_preview = str(newestMessage, "text") ?? "";
            details.last_sender_name = str(newestMessage, "sender_name") ?? "";
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
        if (chatId !== null) stateByRemoteId.set(remoteId, { chatId, details });
        // The edge IS the membership fact — a reported chat always gets it,
        // with the observed state as its dictionary when the page carries
        // any, and — inside a worker's pass — the statement the plan makes
        // for the chat. Snapshot omission does not change this membership;
        // only a provider-dated participant update may end it.
        const held = chatId === null ? undefined : membership.edges.get(existingEntityByChatId.get(chatId) ?? "");
        const metadata: Data = {
          ...(held?.metadata ?? {}),
          ...state,
          ...(generation === null ? {} : this.stateChat(chatId, details, state, held, generation, statement)),
        };
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
            metadata,
          });
        }
      }
      if (entities.length > 0) {
        const result = await this.graph.apply_batch({ entities, refs, links });
        for (const [remoteId, state] of stateByRemoteId) {
          const entityId = result.ids[remoteId];
          if (entityId) {
            ingestedByChatId.set(state.chatId, { entityId, details: state.details });
          }
        }
      }
      await Promise.resolve(); // yield between chunks so waiting RPCs get the connection
    }
    return ingestedByChatId;
  }

  /** What the plan states for one chat on a page, relative to the statement
   * its edge holds: an admitted chat's whole count, an excluded chat's first
   * page with the rest skipped, and the chat itself once per pass; a chat
   * without a count moves nothing but is still counted. The keys returned
   * ride the edge so the next page states against them.
   * @tested-by: tst_module_telegram_plan_001 */
  private stateChat(
    chatId: string | null,
    details: Data,
    state: Data,
    held: MembershipEdge | undefined,
    generation: string,
    statement: PageStatement,
  ): Data {
    const samePass = held?.metadata.sync_pass === generation;
    if (!samePass) statement.chats.total += 1;
    const pinned = boolFlag(state, "is_pinned") ?? (held === undefined ? null : boolFlag(held.metadata, "is_pinned")) ?? false;
    const admitted = pinned || this.shouldIndex(details);
    if (!admitted && chatId !== null) statement.excluded.add(chatId);
    const count = num(details, "message_count");
    if (count === null) {
      return held?.stated === null || held === undefined
        ? { sync_pass: generation }
        : { sync_pass: generation, sync_total: held.stated.total, sync_skipped: held.stated.skipped };
    }
    const planned = admitted ? count : Math.min(count, BOOTSTRAP_MESSAGES_PER_CHAT);
    const skipped = count - planned;
    const stated = held?.stated ?? { total: 0, skipped: 0 };
    statement.messages.total += planned - stated.total;
    statement.messages.skipped += skipped - stated.skipped;
    return { sync_pass: generation, sync_total: planned, sync_skipped: skipped };
  }

  // Bulk message ingest: the whole page becomes ONE graph.apply_batch (message
  // entities + details records + chat refs + sender contacts + links). Unique chats
  // and senders are read ONCE (not per message), so this kills F1 (the per-message
  // list_links scan — links now dedup via the batch's ON CONFLICT), F2 (per-message
  // chat/sender reads), and F3 (op-per-op). Web/file registration + the chat
  // last-message denorm run after apply (they need the resolved entity id).
  /** One page of messages: read its chats, build one fragment, write it, then
   * flush what the resolved ids made possible. Every step is named and every
   * step but the two writes is pure, so a page can be reasoned about — and
   * tested — without a graph.
   * @tested-by: tst_module_telegram_004, tst_module_telegram_plan_001 */
  private async ingestMessageBatch(
    messages: readonly { env: SyncEnvelope; payload: Data }[],
    triggers: TriggerCheck[],
    identityKey: string | undefined,
    pageChatState: ReadonlyMap<string, IngestedChatState> = new Map(),
    generation: string | null = null,
    statement: PageStatement = emptyStatement(),
  ): Promise<void> {
    const page = messages.map(pageMessageOf).filter((message) => message.remoteId !== "");
    if (page.length === 0) return;

    const chats = await this.resolveChats(page, pageChatState);
    // Edits and retries retain their anchor. Resolve live identities once per page,
    // before writing them, so neither chat counts nor worker deltas grow twice.
    const liveAnchors = [...new Set(page.filter((message) => message.isLive).map((message) => message.remoteId))];
    const existingLive = liveAnchors.length === 0 ? [] : await this.graph.find_by_anchors(liveAnchors);
    if (existingLive.length !== liveAnchors.length) throw new Error("Telegram live anchor lookup returned an incomplete result");
    const newLiveMessages = new Set(liveAnchors.filter((_, index) => existingLive[index] === null));
    const fragment = buildFragment(page, identityKey);
    await this.stateLiveMessages(page, chats, fragment, identityKey, generation, statement, newLiveMessages);

    const result = await this.graph.apply_batch({
      entities: [...fragment.entities.values()],
      refs: [...fragment.refs.values()],
      links: [...fragment.links.values()],
    });

    const effects = buildEffects(page, result.ids, chats, pageChatState, (details) => this.shouldIndex(details), newLiveMessages);
    triggers.push(...effects.triggers);
    await this.flush(effects);
  }

  /** The page's chats, each read once: those its own chat envelopes already
   * ingested come from the page, the rest from two Graph calls.
   * @tested-by: tst_module_telegram_006 */
  private async resolveChats(
    page: readonly PageMessage[],
    pageChatState: ReadonlyMap<string, IngestedChatState>,
  ): Promise<ChatContext> {
    const wanted = new Set(page.flatMap((message) => (message.chatId === null ? [] : [message.chatId])));
    const chats = new Map<string, ChatEntry>();
    const unresolved: string[] = [];
    for (const chatId of wanted) {
      const ingested = pageChatState.get(chatId);
      if (ingested === undefined) unresolved.push(chatId);
      else chats.set(chatId, ingested);
    }
    const read = await this.readChatsByAnchor(unresolved);
    for (const [chatId, entry] of read) chats.set(chatId, entry);
    return chats;
  }

  /** A live message on an admitted chat moves the plan by one and the edge's
   * statement with it, in the page's own fragment; on an excluded chat it moves
   * nothing. The edges are the one read this step needs.
   * @tested-by: tst_module_telegram_plan_001 */
  private async stateLiveMessages(
    page: readonly PageMessage[],
    chats: ChatContext,
    fragment: Fragment,
    identityKey: string | undefined,
    generation: string | null,
    statement: PageStatement,
    newLiveMessages: ReadonlySet<string>,
  ): Promise<void> {
    if (generation === null || !identityKey) return;
    const liveByChat = countLiveByChat(page, newLiveMessages);
    if (liveByChat.size === 0) return;

    const chatEntityIds = [...liveByChat.keys()].flatMap((chatId) => {
      const entityId = chats.get(chatId)?.entityId;
      return entityId === null || entityId === undefined ? [] : [entityId];
    });
    const { edges } = await this.membershipEdges(identityKey, generation, chatEntityIds);

    for (const [chatId, live] of liveByChat) {
      const entry = chats.get(chatId);
      const held = entry?.entityId === null || entry?.entityId === undefined ? undefined : edges.get(entry.entityId);
      const pinned = held === undefined ? false : boolFlag(held.metadata, "is_pinned") ?? false;
      if (!(pinned || this.shouldIndex(entry?.details ?? null))) {
        statement.excluded.add(chatId);
        continue;
      }
      if (held?.stated === null || held?.stated === undefined) continue; // the chat's own page states it
      statement.messages.total += live;
      fragment.refs.set("self", { key: "self", anchor: accountAnchor(identityKey) });
      fragment.refs.set(`chat:${chatId}`, { key: `chat:${chatId}`, anchor: chatAnchor(chatId) });
      fragment.links.set(`self observed_in chat:${chatId}`, {
        from_key: "self",
        to_key: `chat:${chatId}`,
        kind: "observed_in",
        declared_by: `chat:${chatId}`,
        metadata: { ...held.metadata, sync_total: held.stated.total + live },
      });
    }
  }

  /** The host calls a committed page still owes: links, attachments and the
   * chat denorm. One call each today; the host's batch twins replace the loops
   * without touching what is collected. */
  /** The only place a page still talks to the host after its body. Each kind
   * of write leaves in ONE call, so what a page costs is set by the kinds it
   * carries, not by how many items it carries. */
  private async flush(effects: PageEffects): Promise<void> {
    if (effects.webLinks.length > 0) await this.graph.web_register_batch(effects.webLinks);
    if (effects.files.length > 0) await this.graph.file_register_batch(effects.files);
    if (effects.chatUpdates.length > 0) await this.graph.update_properties_batch(effects.chatUpdates);
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

  private shouldIndex(chatDetails: Data | null): boolean {
    if (!chatDetails) return true;
    const forced = boolFlag(chatDetails, "is_indexed");
    if (forced !== null) return forced;
    const type = str(chatDetails, "type") ?? "";
    if (type === "private") return true;
    const memberCount = num(chatDetails, "member_count");
    return memberCount !== null && memberCount <= INDEXING_THRESHOLD;
  }

  @writeTool("create", {
    entity: "telegram.message",
    description: "Create a Telegram message {chat_id,text,reply_to_message_id?,account_id?} or batch {messages:[{chat_id,text,reply_to_message_id?,chat_name?}],account_id?,excluded_indices?}.",
    params: { oneOf: [SEND_PARAMS, BATCH_SEND_PARAMS] },
    allowlist_gate: { target_type: "telegram_chat", target_arg: "chat_id", batch_arg: "messages" },
  })
  async create(params: SendParams | BatchSendParams): Promise<Record<string, unknown>> {
    if ("messages" in params) {
      if ("chat_id" in params || "text" in params || "reply_to_message_id" in params) throw new Error("Choose one Telegram create form: single or messages");
      return this.messagesBatchSend(params);
    }
    return this.messagesSend(params);
  }

  @rpc("messages.send", {
    description: "Send a Telegram message to a chat. May require approval before execution.",
    params: SEND_PARAMS,
  })
  async messagesSend(params: SendParams): Promise<Record<string, unknown>> {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }

  @rpc("messages.reply", {
    description: "Reply to a specific Telegram message in a chat. May require approval before execution.",
    params: REPLY_PARAMS,
  })
  async messagesReply(params: ReplyParams): Promise<Record<string, unknown>> {
    return this.sendMessage(params.chat_id, params.text, params.reply_to_message_id, params.account_id);
  }

  @rpc("batch_send", {
    description:
      "Send Telegram messages to multiple recipients in one batch (1..50). Each message needs chat_id and text; reply_to_message_id is optional. ALWAYS include chat_name — the recipient's human display name (e.g. \"Dylan Dewdney\") — so the approval card shows who each message goes to instead of a raw chat_id. Use this for multi-recipient outreach so the user reviews ONE approval instead of N separate sends. Returns per-recipient results.",
    params: BATCH_SEND_PARAMS,
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
        undefined,
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
        account_id: { type: "string" },
      },
      required: ["chat_id"],
      additionalProperties: false,
    },
  })
  async messagesBackfill(
    params: BackfillParams,
  ): Promise<{ count: number; skipped: number; pending: boolean }> {
    // The selected chat remains module state. The graph owns target selection
    // and wakes the standard Source fetch without a provider-specific command.
    await this.graph.request_backfill({}, params.account_id);
    return { count: 0, skipped: 0, pending: true };
  }

  // ── triggers ──────────────────────────────────────────────────
  @rpc("set_trigger", {
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
    if (!params.gate_prompt.trim() || !params.action_prompt.trim()) throw new Error("gate_prompt and action_prompt are required");
    if (params.debounce_seconds !== undefined && (!Number.isInteger(params.debounce_seconds) || params.debounce_seconds < 0)) throw new Error("invalid debounce_seconds");
    if (params.episode_id !== undefined) {
      const parent = await this.graph.get_entity_full(params.episode_id, { links: false });
      if (parent?.entity.schema_id !== "episodes.episode") throw new Error(`episode not found: ${params.episode_id}`);
    }
    const chatEntityId = await this.chatEntityId(params.chat_id);
    // Delegate to the triggers module via the cross-module hub (rpc_calls).
    return this.rpc.execute("triggers.create", {
      name: `Telegram trigger: chat ${String(params.chat_id)}`,
      watch_entity_ids: [chatEntityId],
      gate_prompt: params.gate_prompt,
      action_prompt: params.action_prompt,
      schema_filter: "telegram",
      debounce_seconds: params.debounce_seconds ?? 0,
      ...(params.episode_id === undefined ? {} : { episode_id: params.episode_id }),
    });
  }

  private async chatEntityId(chatId: number | string): Promise<string> {
    const id = await this.graph.find_by_anchor(chatAnchor(String(chatId)));
    if (!id) throw new Error(`Telegram chat ${String(chatId)} not found. Sync messages first.`);
    return id;
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
