// GramJS Source glue. Integration fixtures keep these SDK/client paths real
// and replace only MTProto transport, synthetic session data and clock I/O.

import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import bigInt from "big-integer";
import { Api, TelegramClient, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { EditedMessage } from "telegram/events/EditedMessage";
import { NewMessage } from "telegram/events/NewMessage";
import type { TelegramClientParams } from "telegram/client/telegramBaseClient";
import { AccountAdmission } from "./request-admission";
import type { AdmissionClock, AdmissionEvent } from "./request-admission";
import type {
  DialogOffset,
  DialogPage,
  DialogPager,
  EntityLike,
  MessageLike,
  MessagePage,
  PendingDialog,
  PagedDialog,
  RawDialogLike,
  TgCreds,
} from "./client";
import {
  BOOTSTRAP_MESSAGES_PER_CHAT,
  SOURCE_PAGE_HISTORY_LIMIT,
  SOURCE_PAGE_BUDGET_MS,
  remainingPageBudget,
  floodWaitSecs,
  buildDialogMeta,
  chatToIntermediate,
  messageToIntermediate,
  MTPROTO_REQUEST_TIMEOUT_MS,
  MtprotoTimeoutError,
  offsetPeerFromEntity,
  resolveHydratedMessages,
  toNum,
  withTimeout,
} from "./client";
import type { CatchupDialog, TgOps } from "./surfaces/telegram/commands";
import { BOOTSTRAP_BATCH_DIALOGS } from "./surfaces/telegram/commands";

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
 * - `floodSleepThreshold`  zero: the shared account fence owns every wait,
 *                          including short waits and SDK retries. */
const CLIENT_OPTIONS = {
  ...INIT_PARAMS,
  timeout: 60,
  requestRetries: 2,
  connectionRetries: 5,
  retryDelay: 1000,
  autoReconnect: true,
  floodSleepThreshold: 0,
} as const;

type ClientTransportOptions = Pick<TelegramClientParams, "connection" | "networkSocket" | "baseLogger">;

/** @tested-by: tst_src_tgflood_002 — install admission before any SDK connect. */
export function createTelegramClient(session: StringSession, apiId: number, apiHash: string,
  admission: AccountAdmission, transport: ClientTransportOptions = {}): TelegramClient {
  const client = new TelegramClient(session, apiId, apiHash, { ...CLIENT_OPTIONS, ...transport, rpcAdmission: admission });
  if (client.rpcAdmissionRevision !== 1 || client._rpcAdmission !== admission) {
    throw new Error("Telegram SDK admission hook revision 1 is required before connecting");
  }
  return client;
}

const authAdmission = new AccountAdmission("auth-process");

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

async function connectClient(client: TelegramClient): Promise<void> {
  try { await client.connect(); }
  catch (error) {
    await client.destroy();
    throw error;
  }
}

/** Builds real clients; an auth process retains one provisional owner. */
export function createAuthClientFactory(admission: AccountAdmission, transport: ClientTransportOptions = {}): AuthClientFactory {
  return {
  async connectFresh(apiId, apiHash): Promise<AuthClientLike> {
    const client = createTelegramClient(new StringSession(""), apiId, apiHash, admission, transport);
    await connectClient(client);
    return wrapAuthClient(client);
  },
  async connectWithSession(apiId, apiHash, session): Promise<AuthClientLike> {
    const client = createTelegramClient(new StringSession(session), apiId, apiHash, admission, transport);
    await connectClient(client);
    return wrapAuthClient(client);
  },
  };
}

export const defaultAuthClientFactory: AuthClientFactory = createAuthClientFactory(authAdmission);

// ── live client (fetch / execute / listen) ─────────────────────────────────

/** A connected gramjs client + a peer cache for resolving chat ids. */
export class TgClient implements TgOps {
  private readonly peerCache = new Map<number, EntityLike>();
  private discoveryOffset: DialogOffset | null = null;
  private discoveryFinished = false;
  private discoveryPage: Promise<void> | undefined;

  constructor(readonly client: TelegramClient) {}

  /** Connect from the injected credentials. The session must already be
   * authorized (a gramjs StringSession minted by `magnis.auth.*`). */
  static async connect(creds: TgCreds, admission: AccountAdmission, transport: ClientTransportOptions = {}): Promise<TgClient> {
    const client = createTelegramClient(new StringSession(creds.session), creds.api_id, creds.api_hash, admission, transport);
    try {
      await connectClient(client);
    } catch (e) {
      if (floodWaitSecs(e) !== undefined) throw e;
      throw new Error(`failed to connect to Telegram: ${String(e)}`, { cause: e });
    }
    return new TgClient(client);
  }

  cachePeer(chatId: number, entity: EntityLike): void {
    this.peerCache.set(chatId, entity);
  }

  /** One advancing page belongs to the client, not to an individual waiter. */
  private advanceDiscovery(): Promise<void> {
    this.discoveryPage ??= LiveDialogPager.discoverPage(this, this.discoveryOffset, BOOTSTRAP_BATCH_DIALOGS)
      .then((page): void => {
        this.discoveryOffset = page.next_offset;
        this.discoveryFinished = page.next_offset === null;
      }).finally((): void => { this.discoveryPage = undefined; });
    return this.discoveryPage;
  }

  // @tested-by: tst_src_tgflood_003
  async resolvePeer(chatId: number, signal?: AbortSignal): Promise<unknown> {
    for (;;) {
      signal?.throwIfAborted();
      const cached = this.peerCache.get(chatId);
      if (cached !== undefined) return cached;
      if (this.discoveryFinished) throw new Error(`chat ${String(chatId)} not found in any dialog`);
      const page = this.advanceDiscovery();
      if (!signal) { await page; continue; }
      await new Promise<void>((resolve, reject) => {
        const aborted = (): void => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error("Peer discovery cancelled", { cause: reason }));
        };
        signal.addEventListener("abort", aborted, { once: true });
        void page.then(() => { signal.removeEventListener("abort", aborted); resolve(); },
          (error: unknown) => {
            signal.removeEventListener("abort", aborted);
            reject(error instanceof Error ? error : new Error("Peer discovery failed", { cause: error }));
          });
      });
    }
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
    timeoutMs = MTPROTO_REQUEST_TIMEOUT_MS,
  ): Promise<MessagePage> {
    if (timeoutMs <= 0) throw new MtprotoTimeoutError("getMessages", timeoutMs);
    const read = async (): Promise<MessagePage> => {
      const input = peer !== null && typeof peer === "object" && "ty" in peer
        ? toInputPeer(peer as DialogOffset["offset_peer"]) : await this.client.getInputEntity(peer as never);
      if (params.ids !== undefined) return await this.client.getMessages(input, params) as unknown as MessagePage;
      // @tested-by: tst_src_tgfast_004 — TGFAST_002 reads one provider page and
      // preserves count provenance; SDK iterMessages invents total=page.length.
      const result = await this.client.invoke(new Api.messages.GetHistory({ peer: input,
        offsetId: params.offsetId ?? 0, offsetDate: 0, addOffset: 0,
        limit: Math.min(params.limit ?? BOOTSTRAP_MESSAGES_PER_CHAT, 100), maxId: 0, minId: 0, hash: bigInt(0) }));
      if (result instanceof Api.messages.MessagesNotModified) throw new Error("GetHistory returned NotModified with hash=0");
      if ("count" in result && (!Number.isSafeInteger(result.count) || result.count < 0)) {
        throw new Error("GetHistory returned an invalid message count");
      }
      const entities = new Map([...result.users, ...result.chats].map((entity) => [utils.getPeerId(entity), entity]));
      const messages = result.messages as unknown as MessagePage;
      for (const message of result.messages) {
        if (message instanceof Api.Message || message instanceof Api.MessageService) {
          message._finishInit(this.client, entities, input);
        }
      }
      if ("count" in result) messages.total = result.count;
      return messages;
    };
    return await withTimeout(read(), Math.min(timeoutMs, MTPROTO_REQUEST_TIMEOUT_MS), "getMessages");
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
      if (msg !== undefined) {
        if (msg.chat) this.cachePeer(toNum(msg.chat.id), msg.chat);
        void handler(msg);
      }
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
  // @tested-by: tst_src_tgfast_002 — TGFAST_002 preserves Saved Messages in JSON.
  if (peer.ty === "user" && peer.self === true) return new Api.InputPeerSelf();
  const hash = bigInt(String(peer.access_hash ?? 0));
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

  /** Shared discovery decoder; peer lookups do not need history hydration. */
  static async discoverPage(tg: TgClient, offset: DialogOffset | null, limit: number,
    timeoutMs = MTPROTO_REQUEST_TIMEOUT_MS): Promise<{
    dialogs: CatchupDialog[];
    next_offset: DialogOffset | null;
    total: number;
  }> {
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
      tg.client.invoke(request),
      Math.min(timeoutMs, MTPROTO_REQUEST_TIMEOUT_MS),
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

    const dialogs: CatchupDialog[] = [];
    for (const raw of rawDialogs) {
      const key = peerKey(raw.peer);
      const entity = key === undefined ? undefined : chatMap.get(key);
      if (entity === undefined) continue;
      const chatId = toNum(entity.id);
      tg.cachePeer(chatId, entity);
      dialogs.push({ entity, raw, pinned: raw.pinned === true, peer: entity });
    }

    // Exhausted when Telegram returned the complete (non-slice) set or a short
    // final page; otherwise advance the offset triple from the last dialogs.
    let nextOffset: DialogOffset | null = null;
    if (isSlice && rawDialogs.length >= limit) {
      let offsetDate = 0;
      let offsetId = 0;
      for (let i = rawDialogs.length - 1; i >= 0; i -= 1) {
        const d = rawDialogs[i];
        if (d === undefined || d.className === "DialogFolder") continue;
        const top = d.topMessage;
        const date = top === undefined ? undefined : msgDate.get(top);
        if (date !== undefined && top !== undefined) {
          offsetDate = date;
          offsetId = top;
          break;
        }
      }
      const last = rawDialogs[rawDialogs.length - 1];
      if (last === undefined) throw new Error("telegram.live: empty dialog slice");
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

  async dialogPage(offset: DialogOffset | null, limit: number,
    options: { hydrate?: boolean; timeoutMs?: number } = {}): Promise<DialogPage> {
    const deadline = performance.now() + Math.min(options.timeoutMs ?? SOURCE_PAGE_BUDGET_MS, SOURCE_PAGE_BUDGET_MS);
    remainingPageBudget(deadline);
    let continuation = offset?.hydration;
    if (continuation === undefined) {
      const page = await LiveDialogPager.discoverPage(this.tg, offset, limit, remainingPageBudget(deadline));
      continuation = { next_offset: page.next_offset, total: page.total,
        pending: page.dialogs.map(({ entity, raw, pinned }): PendingDialog => ({
          chat: chatToIntermediate(entity, buildDialogMeta(raw, pinned, 0)), peer: offsetPeerFromEntity(entity),
        })) };
    }
    if (!Array.isArray(continuation.pending) || continuation.pending.some((item) => !item.peer || !item.chat)) {
      throw new Error("Telegram hydration continuation requires pending chats and peers");
    }
    if (options.hydrate === false) return {
      dialogs: continuation.pending.map((item) => ({ ...item, chat: { ...item.chat }, messages: [] })),
      next_offset: continuation.next_offset, total: continuation.total,
    };
    const dialogs: PagedDialog[] = [];
    // @tested-by: tst_src_tgfast_002 — TGFAST_002 retains unhydrated pins and peers.
    for (const item of continuation.pending) {
      if (dialogs.length >= SOURCE_PAGE_HISTORY_LIMIT || (dialogs.length > 0 && performance.now() >= deadline)) break;
      const chat = { ...item.chat };
      const chatId = chat.chat_id;
      // GetDialogs carries only the top message. An uncertain timed-out
      // snapshot cannot certify a successful page or advance its cursor.
      let fetched: { ok: true; messages: ReturnType<typeof messageToIntermediate>[] } | { ok: false; error: unknown };
      try {
        const msgs = await this.tg.getMessages(item.peer, { limit: BOOTSTRAP_MESSAGES_PER_CHAT }, remainingPageBudget(deadline));
        fetched = { ok: true, messages: msgs.map((m) => messageToIntermediate(m, this.accountId, chatId)) };
      } catch (error) {
        if (error instanceof MtprotoTimeoutError) throw error;
        fetched = { ok: false, error };
      }
      dialogs.push({ chat, messages: resolveHydratedMessages(chatId, fetched) });
    }
    const pending = continuation.pending.slice(dialogs.length);
    const firstPeer = pending[0]?.peer;
    if (pending.length > 0 && firstPeer === undefined) throw new Error("Telegram pending hydration is missing its peer");
    const next_offset: DialogOffset | null = firstPeer === undefined ? continuation.next_offset : {
      offset_date: offset?.offset_date ?? 0, offset_id: offset?.offset_id ?? 0,
      // This wrapper is never a provider offset: hydration retains the actual
      // next_offset separately, including null for a completely discovered page.
      offset_peer: offset?.offset_peer ?? firstPeer,
      hydration: { ...continuation, pending },
    };
    return { dialogs, next_offset, total: continuation.total };
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
  private readonly admissions = new Map<string, AccountAdmission>();
  constructor(private readonly options: {
    clock?: AdmissionClock;
    diagnostics?: (event: AdmissionEvent) => void;
    transport?: ClientTransportOptions;
  } = {}) {}

  /** Retained on eviction: a new client is not a new account budget. */
  admissionFor(accountId: string): AccountAdmission {
    if (accountId === "") throw new Error("Missing account admission owner");
    let admission = this.admissions.get(accountId);
    if (!admission) {
      admission = new AccountAdmission(accountId, this.options.clock, this.options.diagnostics);
      this.admissions.set(accountId, admission);
    }
    return admission;
  }
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
        client = await TgClient.connect(creds, this.admissionFor(accountId), this.options.transport);
      } catch (e) {
        if (floodWaitSecs(e) !== undefined) throw e;
        throw new Error(`connect telegram session '${accountId}': ${String(e)}`, { cause: e });
      }
      this.sessions.set(accountId, client);
      return client;
    });
  }

  evict(accountId: string): Promise<boolean> {
    return this.withLock(async () => {
      const client = this.sessions.get(accountId);
      if (!client) return false;
      await client.client.destroy();
      return this.sessions.delete(accountId);
    });
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
