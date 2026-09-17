// Command handlers — TS twin of plugins/sources/telegram/src/commands.rs.
//
// Drives a connected client to produce the SAME canonical envelopes fixture mode
// does (via the `envelope.ts` builders fed the `messageToIntermediate` /
// `chatToIntermediate` conversions). All I/O goes through the `TgOps` /
// `DialogPager` seams so the bootstrap/catch-up/execute logic is unit-tested
// with in-memory fakes — no network.

import type {
  DialogOffset,
  DialogPager,
  EntityLike,
  MessageLike,
  MessagePage,
  RawDialogLike,
} from "../../client";
import {
  buildDialogMeta,
  SOURCE_PAGE_HISTORY_LIMIT,
  SOURCE_PAGE_BUDGET_MS,
  remainingPageBudget,
  chatToIntermediate,
  messageToIntermediate,
  sendWithFloodRetry,
  withTimeout,
} from "../../client";
import { chatEnvelope, messageEnvelope, toRfc3339Utc, type TgChat } from "./envelope";

/** Page sizes, mirroring the Rust bootstrap/catch-up constants. One bootstrap
 * batch enumerates up to BOOTSTRAP_BATCH_DIALOGS dialogs, then checkpoints the
 * offset and yields hasMore=true so the host can resume. */
export const BOOTSTRAP_BATCH_DIALOGS = 50;
export const CATCHUP_MESSAGES_PER_CHAT = 20;

/** One dialog as the catch-up walk sees it. `peer` is an opaque handle the ops
 * impl hands back to `getMessages` (a gramjs entity / InputPeer). */
export interface CatchupDialog {
  entity: EntityLike;
  raw: RawDialogLike;
  pinned: boolean;
  peer: unknown;
}

/** The client operations the commands need. The live impl wraps gramjs
 * (`live.ts`); tests inject a fake. */
export interface TgOps {
  /** Walk ALL dialogs from the top (catch-up). */
  listDialogs(): Promise<CatchupDialog[]>;
  /** Resolve a chat id to an opaque peer handle. */
  resolvePeer(chatId: number, signal?: AbortSignal): Promise<unknown>;
  getMessages(
    peer: unknown,
    params: { limit?: number; offsetId?: number; ids?: number[] },
    timeoutMs?: number,
  ): Promise<MessagePage>;
  sendMessage(
    peer: unknown,
    params: { message: string; replyTo?: number },
  ): Promise<{ id: number }>;
  /** Download the message's media to `dest`; returns the bytes written. Throws
   * when the message carries no downloadable media. */
  downloadMedia(message: MessageLike, dest: string): Promise<number>;
}

/** Cursor shape helpers — the cursor is arbitrary host-round-tripped JSON. */
function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Live `magnis.sync.fetch`. `direction = "backward"` (default) → Bootstrap
 * (present-to-past dialog walk); `"forward"` → CatchUp (messages newer than the
 * per-chat cursor). */
export async function fetch(
  ops: TgOps,
  pager: DialogPager,
  accountId: string,
  direction: string,
  cursor: unknown,
): Promise<Record<string, unknown>> {
  return direction === "forward"
    ? await runCatchup(ops, accountId, cursor, pager)
    : await runBootstrap(cursor, pager);
}

/** Pure offset-resumed bootstrap loop. Reads the dialog-offset + the per-chat
 * `last_msg_id` watermark from `cursor`, fetches ONE page from `pager`, emits
 * chat+message envelopes, assigns pinned ordering, and persists the advanced
 * offset. `hasMore` is true iff the dialog walk has more pages — the host loops
 * until false, then transitions Bootstrap → CatchUp.
 *
 * This is the O(N) design: it never re-creates the dialog walk from the top
 * (which re-fetched 50·(K-1) dialogs on batch K and flood-waited Telegram). */
