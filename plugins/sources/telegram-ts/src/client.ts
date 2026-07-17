// Live gramjs MTProto client wrapper — TS twin of
// plugins/sources/telegram/src/client.rs (which itself ports the in-backend
// client.rs + client_api.rs).
//
// The connector builds its own gramjs `TelegramClient` from the per-call
// `_meta = { api_id, api_hash, session }` the host injects. Auth (phone → code →
// 2FA) happens in auth.ts; this module consumes an already-authorized session.
//
// !! SESSION FORMAT BREAK vs the Rust connector: Rust mints
// `base64(grammers Session::save())`; this connector mints a gramjs
// `StringSession.save()` string. The two are DIFFERENT, mutually unreadable
// formats. A `session` credential minted by one connector CANNOT be consumed by
// the other — cutting over from `telegram` to `telegram-ts` (or back) requires
// the user to RE-AUTHENTICATE. Everything else on the wire is parity.
//
// Live mode is BEST-EFFORT (as in Rust): the fully-tested path is fixture mode
// plus the injectable seams below (`DialogPager`, `TgClientLike`), which the bun
// tests drive with in-memory fakes — no network.

import type { TgChat, TgMessage, TgSenderInfo } from "./envelope";
import { toRfc3339Utc } from "./envelope";

/** Per-chat message hydration depth during bootstrap. Each enumerated dialog's
 * newest N messages are fetched (GetDialogs carries only each chat's single top
 * message), preserving the snapshot the in-backend bootstrap produced. */
export const BOOTSTRAP_MESSAGES_PER_CHAT = 50;

/** Upper bound (seconds) on a FLOOD_WAIT the send path absorbs inline via
 * wait+retry. At or below this the connector sleeps and retries once (the
 * message still goes out); a longer one surfaces as a typed rate-limit so the
 * HOST schedules the backoff rather than the connector blocking for minutes. */
export const FLOOD_WAIT_RETRY_MAX = 30;

/** Sentinel prefix carried up the error channel for a FLOOD_WAIT longer than
 * FLOOD_WAIT_RETRY_MAX. `dispatch.ts::classifyToolError` recognizes it → JSON-RPC
 * -32002 + `data: { retry_after: secs }`; the host maps that to
 * `SourceError::RateLimit`. Twin of the Rust `RATE_LIMITED_PREFIX`. */
export const RATE_LIMITED_PREFIX = "RATE_LIMITED:";

// ── structural gramjs seams ────────────────────────────────────────────────
//
// We type gramjs structurally (rather than importing its classes) so the pure
// conversions below are unit-testable with plain objects and NO network. The
// real gramjs values satisfy these shapes.

/** A Telegram RPC error. gramjs `RPCError` carries `.code` + `.errorMessage`;
 * `FloodWaitError` additionally carries `.seconds`. */
export interface RpcErrorLike {
  code?: number;
  errorMessage?: string;
  seconds?: number;
}

/** gramjs entity (Api.User | Api.Chat | Api.Channel), narrowed to what we read. */
export interface EntityLike {
  className?: string;
  id?: unknown;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  title?: string;
  participantsCount?: number;
  accessHash?: unknown;
  megagroup?: boolean;
  gigagroup?: boolean;
  broadcast?: boolean;
  bot?: boolean;
}

/** gramjs media (Api.MessageMediaPhoto | …Document | …), narrowed. */
export interface MediaLike {
  className?: string;
  document?: {
    mimeType?: string;
    attributes?: { className?: string; fileName?: string }[];
  };
  photo?: unknown;
}

/** gramjs message (Api.Message / CustomMessage), narrowed. */
export interface MessageLike {
  id: number;
  message?: string;
  /** unix SECONDS (Telegram wire format). */
  date?: number;
  out?: boolean;
  pinned?: boolean;
  media?: MediaLike | null;
  replyTo?: { replyToMsgId?: number } | null;
  chat?: EntityLike | null;
  sender?: EntityLike | null;
}

/** Normalize a gramjs id (bigInt.BigInteger | number | string) to a JS number. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  if (v !== null && v !== undefined && typeof (v as { toString?: unknown }).toString === "function") {
    return Number((v as { toString(): string }).toString());
  }
  return 0;
}

/** Coerce an unknown thrown value into the RPC-error shape we classify on. */
function asRpcError(e: unknown): RpcErrorLike | undefined {
  if (e === null || typeof e !== "object") return undefined;
  return e as RpcErrorLike;
}

/** If `err` is a Telegram FLOOD_WAIT, return its wait in seconds. gramjs
 * surfaces a flood-wait as a `FloodWaitError` (code 420, `.seconds` set) whose
 * `errorMessage` is `FLOOD_WAIT`. Twin of the Rust `flood_wait_secs`. */
