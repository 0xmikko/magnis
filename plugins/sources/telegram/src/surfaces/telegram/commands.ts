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
  RawDialogLike,
} from "../../client";
import {
  messageToIntermediate,
  sendWithFloodRetry,
} from "../../client";
import { chatEnvelope, messageEnvelope, toRfc3339Utc } from "./envelope";

/** Page sizes, mirroring the Rust bootstrap/catch-up constants. One bootstrap
 * batch enumerates up to BOOTSTRAP_BATCH_DIALOGS dialogs, then checkpoints the
 * offset and yields hasMore=true so the host can resume. */
export const BOOTSTRAP_BATCH_DIALOGS = 50;
export const CATCHUP_BATCH_DIALOGS = 100;
export const CATCHUP_MESSAGES_PER_CHAT = 20;
const CATCHUP_HISTORY_REQUESTS = 5;
const CATCHUP_READ_BUDGET_MS = 20_000;

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
  /** Legacy full dialog enumeration; not used by bounded CatchUp. */
  listDialogs(): Promise<CatchupDialog[]>;
  /** Resolve a chat id to an opaque peer handle. */
  resolvePeer(chatId: number): Promise<unknown>;
  getMessages(
    peer: unknown,
    params: { limit?: number; offsetId?: number; ids?: number[] },
    timeoutMs?: number,
  ): Promise<MessageLike[]>;
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
    // later fills it; with offset paging it is enumerated exactly once.
    cursorChats[String(paged.chat.chat_id)] = { last_msg_id: highest };
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
  return { lastMessageId, targetLastMessageId, beforeMessageId };
}

function hasPendingCatchup(value: unknown): boolean {
  const progress = catchupProgress(value);
  return progress.targetLastMessageId !== undefined;
}

function catchupDialogOffset(value: unknown): DialogOffset | null {
  if (value === undefined) return null;
  const offset = asObject(value);
  const peer = asObject(offset?.offset_peer);
  if (
    typeof offset?.offset_date !== "number" || !Number.isSafeInteger(offset.offset_date) || offset.offset_date < 0 ||
    typeof offset.offset_id !== "number" || !Number.isSafeInteger(offset.offset_id) || offset.offset_id < 0 ||
    typeof peer?.id !== "number" || !Number.isSafeInteger(peer.id) || peer.id <= 0 ||
    (peer.ty !== "user" && peer.ty !== "chat" && peer.ty !== "channel") ||
    (peer.access_hash !== undefined && (typeof peer.access_hash !== "number" || !Number.isInteger(peer.access_hash)))
  ) throw new Error("telegram CatchUp cursor has invalid dialog offset");
  return {
    offset_date: offset.offset_date,
    offset_id: offset.offset_id,
    offset_peer: { ty: peer.ty, id: peer.id,
      ...(peer.access_hash !== undefined ? { access_hash: peer.access_hash } : {}) },
  };
}