export async function runBootstrap(
  cursor: unknown,
  pager: DialogPager,
): Promise<Record<string, unknown>> {
  const c = asObject(cursor);

  // Per-chat watermark carried forward (consumed by CatchUp). An OLD cursor has
  // `chats` but no `dialog_offset`; we then resume from the top — the already
  // recorded chats are re-emitted (idempotent in the graph), never lost.
  const cursorChats: Record<string, unknown> = { ...(asObject(c?.chats) ?? {}) };
  let pinnedOrder =
    typeof c?.pinned_count === "number" && c.pinned_count >= 0 ? c.pinned_count : 0;
  const rawOffset = c?.dialog_offset;
  const startOffset: DialogOffset | null =
    rawOffset !== null && rawOffset !== undefined && typeof rawOffset === "object"
      ? (rawOffset as DialogOffset)
      : null;

  const page = await pager.dialogPage(startOffset, BOOTSTRAP_BATCH_DIALOGS);

  const envelopes: Record<string, unknown>[] = [];
  for (const paged of page.dialogs) {
    // The LOOP owns pinned ordering so it stays monotonic across batch
    // boundaries (the pager leaves `pin_order` as a 0 placeholder).
    if (paged.chat.is_pinned) {
      paged.chat.pin_order = pinnedOrder;
      pinnedOrder += 1;
    } else {
      paged.chat.pin_order = 0;
    }
    // Emission order: the chat envelope FIRST, then its messages.
    envelopes.push(chatEnvelope(paged.chat));

    let highest = 0;
    for (const m of paged.messages) {
      highest = Math.max(highest, m.message_id);
      envelopes.push(messageEnvelope(m, "snapshot"));
    }
    // Record EVERY enumerated chat (incl. 0-message → last_msg_id 0) so CatchUp
    // later fills it; with offset paging it is enumerated exactly once. The
    // exact count Telegram reported rides next to the watermark: the host sums
    // these into the number of messages the account has to download.
    cursorChats[String(paged.chat.chat_id)] = paged.chat.message_count === undefined
      ? { last_msg_id: highest }
      : { last_msg_id: highest, message_count: paged.chat.message_count };
  }

  const hasMore = page.next_offset !== null;
  // Progress: `total` is the server-side dialog count (passthrough); `discovered`
  // is the CUMULATIVE count of enumerated dialogs = size of the cursor `chats`
  // map AFTER this batch's inserts.
  const discovered = Object.keys(cursorChats).length;
  const nextCursor =
    Object.keys(cursorChats).length === 0 && page.next_offset === null
      ? null
      : {
          date: toRfc3339Utc(new Date()),
          chats: cursorChats,
          pinned_count: pinnedOrder,
          dialog_offset: page.next_offset,
        };

  return {
    envelopes,
    nextCursor,
    hasMore,
    total: page.total,
    discovered,
  };
}

interface CatchupProgress {
  readonly lastMessageId: number;
  readonly targetLastMessageId: number | undefined;
  readonly beforeMessageId: number | undefined;
  /** The exact count Telegram last stated for the chat, carried through
   * every forward walk; absent when no read ever stated one. */
  readonly messageCount: number | undefined;
}

function catchupProgress(value: unknown): CatchupProgress {
  const entry = asObject(value);
  const lastMessageId =
    typeof entry?.last_msg_id === "number" && entry.last_msg_id >= 0
      ? entry.last_msg_id
      : 0;
  const targetLastMessageId =
    typeof entry?.target_last_msg_id === "number" && entry.target_last_msg_id > 0
      ? entry.target_last_msg_id
      : undefined;
  const beforeMessageId =
    typeof entry?.before_message_id === "number" && entry.before_message_id > 0
      ? entry.before_message_id
      : undefined;
  const messageCount =
    typeof entry?.message_count === "number" && Number.isSafeInteger(entry.message_count) && entry.message_count >= 0
      ? entry.message_count
      : undefined;

  if ((targetLastMessageId === undefined) !== (beforeMessageId === undefined)) {
    throw new Error("telegram CatchUp cursor has incomplete per-chat progress");
  }
  if (targetLastMessageId !== undefined && targetLastMessageId <= lastMessageId) {
    throw new Error("telegram CatchUp cursor target does not advance its committed watermark");
  }
  if (
    targetLastMessageId !== undefined &&
    beforeMessageId !== undefined &&
    (beforeMessageId <= lastMessageId || beforeMessageId > targetLastMessageId + 1)
  ) {
    throw new Error("telegram CatchUp cursor continuation is outside its committed gap");
  }
  return { lastMessageId, targetLastMessageId, beforeMessageId, messageCount };
}

function hasPendingCatchup(value: unknown): boolean {
  const progress = catchupProgress(value);
  return progress.targetLastMessageId !== undefined;
}

interface CatchupPage {
  pending: { chat: TgChat; peer: unknown }[];
  next_offset: DialogOffset | null;
  pinned_count: number;
}

/** CatchUp: walk dialogs from the top and emit only messages newer than each
 * chat's committed watermark. A gap larger than one provider page remains an
 * opaque per-chat continuation: `last_msg_id` stays committed while
 * `target_last_msg_id` fences the newest edge and `before_message_id` walks
 * toward the old watermark. Result carries NO `total` / `discovered`
 * (bootstrap-only progress counters).
 *
 * @tested-by: tst_cat_tg_gap_001
 * @invariant: a chat promotes its forward watermark only after CatchUp crosses
 * the old watermark or proves that no older provider page exists. */
