// Live gramjs glue — the ONLY module that imports `telegram` (gramjs). Everything
// else in this connector is pure and unit-tested with in-memory fakes, mirroring
// the Rust split where `commands.rs` is generic over the `DialogPager` seam.
//
// Live mode is BEST-EFFORT (as the Rust connector states): the fully-tested paths
// are fixture mode + the injected seams. The gramjs wiring here mirrors
// plugins/sources/telegram/src/client.rs but is exercised only against real
// Telegram.

import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { EditedMessage } from "telegram/events/EditedMessage";
import { NewMessage } from "telegram/events/NewMessage";
import type {
  DialogOffset,
  DialogPage,
  DialogPager,
  EntityLike,
  MessageLike,
  PagedDialog,
  RawDialogLike,
  TgCreds,
} from "./client";
import {
  BOOTSTRAP_MESSAGES_PER_CHAT,
  buildDialogMeta,
  chatToIntermediate,
  messageToIntermediate,
  MTPROTO_REQUEST_TIMEOUT_MS,
  offsetPeerFromEntity,
  resolveHydratedMessages,
  toNum,
  withTimeout,
} from "./client";
import type { CatchupDialog, TgOps } from "./commands";

/** Client init params — byte-identical to the Rust `InitParams`. */
const INIT_PARAMS = {
  deviceModel: "Magnis",
  systemVersion: "1.0",
  appVersion: "0.1.0",
  systemLangCode: "en",
  langCode: "en",
} as const;

/** gramjs `TelegramClient` options — the robustness knobs the original build
 * left at defaults (the reason a dropped response could hang forever, where the
 * deleted grammers twin reconnected). Each value is explicit + justified:
 *
 * - `timeout: 60`          per-connection sender timeout (s) before gramjs
 *                          considers the socket stalled and cycles it.
 * - `requestRetries: 2`    resend a request that errors transiently twice
 *                          before failing (belt to withTimeout's suspenders).
 * - `connectionRetries: 5` attempts to re-establish a dropped MTProto transport.
 * - `retryDelay: 1000`     ms between reconnect attempts.
 * - `autoReconnect: true`  reconnect the transport on drop instead of dying
 *                          silently mid-run (gramjs default, pinned explicit).
 * - `floodSleepThreshold`  floods <= 30s are auto-slept by gramjs (fine); a
 *                          LONGER flood is THROWN as FloodWaitError so the
 *                          connector surfaces it as a typed -32002 rate-limit
 *                          (see dispatch.classifyToolError) instead of the host
 *                          silently blocking for minutes. Matches
 *                          FLOOD_WAIT_RETRY_MAX. */
const CLIENT_OPTIONS = {
  ...INIT_PARAMS,
  timeout: 60,
  requestRetries: 2,
  connectionRetries: 5,
  retryDelay: 1000,
  autoReconnect: true,
  floodSleepThreshold: 30,
} as const;

// ── auth-flow seams (auth.ts) ──────────────────────────────────────────────

/** The authorized user gramjs hands back after sign-in. */
export interface TgUserLike {
  id: unknown;
  firstName?: string;
  lastName?: string;
  username?: string;
}

/** The client surface `auth.ts` drives — injectable so the auth state machine is
 * unit-tested without a network. */
export interface AuthClientLike {
  session: { save(): string };
  sendCode(
    creds: { apiId: number; apiHash: string },
    phone: string,
  ): Promise<{ phoneCodeHash: string }>;
  signIn(params: {
    phoneNumber: string;
    phoneCodeHash: string;
    phoneCode: string;
  }): Promise<TgUserLike>;
  signInWithPassword(password: string): Promise<TgUserLike>;
  logOut(): Promise<void>;
}

export interface AuthClientFactory {
  connectFresh(apiId: number, apiHash: string): Promise<AuthClientLike>;
  connectWithSession(apiId: number, apiHash: string, session: string): Promise<AuthClientLike>;
}

function wrapAuthClient(client: TelegramClient): AuthClientLike {
  return {
    // `TelegramClient.session` is typed as the abstract `Session` (whose
    // `save()` returns void); every client we build carries a StringSession,
    // whose `save()` returns the serializable blob. Narrow to it.
    session: { save: () => (client.session as StringSession).save() },
    sendCode: (creds, phone) => client.sendCode(creds, phone),
    signIn: async (params): Promise<TgUserLike> => {
      const res = await withTimeout(
        client.invoke(
          new Api.auth.SignIn({
            phoneNumber: params.phoneNumber,
            phoneCodeHash: params.phoneCodeHash,
            phoneCode: params.phoneCode,
          }),
        ),
        MTPROTO_REQUEST_TIMEOUT_MS,
        "auth.signIn",
      );
      const user = (res as { user?: unknown }).user;
      return user as TgUserLike;
    },
    signInWithPassword: async (password): Promise<TgUserLike> => {
      const user = await client.signInWithPassword(
        { apiId: client.apiId, apiHash: client.apiHash },
        {
          password: () => Promise.resolve(password),
          onError: (e: Error) => {
            throw e;
          },
        },
      );
      return user;
    },
    logOut: async (): Promise<void> => {
      await withTimeout(
        client.invoke(new Api.auth.LogOut()),
        MTPROTO_REQUEST_TIMEOUT_MS,
        "auth.logOut",
      );
    },
  };
}