export function floodWaitSecs(err: unknown): number | undefined {
  const rpc = asRpcError(err);
  if (rpc === undefined) return undefined;
  const isFlood =
    rpc.code === 420 || (rpc.errorMessage ?? "").startsWith("FLOOD_WAIT");
  if (!isFlood) return undefined;
  return typeof rpc.seconds === "number" ? rpc.seconds : undefined;
}

/** FLOOD_WAIT-aware send wrapper. Generic over the send (so the live gramjs call
 * and a test fake share ONE policy) and over the sleeper (so tests don't wait
 * real seconds). Twin of the Rust `send_with_flood_retry`:
 *
 * - send succeeds → return the result.
 * - FLOOD_WAIT of `secs <= FLOOD_WAIT_RETRY_MAX` → sleep(secs), retry ONCE and
 *   return that retry's outcome (success OR error).
 * - FLOOD_WAIT of `secs > FLOOD_WAIT_RETRY_MAX` → throw `RATE_LIMITED:{secs}`
 *   IMMEDIATELY (no sleep, connector never blocks).
 * - any other error → propagated unchanged.
 */
export async function sendWithFloodRetry<T>(
  send: () => Promise<T>,
  sleep: (secs: number) => Promise<void>,
): Promise<T> {
  try {
    return await send();
  } catch (err) {
    const secs = floodWaitSecs(err);
    if (secs === undefined) throw err;
    if (secs <= FLOOD_WAIT_RETRY_MAX) {
      await sleep(secs);
      return await send();
    }
    throw new Error(`${RATE_LIMITED_PREFIX}${secs}`);
  }
}

// ── credentials (_meta) ────────────────────────────────────────────────────

/** Credentials injected per call by the host under `_meta`. */
export interface TgCreds {
  api_id: number;
  api_hash: string;
  /** gramjs StringSession blob of an already-authorized session. */
  session: string;
}

function metaOf(args: Record<string, unknown>): Record<string, unknown> | undefined {
  const m = args._meta;
  return m !== null && typeof m === "object" ? (m as Record<string, unknown>) : undefined;
}

/** Pull `{ api_id, api_hash, session }` out of the tool-call `_meta`. All three
 * are required — a missing key is an error (NO FALLBACK). Messages are
 * byte-identical to the Rust `creds_from_meta`. */
export function credsFromMeta(args: Record<string, unknown>): TgCreds {
  const meta = metaOf(args);
  if (meta === undefined) throw new Error("missing _meta with Telegram credentials");

  const rawApiId = meta.api_id;
  let apiId: number | undefined;
  if (typeof rawApiId === "number" && Number.isFinite(rawApiId)) {
    apiId = Math.trunc(rawApiId);
  } else if (typeof rawApiId === "string") {
    // The Rust side parses the string as an i64; a non-numeric string → None.
    const parsed = /^-?\d+$/.test(rawApiId.trim()) ? Number(rawApiId.trim()) : NaN;
    if (Number.isFinite(parsed)) apiId = parsed;
  }
  if (apiId === undefined || apiId <= 0) {
    throw new Error("missing or invalid credential 'api_id' in _meta");
  }

  const apiHash = meta.api_hash;
  if (typeof apiHash !== "string" || apiHash === "") {
    throw new Error("missing credential 'api_hash' in _meta");
  }

  const session = meta.session;
  if (typeof session !== "string" || session === "") {
    throw new Error("missing credential 'session' in _meta");
  }

  return { api_id: apiId, api_hash: apiHash, session };
}

/** Pull the REQUIRED `account_id` out of the tool-call `_meta`. The host always
 * injects it; a missing or empty value is an error (NO FALLBACK) so a caller
 * never silently collapses every account's session to `""` — which would leave
 * media `source_ref.account_id` empty and break the download worker. */
export function accountIdFromMeta(args: Record<string, unknown>): string {
  const meta = metaOf(args);
  const id = meta?.account_id;
  if (typeof id !== "string" || id === "") {
    throw new Error("missing required _meta.account_id");
  }
  return id;
}

// ── per-chat history error policy ──────────────────────────────────────────