export async function runCatchup(
  ops: TgOps,
  accountId: string,
  cursor: unknown,
  pager?: DialogPager,
): Promise<Record<string, unknown>> {
  const deadline = performance.now() + SOURCE_PAGE_BUDGET_MS;
  const c = asObject(cursor);
  const inChats = asObject(c?.chats) ?? {};

  const envelopes: Record<string, unknown>[] = [];
  // Preserve checkpoints for dialogs that are temporarily absent from the
  // provider walk. Dropping one would turn a later reappearance into a fresh
  // account and replay its entire history.
  const newCursorChats: Record<string, unknown> = { ...inChats };
  let page = asObject(c?.catchup_page) as unknown as CatchupPage | undefined;
  if (page !== undefined && (!Array.isArray(page.pending) ||
    page.pending.some((item) => item.peer === undefined))) {
    throw new Error("Telegram CatchUp continuation requires pending chats and peers");
  }
  if (page === undefined || page.pending.length === 0) {
    let pinnedOrder = page?.pinned_count ?? 0;
    if (pager !== undefined) {
      const discovered = await pager.dialogPage(page?.next_offset ?? null, BOOTSTRAP_BATCH_DIALOGS,
        { hydrate: false, timeoutMs: remainingPageBudget(deadline) });
      page = { pending: discovered.dialogs.map((dialog) => {
        if (dialog.peer === undefined) throw new Error("Telegram CatchUp discovery requires a peer");
        const chat = { ...dialog.chat, pin_order: dialog.chat.is_pinned ? pinnedOrder++ : 0 };
        return { chat, peer: dialog.peer };
      }), next_offset: discovered.next_offset, pinned_count: pinnedOrder };
    } else {
      // Existing injectable ops seam; production always uses the bounded pager.
      const dialogs = await ops.listDialogs();
      page = { pending: dialogs.map((dialog) => ({ peer: dialog.peer,
        chat: chatToIntermediate(dialog.entity,
          buildDialogMeta(dialog.raw, dialog.pinned, dialog.pinned ? pinnedOrder++ : 0)),
      })), next_offset: null, pinned_count: pinnedOrder };
    }
  }

  let processed = 0;
  let reads = 0;
  const deferred: CatchupPage["pending"] = [];
  // @tested-by: tst_src_tgfast_003 — TGFAST_002 yields before a sixth history read
  // and round-robins unfinished gaps without promoting their committed edge.
  for (const dialog of page.pending) {
    if (reads >= SOURCE_PAGE_HISTORY_LIMIT || (processed > 0 && performance.now() >= deadline)) break;
    processed += 1;
    const chatId = dialog.chat.chat_id;
    const chatKey = String(chatId);
    const saved = catchupProgress(inChats[chatKey]);
    // The chat envelope carries the count its entry holds, so a re-asserted
    // chat never reaches the module without it; a history answer read below
    // restates it with the count of that answer.
    if (saved.messageCount !== undefined) dialog.chat.message_count = saved.messageCount;
    const chatEnvelopeIndex = envelopes.length;
    envelopes.push(chatEnvelope(dialog.chat));

    const committed = saved.lastMessageId;
    // The count rides on every entry this walk writes: kept from the entry,
    // replaced by the count Telegram states in a page this walk reads.
    let messageCount = saved.messageCount;
    const counted = (entry: Record<string, unknown>): Record<string, unknown> =>
      messageCount === undefined ? entry : { ...entry, message_count: messageCount };
    if (saved.targetLastMessageId === undefined && dialog.chat.top_message <= committed) {
      // Nothing new in this chat — carry the watermark, skip the history call.
      if (committed > 0) newCursorChats[chatKey] = counted({ last_msg_id: committed });
      continue;
    }

    const target = saved.targetLastMessageId ?? dialog.chat.top_message;
    if (target <= committed) {
      if (committed > 0) newCursorChats[chatKey] = counted({ last_msg_id: committed });
      continue;
    }
    const before = saved.beforeMessageId ?? target + 1;
    reads += 1;
    const messages = await ops.getMessages(dialog.peer, {
      limit: CATCHUP_MESSAGES_PER_CHAT,
      offsetId: before,
    }, remainingPageBudget(deadline));
    if (messages.total !== undefined) {
      messageCount = messages.total;
      // @tested-by: tst_src_tgfast_003 — the module's count moved with live
      // deliveries since the entry was written; the answer, not the entry,
      // is the count this chat reaches the module with.
      dialog.chat.message_count = messages.total;
      envelopes[chatEnvelopeIndex] = chatEnvelope(dialog.chat);
    }
    let oldest: number | undefined;
    let reachedCommitted = false;
    for (const msg of messages) {
      const msgId = msg.id;
      if (msgId >= before || msgId > target) {
        throw new Error("telegram CatchUp page escaped its requested target window");
      }
      oldest = oldest === undefined ? msgId : Math.min(oldest, msgId);
      // getMessages is newest-first: the first message at/below the committed
      // watermark proves this gap is closed. The old item is not re-emitted.
      if (msgId <= committed) {
        reachedCommitted = true;
        break;
      }
      envelopes.push(
        messageEnvelope(messageToIntermediate(msg, accountId, chatId), "snapshot"),
      );
    }

    if (reachedCommitted || messages.length === 0) {
      newCursorChats[chatKey] = counted({ last_msg_id: target });
      continue;
    }
    if (oldest === undefined || oldest >= before) {
      throw new Error("telegram CatchUp page did not advance its per-chat continuation");
    }
    newCursorChats[chatKey] = counted({
      last_msg_id: committed,
      target_last_msg_id: target,
      before_message_id: oldest,
    });
    deferred.push(dialog);
  }

  const pending = [...page.pending.slice(processed), ...deferred];
  // @tested-by: tst_cat_tg_gap_003 — terminal discovery cannot hide a missing gap.
  if (page.next_offset === null) {
    const listedChatKeys = new Set(pending.map((dialog) => String(dialog.chat.chat_id)));
    for (const [chatKey, progress] of Object.entries(newCursorChats)) {
      if (hasPendingCatchup(progress) && !listedChatKeys.has(chatKey)) {
        throw new Error(`telegram CatchUp pending chat '${chatKey}' is absent from the dialog snapshot`);
      }
    }
  }
  const hasMore = pending.length > 0 || page.next_offset !== null;
  const nextCursor =
    Object.keys(newCursorChats).length === 0 && !hasMore
      ? null
      : { date: toRfc3339Utc(new Date()), chats: newCursorChats,
          ...(hasMore ? { catchup_page: { ...page, pending } } : {}),
        };

  return { envelopes, nextCursor, hasMore };
}