/** Production factory: builds + connects a real gramjs client. */
export const defaultAuthClientFactory: AuthClientFactory = {
  async connectFresh(apiId, apiHash) {
    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
      ...CLIENT_OPTIONS,
    });
    await client.connect();
    return wrapAuthClient(client);
  },
  async connectWithSession(apiId, apiHash, session) {
    const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
      ...CLIENT_OPTIONS,
    });
    await client.connect();
    return wrapAuthClient(client);
  },
};

// ── live client (fetch / execute / listen) ─────────────────────────────────

/** A connected gramjs client + a peer cache for resolving chat ids. */
export class TgClient implements TgOps {
  private readonly peerCache = new Map<number, EntityLike>();

  constructor(readonly client: TelegramClient) {}

  /** Connect from the injected credentials. The session must already be
   * authorized (a gramjs StringSession minted by `magnis.auth.*`). */
  static async connect(creds: TgCreds): Promise<TgClient> {
    const client = new TelegramClient(
      new StringSession(creds.session),
      creds.api_id,
      creds.api_hash,
      { ...CLIENT_OPTIONS },
    );
    try {
      await client.connect();
    } catch (e) {
      throw new Error(`failed to connect to Telegram: ${String(e)}`, { cause: e });
    }
    return new TgClient(client);
  }

  cachePeer(chatId: number, entity: EntityLike): void {
    this.peerCache.set(chatId, entity);
  }

  async resolvePeer(chatId: number): Promise<unknown> {
    const cached = this.peerCache.get(chatId);
    if (cached !== undefined) return cached;
    const dialogs = await withTimeout(
      this.client.getDialogs({}),
      MTPROTO_REQUEST_TIMEOUT_MS,
      "getDialogs(resolvePeer)",
    );
    for (const dialog of dialogs) {
      const entity = dialog.entity as EntityLike | undefined;
      if (entity === undefined) continue;
      const id = toNum(entity.id);
      this.peerCache.set(id, entity);
      if (id === chatId) return entity;
    }
    throw new Error(`chat ${String(chatId)} not found in any dialog`);
  }

  async listDialogs(): Promise<CatchupDialog[]> {
    const out: CatchupDialog[] = [];
    const dialogs = await withTimeout(
      this.client.getDialogs({}),
      MTPROTO_REQUEST_TIMEOUT_MS,
      "getDialogs(listDialogs)",
    );
    for (const dialog of dialogs) {
      const entity = dialog.entity as EntityLike | undefined;
      if (entity === undefined) continue;
      this.peerCache.set(toNum(entity.id), entity);
      out.push({
        entity,
        raw: dialog.dialog,
        pinned: dialog.pinned,
        peer: entity,
      });
    }
    return out;
  }

  async getMessages(
    peer: unknown,
    params: { limit?: number; offsetId?: number; ids?: number[] },
  ): Promise<MessageLike[]> {
    const msgs = await withTimeout(
      this.client.getMessages(peer as never, params),
      MTPROTO_REQUEST_TIMEOUT_MS,
      "getMessages",
    );
    return msgs as unknown as MessageLike[];
  }

  async sendMessage(
    peer: unknown,
    params: { message: string; replyTo?: number },
  ): Promise<{ id: number }> {
    const msg = await withTimeout(
      this.client.sendMessage(peer as never, params),
      MTPROTO_REQUEST_TIMEOUT_MS,
      "sendMessage",
    );
    return { id: msg.id };
  }

  async downloadMedia(message: MessageLike, dest: string): Promise<number> {
    // NOT wrapped in withTimeout: a media download legitimately streams many MB
    // over multiple chunks and can far exceed a single-RPC deadline; a fixed
    // MTPROTO_REQUEST_TIMEOUT_MS would kill valid large files. gramjs internally
    // bounds each file chunk by the client `timeout` + `requestRetries` set in
    // CLIENT_OPTIONS, and downloads are host-scheduled discrete ops (a stall
    // fails that one file, not the sync). See the report's caveat.
    await mkdir(dirname(dest), { recursive: true });
    const out = await this.client.downloadMedia(message as never, { outputFile: dest });
    if (out === undefined) {
      throw new Error(`download_file: no downloadable media in message ${String(message.id)}`);
    }
    return (await stat(dest)).size;
  }