/** CatchUp: resume one metadata page and emit only messages newer than each
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
  pager: DialogPager,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + CATCHUP_READ_BUDGET_MS;
  const c = asObject(cursor);
  const inChats = asObject(c?.chats) ?? {};

  const envelopes: Record<string, unknown>[] = [];
  // Preserve checkpoints for dialogs that are temporarily absent from the
  // provider walk. Dropping one would turn a later reappearance into a fresh
  // account and replay its entire history.
  const newCursorChats: Record<string, unknown> = { ...inChats };
  // Validate every saved gap before admitting any provider read.
  const pendingKeys = Object.keys(inChats).filter((key) => hasPendingCatchup(inChats[key]));
  const startOffset = catchupDialogOffset(c?.catchup_dialog_offset);
  const rawSeen = c?.catchup_seen_pending;
  if (rawSeen !== undefined && (!Array.isArray(rawSeen) || rawSeen.some((key) => typeof key !== "string"))) {
    throw new Error("telegram CatchUp cursor has invalid pending observations");
  }
  const seenPending = new Set<string>(rawSeen as string[] | undefined);
  const rawOrder = c?.catchup_pending_order;
  if (rawOrder !== undefined && (
    !Array.isArray(rawOrder) || rawOrder.some((key) => typeof key !== "string") ||
    new Set(rawOrder).size !== rawOrder.length || rawOrder.length !== pendingKeys.length ||
    pendingKeys.some((key) => !rawOrder.includes(key))
  )) throw new Error("telegram CatchUp cursor has invalid pending order");
  const pendingOrder = rawOrder === undefined ? pendingKeys : [...rawOrder as string[]];
  if (c?.catchup_draining !== undefined && typeof c.catchup_draining !== "boolean") {
    throw new Error("telegram CatchUp cursor has invalid draining flag");
  }
  const draining = c?.catchup_draining === true;
  const rawPinned = c?.catchup_pinned_count;
  if (rawPinned !== undefined && (typeof rawPinned !== "number" || !Number.isSafeInteger(rawPinned) || rawPinned < 0)) {
    throw new Error("telegram CatchUp cursor has invalid pinned count");
  }

  // @tested-by: tst_tgts_catch_008
  // @invariant: one metadata request and at most five history requests share a
  // read deadline below the host's 30s timeout. A raced timeout does not cancel
  // an already-issued MTProto request; errors abort this page without retries.
  const rawCatchupOffset = c?.catchup_offset;
  let skipRemaining = typeof rawCatchupOffset === "number" &&
      Number.isInteger(rawCatchupOffset) && rawCatchupOffset >= 0
    ? rawCatchupOffset
    : 0;
  let pinnedOrder = rawPinned ?? 0;
  const page = await pager.dialogPage(startOffset, CATCHUP_BATCH_DIALOGS, {
    hydrateMessages: false,
    timeoutMs: deadline - Date.now(),
  });
  let historyRequests = 0;
  const histories: { chatId: number; chatKey: string; peer: unknown; committed: number; target: number; before: number }[] = [];

  // Consume the ENTIRE response: Telegram may return all pins beyond `limit`.
  // Legacy catchup_offset is a processed prefix, not a Telegram offset. Walk it
  // in bounded metadata pages, carrying the remaining skip with the real offset.
  for (const dialog of page.dialogs) {
    const chat = { ...dialog.chat, pin_order: dialog.chat.is_pinned ? pinnedOrder++ : 0 };
    const chatId = chat.chat_id;
    const chatKey = String(chatId);
    const saved = catchupProgress(inChats[chatKey]);
    if (saved.targetLastMessageId !== undefined) seenPending.add(chatKey);
    if (skipRemaining > 0) {
      skipRemaining -= 1;
      continue;
    }
    envelopes.push(chatEnvelope(chat));
    const committed = saved.lastMessageId;
    if (saved.targetLastMessageId === undefined && (draining || chat.top_message <= committed)) {
      // Nothing new in this chat — carry the watermark, skip the history call.
      if (committed > 0) newCursorChats[chatKey] = { last_msg_id: committed };
      continue;
    }

    const target = saved.targetLastMessageId ?? chat.top_message;
    if (target <= committed) {
      if (committed > 0) newCursorChats[chatKey] = { last_msg_id: committed };
      continue;
    }
    const before = saved.beforeMessageId ?? target + 1;
    // Freeze even deferred targets; enumeration must never promote unread heads.
    newCursorChats[chatKey] = {
      last_msg_id: committed,
      target_last_msg_id: target,
      before_message_id: before,
    };
    seenPending.add(chatKey);
    if (!pendingOrder.includes(chatKey)) pendingOrder.push(chatKey);
    histories.push({ chatId, chatKey, peer: dialog.peer, committed, target, before });
  }

  // Durable round-robin: a long gap moves behind waiting peers after each read.
  // New targets join once; a drain sweep never follows newly moving heads.
  histories.sort((left, right) => pendingOrder.indexOf(left.chatKey) - pendingOrder.indexOf(right.chatKey));
  for (const { chatId, chatKey, peer, committed, target, before } of histories) {
    const remainingMs = deadline - Date.now();
    if (historyRequests >= CATCHUP_HISTORY_REQUESTS || remainingMs <= 0) break;
    if (peer === undefined || peer === null) {
      throw new Error("telegram CatchUp metadata is missing its provider peer");
    }
    historyRequests += 1;
    const messages = await ops.getMessages(peer, {
      limit: CATCHUP_MESSAGES_PER_CHAT,
      offsetId: before,
    }, remainingMs);
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
      newCursorChats[chatKey] = { last_msg_id: target };
      pendingOrder.splice(pendingOrder.indexOf(chatKey), 1);
      continue;
    }
    if (oldest === undefined || oldest >= before) {
      throw new Error("telegram CatchUp page did not advance its per-chat continuation");
    }
    newCursorChats[chatKey] = {
      last_msg_id: committed,
      target_last_msg_id: target,
      before_message_id: oldest,
    };
    pendingOrder.splice(pendingOrder.indexOf(chatKey), 1);
    pendingOrder.push(chatKey);
  }

  const hasMoreDialogs = page.next_offset !== null;
  // Absence is meaningful only after actual enumeration, never a partial page.
  // @tested-by: tst_cat_tg_gap_003
  if (!hasMoreDialogs) {
    for (const [chatKey, progress] of Object.entries(newCursorChats)) {
      if (hasPendingCatchup(progress) && !seenPending.has(chatKey)) {
        throw new Error(`telegram CatchUp pending chat '${chatKey}' is absent from the dialog snapshot`);
      }
    }
  }
  const hasMore = hasMoreDialogs || Object.values(newCursorChats).some(hasPendingCatchup);
  const nextCursor =
    Object.keys(newCursorChats).length === 0 && !hasMoreDialogs
      ? null
      : {
          date: toRfc3339Utc(new Date()),
          chats: newCursorChats,
          ...(hasMore ? {
            catchup_pending_order: pendingOrder,
            catchup_draining: draining || !hasMoreDialogs,
          } : {}),
          ...(hasMoreDialogs ? {
            catchup_dialog_offset: page.next_offset,
            catchup_pinned_count: pinnedOrder,
            catchup_seen_pending: [...seenPending],
            ...(skipRemaining > 0 ? { catchup_offset: skipRemaining } : {}),
          } : {}),
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
  const peer = await ops.resolvePeer(chatId);
  const messages = await ops.getMessages(peer, { offsetId: beforeMessageId, limit });
  const providerTotal = (messages as MessageLike[] & { readonly total?: number }).total;

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
    total: providerTotal ?? null,
  };
}