/** Whether a per-chat history error is FATAL (abort the bootstrap batch and
 * surface to the host) versus TRANSIENT (skip this one chat's history and
 * continue — the chat itself is still discovered).
 *
 * - FATAL: RPC code 401 (auth/session dead — AUTH_KEY_UNREGISTERED,
 *   SESSION_REVOKED, USER_DEACTIVATED); code 420 / `FLOOD_WAIT*` (needs the
 *   host's backoff scheduling, not a per-chat swallow).
 * - TRANSIENT: everything else — server `RPC_CALL_FAIL` (code 500, the
 *   real-world getHistory 500 that aborted bootstrap at 1954/2581), other 5xx,
 *   connection drops, or any non-RPC error. A later cycle re-attempts the chat.
 */
export function historyErrorIsFatal(err: unknown): boolean {
  const rpc = asRpcError(err);
  if (rpc === undefined) return false;
  if (typeof rpc.code !== "number") {
    return (rpc.errorMessage ?? "").startsWith("FLOOD_WAIT");
  }
  return (
    rpc.code === 401 || rpc.code === 420 || (rpc.errorMessage ?? "").startsWith("FLOOD_WAIT")
  );
}

/** Resolve one dialog's history-hydration result into the messages to attach.
 * Decoupled from the I/O (the caller fetches into a settled result) so the
 * skip/propagate policy is unit-testable.
 *
 * - ok → attach the messages.
 * - transient error → log to stderr, return [] : the chat is STILL discovered
 *   (its chat envelope is emitted), only its history snapshot is skipped, and
 *   the batch continues. This is the fix for one chat's 500 aborting bootstrap.
 * - fatal error → rethrow (auth / flood-wait): the batch aborts.
 */
export function resolveHydratedMessages(
  chatId: number,
  fetched: { ok: true; messages: TgMessage[] } | { ok: false; error: unknown },
): TgMessage[] {
  if (fetched.ok) return fetched.messages;
  if (historyErrorIsFatal(fetched.error)) throw fetched.error;
  console.error(
    `magnis-telegram-ts: skipping history for chat ${chatId} ` +
      `(getHistory failed, transient — chat still discovered): ${String(fetched.error)}`,
  );
  return [];
}

// ── dialog pagination seam ─────────────────────────────────────────────────

/** Serializable dialog-list pagination offset persisted in the bootstrap cursor
 * under `dialog_offset`. Mirrors the `messages.getDialogs` offset triple so the
 * next batch resumes where the last one stopped instead of re-walking the top. */
export interface DialogOffset {
  offset_date: number;
  offset_id: number;
  offset_peer: OffsetPeer;
}

export interface OffsetPeer {
  /** `"user"` | `"chat"` | `"channel"` — the InputPeer category. */
  ty: string;
  id: number;
  /** Omitted entirely when null (basic groups / `min` peers have no hash). */
  access_hash?: number;
}

/** gramjs entity className → the persisted `OffsetPeer.ty`. Twin of the Rust
 * `PackedType` map: User|Bot→"user", Chat→"chat",
 * Megagroup|Broadcast|Gigagroup→"channel". */
export function offsetPeerTyFromEntity(entity: EntityLike): string {
  switch (entity.className) {
    case "User":
      return "user";
    case "Chat":
    case "ChatForbidden":
      return "chat";
    case "Channel":
    case "ChannelForbidden":
      return "channel";
    default:
      return "chat";
  }
}

/** Build the persisted offset peer from an entity, omitting a null access_hash. */
export function offsetPeerFromEntity(entity: EntityLike): OffsetPeer {
  const peer: OffsetPeer = {
    ty: offsetPeerTyFromEntity(entity),
    id: toNum(entity.id),
  };
  if (entity.accessHash !== null && entity.accessHash !== undefined) {
    peer.access_hash = toNum(entity.accessHash);
  }
  return peer;
}

/** One enumerated dialog with its chat snapshot + hydrated messages, already
 * converted to the canonical intermediates. `pin_order` on `chat` is a
 * placeholder (0) — the bootstrap LOOP assigns the authoritative running order. */
export interface PagedDialog {
  chat: TgChat;
  messages: TgMessage[];
}

/** One page of the dialog list. `next_offset === null` means the walk is
 * exhausted (the loop reports hasMore=false and the host transitions to
 * CatchUp). `total` is the server's estimate of the FULL dialog count
 * (`messages.dialogsSlice.count`), surfaced for the sync-progress bar; the
 * non-slice `Dialogs` variant (complete list) carries no count → dialogs.length.
 * `null` only when the pager does not report one (test fakes that opt out). */
export interface DialogPage {
  dialogs: PagedDialog[];
  next_offset: DialogOffset | null;
  total: number | null;
}

/** Fetches one page of dialogs starting at `offset` (null = from the top). The
 * LIVE impl talks to Telegram; the test fake serves an in-memory list. */
export interface DialogPager {
  dialogPage(offset: DialogOffset | null, limit: number): Promise<DialogPage>;
}