  /** Stream live updates as `(payload, remote_id)` pairs via `onMessage`. v1
   * handles NEW + EDITED messages (both → the same message payload + `tg:msg:`
   * remote_id); other update kinds are dropped. */
  addLiveHandler(handler: (message: MessageLike) => void | Promise<void>): void {
    const cb = (event: { message?: unknown }): void => {
      const msg = event.message as MessageLike | undefined;
      if (msg !== undefined) void handler(msg);
    };
    this.client.addEventHandler(cb, new NewMessage({}));
    this.client.addEventHandler(cb, new EditedMessage({}));
  }
}

// ── live dialog pager ──────────────────────────────────────────────────────

/** Stable key for a TL Peer, used to join dialogs to their entity. */
function peerKey(peer: unknown): string | undefined {
  const p = peer as {
    className?: string;
    userId?: unknown;
    chatId?: unknown;
    channelId?: unknown;
  } | null;
  switch (p?.className) {
    case "PeerUser":
      return `user:${String(toNum(p.userId))}`;
    case "PeerChat":
      return `chat:${String(toNum(p.chatId))}`;
    case "PeerChannel":
      return `channel:${String(toNum(p.channelId))}`;
    default:
      return undefined;
  }
}

/** Key an entity the same way, so `peerKey(dialog.peer)` finds it. */
function entityKey(entity: EntityLike): string {
  switch (entity.className) {
    case "User":
      return `user:${String(toNum(entity.id))}`;
    case "Chat":
    case "ChatForbidden":
      return `chat:${String(toNum(entity.id))}`;
    default:
      return `channel:${String(toNum(entity.id))}`;
  }
}

/** Rebuild the `InputPeer` for the next GetDialogs from the persisted offset.
 * Twin of the Rust `OffsetPeer::to_input_peer` (which reconstructs a PackedChat):
 * "user"→InputPeerUser, "channel"→InputPeerChannel (Broadcast), _→InputPeerChat. */
function toInputPeer(peer: DialogOffset["offset_peer"]): Api.TypeInputPeer {
  const hash = bigInt(peer.access_hash ?? 0);
  switch (peer.ty) {
    case "user":
      return new Api.InputPeerUser({ userId: bigInt(peer.id), accessHash: hash });
    case "channel":
      return new Api.InputPeerChannel({ channelId: bigInt(peer.id), accessHash: hash });
    default:
      return new Api.InputPeerChat({ chatId: bigInt(peer.id) });
  }
}

/** Live `DialogPager` over a connected gramjs client. Resumes
 * `messages.getDialogs` from the persisted offset. */
export class LiveDialogPager implements DialogPager {
  constructor(
    private readonly tg: TgClient,
    private readonly accountId: string,
  ) {}