/** Extract an integer argument tolerant of how the host's V8 `source_command`
 * boundary encodes it. Telegram chat_ids exceed i32 and JS numbers are f64, so
 * the value can arrive as a JSON i64, an f64, or a numeric string — accepting
 * only a plain integer surfaced as the bogus "missing chat_id" error on
 * backfill/send for real (large-id) chats. */
export function argI64(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : undefined;
  if (typeof v === "string") {
    const s = v.trim();
    // Rust parses `str::parse::<i64>()` — integers only, no floats/garbage.
    if (!/^-?\d+$/.test(s)) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Whether backfill should fetch another page after one that returned
 * `returned` messages.
 *
 * Telegram's getHistory returns SHORT pages (fewer than the requested limit)
 * even when older history still remains — auto-deleted messages, service
 * messages, and server-side chunking all shrink a page below the limit. So
 * "fewer than limit" is NOT a reliable end-of-history signal: a page that
 * returned ANY messages may have more behind it, and only an EMPTY page reliably
 * means the history is exhausted. */
export function backfillHasMore(returned: number): boolean {
  return returned > 0;
}

/** Live `magnis.execute`. Ports the send_message / reply / backfill_chat /
 * download_file actions. Auth actions are not part of this contract. */
export async function execute(
  ops: TgOps,
  accountId: string,
  args: Record<string, unknown>,
  deps: ExecuteDeps,
): Promise<Record<string, unknown>> {
  const action = typeof args.action === "string" ? args.action : "send_message";
  switch (action) {
    case "send_message":
    case "reply": {
      const chatId = argI64(args, "chat_id");
      if (chatId === undefined) throw new Error("missing chat_id");
      const text = args.text;
      if (typeof text !== "string") throw new Error("missing text");
      const replyTo = argI64(args, "reply_to_message_id");
      return await sendMessage(ops, chatId, text, replyTo, deps);
    }
    case "backfill_chat": {
      const chatId = argI64(args, "chat_id");
      if (chatId === undefined) throw new Error("missing chat_id");
      const beforeMessageId = argI64(args, "before_message_id") ?? 0;
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : 50;
      return await backfillChat(ops, accountId, chatId, beforeMessageId, limit);
    }
    case "download_file": {
      const sourceRef = asObject(args.source_ref);
      if (sourceRef === undefined) throw new Error("download_file: missing source_ref");
      const dest = args.dest;
      if (typeof dest !== "string") throw new Error("missing dest");
      const chatId = argI64(sourceRef, "chat_id");
      if (chatId === undefined) throw new Error("missing chat_id");
      const messageId = argI64(sourceRef, "message_id");
      if (messageId === undefined) throw new Error("missing message_id");

      // local_path must be RELATIVE to the host's files dir — the host serves it
      // via files_dir.join(local_path). The source stamped that as dest_subpath;
      // fall back to the raw dest only if it is absent.
      const destSubpath = sourceRef.dest_subpath;
      const localPath = typeof destSubpath === "string" ? destSubpath : dest;

      const peer = await ops.resolvePeer(chatId);
      const messages = await ops.getMessages(peer, { ids: [messageId] });
      const message = messages[0];
      if (message === undefined) {
        throw new Error(
          `download_file: message ${String(messageId)} not found in chat ${String(chatId)}`,
        );
      }
      const sizeBytes = await ops.downloadMedia(message, dest);
      return { size_bytes: sizeBytes, local_path: localPath };
    }
    default:
      throw new Error(`unsupported telegram execute action '${action}'`);
  }
}

/** Injectable side-effects for `execute` (the flood-retry sleeper). */
export interface ExecuteDeps {
  sleep: (secs: number) => Promise<void>;
  /** Local presentation safeguard: exercise approvals without Telegram delivery. */
  demoDryRun?: boolean;
}

/** Real-time sleeper used in production. */
export const realSleep = (secs: number): Promise<void> =>
  new Promise((r) => setTimeout(r, secs * 1000));

async function sendMessage(
  ops: TgOps,
  chatId: number,
  text: string,
  replyTo: number | undefined,
  deps: ExecuteDeps,
): Promise<Record<string, unknown>> {
  if (deps.demoDryRun === true) {
    // YC demo safeguard: deliberately do not resolve a peer or call
    // `ops.sendMessage`. The result explicitly reports non-delivery and does
    // not carry the telegram.message schema or a synthetic message id.
    return {
      chat_id: chatId,
      text,
      delivered: false,
      demo_dry_run: true,
      suppressed_by: "MAGNIS_TELEGRAM_DEMO_DRY_RUN",
    };
  }
  const peer = await ops.resolvePeer(chatId);
  // Wrap the live send in the FLOOD_WAIT-aware retry seam: a short FloodWait is
  // absorbed via wait+retry (the message still sends); a longer one surfaces the
  // RATE_LIMITED sentinel (the connector does NOT block).
  return await sendWithFloodRetry(async () => {
    const msg = await ops.sendMessage(peer, {
      message: text,
      ...(replyTo === undefined ? {} : { replyTo }),
    });
    return {
      message_id: msg.id,
      chat_id: chatId,
      text,
      schema_id: "telegram.message",
    };
  }, deps.sleep);
}

async function backfillChat(
  ops: TgOps,
  accountId: string,
  chatId: number,
  beforeMessageId: number,
  limit: number,
): Promise<Record<string, unknown>> {
  const deadline = performance.now() + SOURCE_PAGE_BUDGET_MS;
  const controller = new AbortController();
  let peer: unknown;
  try {
    peer = await withTimeout(ops.resolvePeer(chatId, controller.signal),
      remainingPageBudget(deadline), "backfill peer discovery");
  } finally {
    controller.abort();
  }
  const messages = await ops.getMessages(peer, { offsetId: beforeMessageId, limit }, remainingPageBudget(deadline));

  const envelopes: Record<string, unknown>[] = [];
  let oldest: number | null = null;
  // Stamp the connection's account_id into every backfilled message's source_ref.
  // Previously hardcoded "" — which the host did NOT re-stamp for the external
  // connector, so backfilled media records carried account_id="" and the
  // file-download worker resolved the session for account '' and never
  // downloaded the attachment.
  for (const msg of messages) {
    oldest = oldest === null ? msg.id : Math.min(oldest, msg.id);
    envelopes.push(
      messageEnvelope(messageToIntermediate(msg, accountId, chatId), "snapshot"),
    );
  }
  // Keys are read RAW by the host's run_backfill (the Execute path is not
  // FetchResult-shaped), so they are snake_case.
  return {
    envelopes,
    has_more: backfillHasMore(envelopes.length),
    oldest_message_id: oldest,
    total: messages.total ?? null,
  };
}