// ── gramjs → canonical intermediate conversion ─────────────────────────────

/** `(media_type, has_media, file_name)` for a gramjs message — twin of the Rust
 * `extract_media_info`. */
export function extractMediaInfo(message: MessageLike): {
  media_type?: string;
  has_media: boolean;
  file_name?: string;
} {
  const media = message.media;
  if (media === null || media === undefined) return { has_media: false };

  switch (media.className) {
    case "MessageMediaPhoto":
      return { media_type: "photo", has_media: true };
    case "MessageMediaDocument": {
      const doc = media.document;
      // A sticker is a Document carrying an Attribute Sticker — gramjs has no
      // dedicated Media::Sticker variant (grammers does), so detect it here to
      // preserve the Rust `Media::Sticker` → ("sticker", true, None) arm.
      const attrs = doc?.attributes ?? [];
      const isSticker = attrs.some((a) => a.className === "DocumentAttributeSticker");
      if (isSticker) return { media_type: "sticker", has_media: true };

      const mime = doc?.mimeType ?? "";
      let mediaType: string;
      if (mime.startsWith("video/")) mediaType = "video";
      else if (mime === "audio/ogg" || mime.includes("opus")) mediaType = "voice";
      else if (mime.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";

      const named = attrs.find((a) => a.className === "DocumentAttributeFilename");
      const name = named?.fileName ?? "";
      return {
        media_type: mediaType,
        has_media: true,
        ...(name === "" ? {} : { file_name: name }),
      };
    }
    default:
      // Non-downloadable media (WebPage, Contact, Geo, Poll, …): media_type for
      // display, but NO source_ref / file_name.
      return { media_type: "unsupported", has_media: false };
  }
}

/** gramjs entity className → the canonical chat `type`. Twin of the Rust
 * `chat_type_str`: User→private, Group→group, Channel→supergroup. NOTE both
 * broadcast channels AND megagroups are gramjs `Api.Channel` → "supergroup". */
export function chatTypeStr(entity: EntityLike): string {
  switch (entity.className) {
    case "User":
      return "private";
    case "Chat":
    case "ChatForbidden":
      return "group";
    default:
      return "supergroup";
  }
}

/** Twin of the Rust `chat_member_count`: User→null, Group/Channel→participants. */
export function chatMemberCount(entity: EntityLike): number | undefined {
  if (entity.className === "User") return undefined;
  return typeof entity.participantsCount === "number" ? entity.participantsCount : undefined;
}

/** Twin of the Rust `chat_username`: User/Channel only; a basic Group→null. */
export function chatUsername(entity: EntityLike): string | undefined {
  if (entity.className === "User" || entity.className === "Channel") {
    // gramjs: absent username = null (grammers: Option::None) — fold both out.
    return entity.username != null && entity.username !== "" ? entity.username : undefined;
  }
  return undefined;
}

/** Twin of grammers' `Chat::name()`: a User's full name, else the title. */
export function entityName(entity: EntityLike): string {
  if (entity.className === "User") {
    return [entity.firstName ?? "", entity.lastName ?? ""].join(" ").trim();
  }
  return entity.title ?? "";
}

/** Twin of the Rust `sender_display_name`: the entity's name when non-empty;
 * else a User falls back to `@username` / `User {id}`; else the bare id. */
export function senderDisplayName(sender: EntityLike | null | undefined): string | undefined {
  if (sender === null || sender === undefined) return undefined;
  const name = entityName(sender);
  if (name !== "") return name;
  if (sender.className === "User") {
    return sender.username != null && sender.username !== ""
      ? `@${sender.username}`
      : `User ${toNum(sender.id)}`;
  }
  return String(toNum(sender.id));
}

/** gramjs `Message` → canonical `TgMessage`. Twin of `message_to_intermediate`.
 *
 * `chat_id` is the authoritative DIALOG id supplied by the CALLER, NOT
 * `message.chat.id`: messages fetched via getMessages can carry a "min" peer
 * whose own id differs from the dialog id, and keying to it ORPHANS the message
 * from its chat entity (messages.list returns nothing). Always key to the
 * dialog. EXCEPTION: live updates carry a full chat, so the listener passes
 * `msg.chat.id`.
 */
export function messageToIntermediate(
  message: MessageLike,
  accountId: string,
  chatId: number,
): TgMessage {
  const chat = message.chat;
  const chatName = chat !== null && chat !== undefined ? entityName(chat) : "";
  const sender = message.sender;
  const media = extractMediaInfo(message);

  const senderInfo: TgSenderInfo | undefined =
    sender !== null && sender !== undefined && sender.className === "User"
      ? {
          first_name: sender.firstName ?? "",
          // gramjs sets absent fields to null (grammers: Option::None → key
          // omitted, envelope.rs:19-24 skip_serializing_if). `!= null` drops
          // both null and undefined — a null here fails the module schema.
          ...(sender.lastName != null ? { last_name: sender.lastName } : {}),
          ...(sender.username != null ? { username: sender.username } : {}),
          ...(sender.phone != null ? { phone: sender.phone } : {}),
        }
      : undefined;

  const senderName = senderDisplayName(sender);
  // sender_id is emitted ONLY for User senders (a channel/group sender has none).
  const senderId =
    sender !== null && sender !== undefined && sender.className === "User"
      ? toNum(sender.id)
      : undefined;
  const replyTo = message.replyTo?.replyToMsgId;

  return {
    message_id: message.id,
    chat_id: chatId,
    text: message.message ?? "",
    date: toRfc3339Utc(new Date((message.date ?? 0) * 1000)),
    is_outgoing: message.out === true,
    ...(chatName === "" ? {} : { chat_title: chatName }),
    ...(senderName === undefined ? {} : { sender_name: senderName }),
    ...(senderId === undefined ? {} : { sender_id: senderId }),
    ...(replyTo === undefined || replyTo === null ? {} : { reply_to_msg_id: replyTo }),
    ...(media.media_type === undefined ? {} : { media_type: media.media_type }),
    has_media: media.has_media,
    ...(media.file_name === undefined ? {} : { file_name: media.file_name }),
    is_pinned: message.pinned === true,
    ...(senderInfo === undefined ? {} : { sender_info: senderInfo }),
    account_id: accountId,
    live: false,
  };
}

/** Dialog metadata, twin of the Rust `DialogMeta`. */
export interface DialogMeta {
  is_pinned: boolean;
  pin_order: number;
  unread_count: number;
  unread_mark: boolean;
  read_inbox_max_id: number;
  read_outbox_max_id: number;
  unread_mentions_count: number;
  top_message: number;
  pts?: number;
}

/** Raw TL dialog fields we read (Api.Dialog). */
export interface RawDialogLike {
  className?: string;
  pinned?: boolean;
  unreadCount?: number;
  unreadMark?: boolean;
  readInboxMaxId?: number;
  readOutboxMaxId?: number;
  unreadMentionsCount?: number;
  topMessage?: number;
  pts?: number;
  peer?: unknown;
}

/** Extract dialog metadata from a raw TL Dialog — twin of `build_dialog_meta`.
 * A Folder dialog zeroes every counter. */
export function buildDialogMeta(
  raw: RawDialogLike,
  isPinned: boolean,
  pinOrder: number,
): DialogMeta {
  if (raw.className === "DialogFolder") {
    return {
      is_pinned: isPinned,
      pin_order: pinOrder,
      unread_count: 0,
      unread_mark: false,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_mentions_count: 0,
      top_message: 0,
    };
  }
  return {
    is_pinned: isPinned,
    pin_order: pinOrder,
    unread_count: raw.unreadCount ?? 0,
    unread_mark: raw.unreadMark === true,
    read_inbox_max_id: raw.readInboxMaxId ?? 0,
    read_outbox_max_id: raw.readOutboxMaxId ?? 0,
    unread_mentions_count: raw.unreadMentionsCount ?? 0,
    top_message: raw.topMessage ?? 0,
    ...(raw.pts === undefined || raw.pts === null ? {} : { pts: raw.pts }),
  };
}

/** gramjs entity (dialog) → canonical `TgChat`. Twin of `chat_to_intermediate`. */
export function chatToIntermediate(entity: EntityLike, meta: DialogMeta): TgChat {
  const memberCount = chatMemberCount(entity);
  const username = chatUsername(entity);
  return {
    chat_id: toNum(entity.id),
    title: entityName(entity),
    chat_type: chatTypeStr(entity),
    is_pinned: meta.is_pinned,
    pin_order: meta.pin_order,
    unread_count: meta.unread_count,
    unread_mark: meta.unread_mark,
    read_inbox_max_id: meta.read_inbox_max_id,
    read_outbox_max_id: meta.read_outbox_max_id,
    unread_mentions_count: meta.unread_mentions_count,
    top_message: meta.top_message,
    ...(meta.pts === undefined ? {} : { pts: meta.pts }),
    ...(memberCount === undefined ? {} : { member_count: memberCount }),
    ...(username === undefined ? {} : { username }),
    // avatar_url is always null here (twin of the Rust `avatar_url: None`).
  };
}