  async dialogPage(offset: DialogOffset | null, limit: number): Promise<DialogPage> {
    // Pinned dialogs are returned at the head of the FIRST page only;
    // excludePinned after page 1 prevents Telegram re-returning them on every
    // page (dup chats / count).
    const request = new Api.messages.GetDialogs({
      excludePinned: offset !== null,
      folderId: undefined,
      offsetDate: offset?.offset_date ?? 0,
      offsetId: offset?.offset_id ?? 0,
      offsetPeer: offset === null ? new Api.InputPeerEmpty() : toInputPeer(offset.offset_peer),
      limit,
      hash: bigInt(0),
    });

    const res = await withTimeout(
      this.tg.client.invoke(request),
      MTPROTO_REQUEST_TIMEOUT_MS,
      "messages.getDialogs",
    );

    // `total`: only the Slice variant carries an authoritative server-side count
    // (messages.dialogsSlice.count); the complete (non-slice) Dialogs variant has
    // no count, so the full set IS its own total.
    let rawDialogs: RawDialogLike[];
    let rawMessages: { id?: number; date?: number }[];
    let users: EntityLike[];
    let chats: EntityLike[];
    let isSlice: boolean;
    let sliceCount: number;

    if (res instanceof Api.messages.DialogsSlice) {
      rawDialogs = res.dialogs;
      rawMessages = res.messages;
      users = res.users;
      chats = res.chats;
      isSlice = true;
      sliceCount = res.count;
    } else if (res instanceof Api.messages.Dialogs) {
      rawDialogs = res.dialogs;
      rawMessages = res.messages;
      users = res.users;
      chats = res.chats;
      isSlice = false;
      sliceCount = res.dialogs.length;
    } else {
      throw new Error("GetDialogs returned NotModified (hash=0 must not)");
    }

    const chatMap = new Map<string, EntityLike>();
    for (const e of [...users, ...chats]) chatMap.set(entityKey(e), e);

    // (message id → date) for advancing the offset the way Telegram expects.
    const msgDate = new Map<number, number>();
    for (const m of rawMessages) {
      if (typeof m.id === "number" && typeof m.date === "number") msgDate.set(m.id, m.date);
    }

    const dialogs: PagedDialog[] = [];
    for (const raw of rawDialogs) {
      const key = peerKey(raw.peer);
      const entity = key === undefined ? undefined : chatMap.get(key);
      if (entity === undefined) continue;
      const chatId = toNum(entity.id);
      this.tg.cachePeer(chatId, entity);

      const meta = buildDialogMeta(raw, raw.pinned === true, 0);
      const tgChat = chatToIntermediate(entity, meta);

      // Hydrate the chat's newest messages — GetDialogs carries only each
      // dialog's single top message, not the snapshot depth. A single chat's
      // getHistory failure (e.g. server RPC_CALL_FAIL / 500) must NOT abort the
      // whole bootstrap: fetch into a settled result, then let
      // resolveHydratedMessages skip transient failures (chat still discovered)
      // and propagate only fatal (auth / flood-wait) ones.
      let fetched: { ok: true; messages: ReturnType<typeof messageToIntermediate>[] } | { ok: false; error: unknown };
      try {
        const msgs = await this.tg.getMessages(entity, {
          limit: BOOTSTRAP_MESSAGES_PER_CHAT,
        });
        fetched = {
          ok: true,
          messages: msgs.map((m) => messageToIntermediate(m, this.accountId, chatId)),
        };
      } catch (error) {
        fetched = { ok: false, error };
      }
      const messages = resolveHydratedMessages(chatId, fetched);
      dialogs.push({ chat: tgChat, messages });
    }

    // Exhausted when Telegram returned the complete (non-slice) set or a short
    // final page; otherwise advance the offset triple from the last dialogs.
    let nextOffset: DialogOffset | null = null;
    if (isSlice && rawDialogs.length >= limit) {
      let offsetDate = 0;
      let offsetId = 0;
      for (let i = rawDialogs.length - 1; i >= 0; i -= 1) {
        const d = rawDialogs[i];
        if (d.className === "DialogFolder") continue;
        const top = d.topMessage;
        const date = top === undefined ? undefined : msgDate.get(top);
        if (date !== undefined && top !== undefined) {
          offsetDate = date;
          offsetId = top;
          break;
        }
      }
      const last = rawDialogs[rawDialogs.length - 1];
      const lastKey = peerKey(last.peer);
      const lastEntity = lastKey === undefined ? undefined : chatMap.get(lastKey);
      if (lastEntity !== undefined) {
        nextOffset = {
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_peer: offsetPeerFromEntity(lastEntity),
        };
      }
    }

    return { dialogs, next_offset: nextOffset, total: sliceCount };
  }
}

// ── session pool ───────────────────────────────────────────────────────────

/** One TgClient (= one gramjs client = one MTProto socket) per account_id,
 * shared across all tool calls and subscriptions for that account_id. Lazy:
 * first access for a new account_id triggers connect; subsequent calls return
 * the same client.
 *
 * Sessions are NEVER idle-evicted (eviction conflicts with active
 * subscriptions). Only an explicit evict or a connector restart closes them.
 *
 * Concurrency: a single async mutex guards the map, so concurrent first-access
 * for DIFFERENT accounts serializes on the ~1s handshake. Acceptable at our
 * scale (10s of accounts per process). */
export class SessionPool {
  private readonly sessions = new Map<string, TgClient>();
  /** Promise chain acting as an async mutex over `sessions`. */
  private lock: Promise<unknown> = Promise.resolve();

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    // Keep the chain alive regardless of this call's outcome.
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Get the live TgClient for `account_id`. Returns the EXISTING client even if
   * `creds` differ from what created it — re-auth flows go through
   * evict → listen_stop → listen_start instead of silently re-keying. */
  getOrCreate(accountId: string, creds: TgCreds): Promise<TgClient> {
    return this.withLock(async () => {
      const existing = this.sessions.get(accountId);
      if (existing !== undefined) return existing;
      let client: TgClient;
      try {
        client = await TgClient.connect(creds);
      } catch (e) {
        throw new Error(`connect telegram session '${accountId}': ${String(e)}`, { cause: e });
      }
      this.sessions.set(accountId, client);
      return client;
    });
  }

  evict(accountId: string): Promise<boolean> {
    return this.withLock(() => Promise.resolve(this.sessions.delete(accountId)));
  }

  size(): number {
    return this.sessions.size;
  }
}

/** Module-level shared pool — one per connector process (lifecycle = process
 * lifetime), so fetch / execute / listen share ONE socket per account. */
let globalPool: SessionPool | null = null;

export function pool(): SessionPool {
  globalPool ??= new SessionPool();
  return globalPool;
}
