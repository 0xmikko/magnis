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
  OffsetPeer,
  RawDialogLike,
  TakeoutContext,
  TakeoutPager,
  TakeoutRange,
} from "../../client";
import { CursorExpiredError, type FetchArgs } from "@magnis/connector-sdk";
import {
  buildDialogMeta,
  MtprotoTimeoutError,
  SOURCE_PAGE_BUDGET_BYTES,
  SOURCE_PAGE_HISTORY_LIMIT,
  SOURCE_PAGE_BUDGET_MS,
  TELEGRAM_HISTORY_PAGE_SIZE,
  remainingPageBudget,
  chatToIntermediate,
  messageToIntermediate,
  sendWithFloodRetry,
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
    params: { limit?: number; offsetId?: number; ids?: number[]; takeout?: TakeoutContext },
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

interface TakeoutChatCheckpoint {
  chat: TgChat;
  peer: OffsetPeer;
  message_count: number;
  ranges: number[];
  last_msg_id: number;
}

interface TakeoutCheckpoint {
  id: string;
  phase: "estimate" | "publish" | "download" | "finish";
  ranges: TakeoutRange[];
  range_index: number;
  range_started: boolean;
  dialog_offset: DialogOffset | null;
  pinned_count: number;
  publish_index: number;
  download_index: number;
}

interface TelegramCheckpoint {
  takeout: TakeoutCheckpoint;
  chats: Record<string, TakeoutChatCheckpoint>;
}

interface TakeoutTargetCursor {
  checkpoint: TelegramCheckpoint;
  target: {
    scope_id: string;
    start: number;
    end: number;
    range_index: number;
    before_message_id: number;
  };
}

function takeoutPager(pager: DialogPager): TakeoutPager {
  const candidate = pager as Partial<TakeoutPager>;
  if (typeof candidate.initTakeout !== "function" || typeof candidate.takeoutRanges !== "function" ||
      typeof candidate.finishTakeout !== "function") {
    throw new Error("Telegram bootstrap requires a Takeout-capable dialog pager");
  }
  return candidate as TakeoutPager;
}

function checkpoint(value: unknown): TelegramCheckpoint | undefined {
  const root = asObject(value);
  const rawTakeout = asObject(root?.takeout);
  if (root === undefined || rawTakeout === undefined) return undefined;
  const copy = structuredClone(root);
  const takeout = asObject(copy.takeout);
  const chats = asObject(copy.chats);
  if (takeout === undefined || chats === undefined || typeof takeout.id !== "string" || !/^\d+$/.test(takeout.id) ||
      !["estimate", "publish", "download", "finish"].includes(String(takeout.phase)) ||
      !Array.isArray(takeout.ranges) || !Number.isSafeInteger(takeout.range_index) ||
      typeof takeout.range_started !== "boolean" || !Number.isSafeInteger(takeout.pinned_count) ||
      !Number.isSafeInteger(takeout.publish_index) || !Number.isSafeInteger(takeout.download_index)) {
    throw new Error("Telegram Takeout checkpoint is invalid");
  }
  for (const range of takeout.ranges) {
    const item = asObject(range);
    if (item === undefined || !Number.isSafeInteger(item.min_id) || !Number.isSafeInteger(item.max_id) ||
        (item.min_id as number) < 0 || (item.max_id as number) < (item.min_id as number)) {
      throw new Error("Telegram Takeout checkpoint range is invalid");
    }
  }
  return copy as unknown as TelegramCheckpoint;
}

function takeoutContext(state: TelegramCheckpoint, rangeIndex: number): TakeoutContext {
  const range = state.takeout.ranges[rangeIndex];
  if (range === undefined) throw new Error("Telegram Takeout checkpoint range is missing");
  return { id: state.takeout.id, range };
}

function envelopeBytes(envelopes: Record<string, unknown>[]): number {
  return envelopes.reduce((total, envelope, index) =>
    total + new TextEncoder().encode(JSON.stringify(envelope)).byteLength + (index === 0 ? 0 : 1), 0);
}

/** Cursor shape helpers — the cursor is arbitrary host-round-tripped JSON. */
function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Per chat, the inclusive id range one page read: what the host cuts out of
 * the chat's gaps. A chat the page did not read states nothing. */
export type TraversedRanges = Record<string, [number, number]>;

/** Live `magnis.sync.fetch`. `direction = "backward"` (default) → Bootstrap
 * (present-to-past dialog walk); `"forward"` → CatchUp (messages newer than the
 * per-chat cursor). The answer is `{ envelopes, nextCursor, hasMore, traversed }`. */
export async function fetch(
  ops: TgOps,
  pager: DialogPager,
  accountId: string,
  args: FetchArgs,
): Promise<Record<string, unknown>> {
  if (args.target?.kind === "gap") {
    return await fetchGap(ops, accountId, args.scope_id, args.target, args.cursor, args.forward_checkpoint);
  }
  if (args.direction === "forward") {
    const state = checkpoint(args.cursor);
    if (state === undefined) return await runCatchup(ops, accountId, args.cursor, pager);
    if (state.takeout.phase === "download") {
      if (state.takeout.download_index !== Object.keys(state.chats).length) {
        throw new CursorExpiredError("Telegram Takeout seed is incomplete");
      }
      state.takeout.phase = "finish";
      return { envelopes: [], nextCursor: state, hasMore: true };
    }
    if (state.takeout.phase !== "finish") {
      throw new CursorExpiredError("Telegram Takeout bootstrap is incomplete");
    }
    try {
      await takeoutPager(pager).finishTakeout(state.takeout.id);
    } catch (error) {
      if (!takeoutInvalid(error)) throw error;
    }
    return {
      envelopes: [],
      nextCursor: {
        chats: Object.fromEntries(Object.entries(state.chats).map(([scopeId, chat]) =>
          [scopeId, { last_msg_id: chat.last_msg_id, message_count: chat.message_count }])),
      },
      hasMore: true,
    };
  }
  // @tested-by: tst_src_tg_history_default_003
  // @invariant: a new account starts ordinary history immediately; only a
  // persisted Takeout checkpoint enters the Takeout state machine.
  return checkpoint(args.cursor) === undefined
    ? await runBootstrap(args.cursor, pager)
    : await runTakeoutBootstrap(ops, takeoutPager(pager), accountId, args.cursor);
}

function takeoutInvalid(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = error; current !== undefined && !seen.has(current);) {
    seen.add(current);
    if (current !== null && typeof current === "object" &&
        "errorMessage" in current && current.errorMessage === "TAKEOUT_INVALID") return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/** Exact initial history: estimate every range, publish fixed chat totals, then
 * seed newest messages. Each phase is a committed Source page boundary. */
export async function runTakeoutBootstrap(
  ops: TgOps,
  pager: TakeoutPager,
  accountId: string,
  cursor: unknown,
): Promise<Record<string, unknown>> {
  let state = checkpoint(cursor);
  if (state === undefined) {
    const id = await pager.initTakeout();
    const ranges = await pager.takeoutRanges(id);
    state = {
      takeout: {
        id,
        phase: "estimate",
        ranges,
        range_index: 0,
        range_started: false,
        dialog_offset: null,
        pinned_count: 0,
        publish_index: 0,
        download_index: 0,
      },
      chats: {},
    };
  }

  if (state.takeout.phase === "estimate") {
    const deadline = performance.now() + SOURCE_PAGE_BUDGET_MS;
    while (state.takeout.range_index < state.takeout.ranges.length) {
      const rangeIndex = state.takeout.range_index;
      const firstPage = !state.takeout.range_started;
      const page = await pager.dialogPage(firstPage ? null : state.takeout.dialog_offset,
        firstPage ? 1 : BOOTSTRAP_BATCH_DIALOGS, {
          hydrate: false,
          timeoutMs: remainingPageBudget(deadline),
          takeout: takeoutContext(state, rangeIndex),
        });
      state.takeout.range_started = true;
      state.takeout.dialog_offset = page.next_offset;
      for (const dialog of page.dialogs) {
        if (dialog.peer === undefined) throw new Error("Telegram Takeout dialog is missing its peer");
        const key = String(dialog.chat.chat_id);
        let chat = state.chats[key];
        if (chat === undefined) {
          const snapshot = { ...dialog.chat };
          if (snapshot.is_pinned) snapshot.pin_order = state.takeout.pinned_count++;
          chat = { chat: snapshot, peer: dialog.peer, message_count: 0, ranges: [], last_msg_id: 0 };
          state.chats[key] = chat;
        }
        if (!chat.ranges.includes(rangeIndex)) {
          const counted = await ops.getMessages(dialog.peer, {
            limit: 1,
            takeout: takeoutContext(state, rangeIndex),
          }, remainingPageBudget(deadline));
          if (counted.total === undefined) throw new Error("Telegram Takeout history count is missing");
          chat.message_count += counted.total;
          chat.ranges.push(rangeIndex);
          chat.chat = { ...dialog.chat, pin_order: chat.chat.pin_order, message_count: chat.message_count };
        }
      }
      if (page.next_offset === null) {
        state.takeout.range_index += 1;
        state.takeout.range_started = false;
        state.takeout.dialog_offset = null;
      }
      if (performance.now() >= deadline && state.takeout.range_index < state.takeout.ranges.length) {
        return { envelopes: [], nextCursor: state, hasMore: true };
      }
    }
    state.takeout.phase = "publish";
    state.takeout.publish_index = 0;
    return { envelopes: [], nextCursor: state, hasMore: true };
  }

  const keys = Object.keys(state.chats);
  if (state.takeout.phase === "publish") {
    const envelopes: Record<string, unknown>[] = [];
    while (state.takeout.publish_index < keys.length) {
      const chat = state.chats[keys[state.takeout.publish_index] ?? ""];
      if (chat === undefined) throw new Error("Telegram Takeout publish checkpoint is invalid");
      const envelope = chatEnvelope({ ...chat.chat, message_count: chat.message_count });
      const bytes = envelopeBytes([...envelopes, envelope]);
      if (bytes > SOURCE_PAGE_BUDGET_BYTES) {
        if (envelopes.length === 0) throw new Error("Telegram chat envelope exceeds the Source page budget");
        break;
      }
      envelopes.push(envelope);
      state.takeout.publish_index += 1;
    }
    if (state.takeout.publish_index === keys.length) {
      state.takeout.phase = "download";
      state.takeout.download_index = 0;
    }
    return { envelopes, nextCursor: state, hasMore: true };
  }

  if (state.takeout.phase !== "download") {
    throw new Error("Telegram Takeout finish checkpoint cannot bootstrap");
  }

  const deadline = performance.now() + SOURCE_PAGE_BUDGET_MS;
  const envelopes: Record<string, unknown>[] = [];
  const traversed: TraversedRanges = {};
  while (state.takeout.download_index < keys.length) {
    const key = keys[state.takeout.download_index];
    if (key === undefined) throw new Error("Telegram Takeout download checkpoint is invalid");
    const chat = state.chats[key];
    if (chat === undefined) throw new Error("Telegram Takeout download checkpoint is invalid");
    const rangeIndex = [...chat.ranges].sort((left, right) =>
      (state.takeout.ranges[right]?.max_id ?? -1) - (state.takeout.ranges[left]?.max_id ?? -1))[0];
    if (rangeIndex === undefined) throw new Error("Telegram Takeout chat has no recorded range");
    const messages = await ops.getMessages(chat.peer, {
      limit: TELEGRAM_HISTORY_PAGE_SIZE,
      takeout: takeoutContext(state, rangeIndex),
    }, remainingPageBudget(deadline));
    const page = [chatEnvelope({ ...chat.chat, message_count: chat.message_count }),
      ...messages.map((message) => messageEnvelope(messageToIntermediate(message, accountId, chat.chat.chat_id), "snapshot"))];
    if (envelopeBytes([...envelopes, ...page]) > SOURCE_PAGE_BUDGET_BYTES) {
      if (envelopes.length === 0) throw new Error("Telegram seed page exceeds the Source page budget");
      break;
    }
    envelopes.push(...page);
    if (messages.length > 0) {
      const ids = messages.map((message) => message.id);
      const oldest = Math.min(...ids);
      const newest = Math.max(...ids);
      traversed[key] = [oldest, newest];
      chat.last_msg_id = newest;
    }
    state.takeout.download_index += 1;
    if (performance.now() >= deadline) break;
  }
  const hasMore = state.takeout.download_index < keys.length;
  return { envelopes, nextCursor: state, hasMore, traversed };
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
  const traversed: TraversedRanges = {};
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
    let oldest = 0;
    for (const m of paged.messages) {
      highest = Math.max(highest, m.message_id);
      oldest = oldest === 0 ? m.message_id : Math.min(oldest, m.message_id);
      envelopes.push(messageEnvelope(m, "snapshot"));
    }
    // What the page read of this chat: its newest messages down to the oldest
    // of the page, and up to the dialog's top or past it when the chat grew
    // since GetDialogs; the whole history from one when the answer was all of
    // it (the count equals the page). An empty chat and a failed read state
    // nothing — the host keeps asking for them.
    // @tested-by: tst_tgts_boot_014
    if (paged.messages.length > 0) {
      const top = Math.max(paged.chat.top_message, highest);
      traversed[String(paged.chat.chat_id)] = paged.chat.message_count === paged.messages.length ? [1, top] : [oldest, top];
    }
    // Record EVERY enumerated chat (incl. 0-message → last_msg_id 0) so CatchUp
    // later fills it; with offset paging it is enumerated exactly once. The
    // exact count Telegram reported rides next to the watermark so a later
    // walk restates the chat with it.
    cursorChats[String(paged.chat.chat_id)] = paged.chat.message_count === undefined
      ? { last_msg_id: highest }
      : { last_msg_id: highest, message_count: paged.chat.message_count };
  }

  const hasMore = page.next_offset !== null;
  const nextCursor =
    Object.keys(cursorChats).length === 0 && page.next_offset === null
      ? null
      : {
          date: toRfc3339Utc(new Date()),
          chats: cursorChats,
          pinned_count: pinnedOrder,
          dialog_offset: page.next_offset,
        };

  return { envelopes, nextCursor, hasMore, traversed };
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
 * toward the old watermark. The result states, per chat it read, the id range
 * the page covered: the page's own range while the gap continues, the whole
 * gap once the read reached the committed watermark.
 *
 * @tested-by: tst_cat_tg_gap_001, tst_tgts_catch_008
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
  const traversed: TraversedRanges = {};
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
      const listed = await pager.dialogPage(page?.next_offset ?? null, BOOTSTRAP_BATCH_DIALOGS,
        { hydrate: false, timeoutMs: remainingPageBudget(deadline) });
      page = { pending: listed.dialogs.map((dialog) => {
        if (dialog.peer === undefined) throw new Error("Telegram CatchUp discovery requires a peer");
        const chat = { ...dialog.chat, pin_order: dialog.chat.is_pinned ? pinnedOrder++ : 0 };
        return { chat, peer: dialog.peer };
      }), next_offset: listed.next_offset, pinned_count: pinnedOrder };
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
      traversed[chatKey] = [committed + 1, target];
      continue;
    }
    if (oldest === undefined || oldest >= before) {
      throw new Error("telegram CatchUp page did not advance its per-chat continuation");
    }
    traversed[chatKey] = [oldest, before - 1];
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

  return { envelopes, nextCursor, hasMore, traversed };
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

/** Live `magnis.execute`. Ports send_message, reply and download_file.
 * Provider reads belong exclusively to `magnis.sync.fetch`. */
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

async function fetchGap(
  ops: TgOps,
  accountId: string,
  scopeId: string | undefined,
  target: { kind: "gap"; start: number; end: number },
  cursor: unknown,
  forwardCheckpoint: unknown,
): Promise<Record<string, unknown>> {
  if (scopeId === undefined || !/^-?\d+$/.test(scopeId)) throw new Error("gap fetch requires numeric scope_id");
  const chatId = Number(scopeId);
  if (!Number.isSafeInteger(chatId) || chatId === 0 || String(chatId) !== scopeId) {
    throw new Error("gap fetch requires numeric scope_id");
  }
  if (
    !Number.isSafeInteger(target.start) || target.start <= 0 ||
    !Number.isSafeInteger(target.end) || target.end < target.start
  ) {
    throw new Error("gap fetch requires a positive ordered target");
  }
  let continuation: TakeoutTargetCursor;
  if (cursor === undefined) {
    const state = checkpoint(forwardCheckpoint);
    if (state === undefined) throw new CursorExpiredError("Telegram bounded history requires a Takeout checkpoint");
    const chat = state.chats[scopeId];
    if (state.takeout.phase !== "download" || chat === undefined) {
      throw new CursorExpiredError("Telegram bounded history checkpoint is stale");
    }
    const ranges = targetRanges(state, chat, target);
    const rangeIndex = ranges[0];
    if (rangeIndex === undefined) {
      return {
        envelopes: [],
        traversed: { [scopeId]: [target.start, target.end] },
        progress: { kind: "completeTarget", forwardCheckpoint: { kind: "replace", value: state } },
        total: chat.message_count,
      };
    }
    const range = state.takeout.ranges[rangeIndex];
    if (range === undefined) throw new Error("Telegram Takeout target range is missing");
    continuation = { checkpoint: state, target: { scope_id: scopeId, start: target.start, end: target.end,
      range_index: rangeIndex, before_message_id: Math.min(target.end, range.max_id) + 1 } };
  } else {
    const raw = asObject(cursor);
    const state = checkpoint(raw?.checkpoint);
    const progress = asObject(raw?.target);
    if (state === undefined || progress?.scope_id !== scopeId ||
        progress.start !== target.start || progress.end !== target.end ||
        !Number.isSafeInteger(progress.range_index) || !Number.isSafeInteger(progress.before_message_id)) {
      throw new Error("Telegram Takeout target cursor is invalid");
    }
    continuation = { checkpoint: state, target: progress as unknown as TakeoutTargetCursor["target"] };
  }
  const state = continuation.checkpoint;
  const chat = state.chats[scopeId];
  if (state.takeout.phase !== "download" || chat === undefined) {
    throw new CursorExpiredError("Telegram bounded history checkpoint is stale");
  }
  const ranges = targetRanges(state, chat, target);
  let rangePosition = ranges.indexOf(continuation.target.range_index);
  if (rangePosition < 0) throw new Error("Telegram Takeout target cursor range is invalid");
  let before = continuation.target.before_message_id;
  const invocationUpper = before - 1;
  if (before <= target.start || before > target.end + 1) throw new Error("Telegram Takeout target cursor is outside its gap");
  const deadline = performance.now() + SOURCE_PAGE_BUDGET_MS;
  const envelopes: Record<string, unknown>[] = [];
  let oldest: number | null = null;
  let envelopeBytes = 0;
  let complete = false;
  providerPages: for (;;) {
    const rangeIndex = ranges[rangePosition];
    if (rangeIndex === undefined) {
      complete = true;
      break;
    }
    const range = state.takeout.ranges[rangeIndex];
    if (range === undefined) {
      complete = true;
      break;
    }
    const rangeLower = Math.max(target.start, range.min_id);
    const rangeUpper = Math.min(target.end, range.max_id);
    if (before <= rangeLower || before > rangeUpper + 1) {
      throw new Error("Telegram Takeout target cursor is outside its range");
    }
    let messages: MessagePage;
    try {
      messages = await ops.getMessages(
        chat.peer,
        { offsetId: before, limit: TELEGRAM_HISTORY_PAGE_SIZE,
          takeout: takeoutContext(state, rangeIndex) },
        remainingPageBudget(deadline),
      );
    } catch (error) {
      if (envelopes.length > 0 && error instanceof MtprotoTimeoutError) break;
      throw error;
    }
    let providerOldest: number | null = null;
    let acceptedOldest: number | null = null;
    for (const msg of messages) {
      providerOldest = providerOldest === null ? msg.id : Math.min(providerOldest, msg.id);
      if (msg.id < rangeLower || msg.id > rangeUpper) throw new Error("Telegram history escaped its Takeout range");
      const envelope = messageEnvelope(messageToIntermediate(msg, accountId, chatId), "snapshot");
      const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength + (envelopes.length === 0 ? 0 : 1);
      if (envelopeBytes + bytes > SOURCE_PAGE_BUDGET_BYTES) {
        if (envelopes.length === 0) throw new Error("Telegram history envelope exceeds the Source page budget");
        if (acceptedOldest !== null) before = acceptedOldest;
        break providerPages;
      }
      envelopes.push(envelope);
      envelopeBytes += bytes;
      oldest = oldest === null ? msg.id : Math.min(oldest, msg.id);
      acceptedOldest = acceptedOldest === null ? msg.id : Math.min(acceptedOldest, msg.id);
    }
    if (providerOldest !== null && providerOldest >= before) {
      throw new Error("Telegram history did not advance");
    }
    const rangeComplete = providerOldest === null || providerOldest <= rangeLower ||
      messages.length < TELEGRAM_HISTORY_PAGE_SIZE;
    if (rangeComplete) {
      rangePosition += 1;
      const nextRangeIndex = ranges[rangePosition];
      const nextRange = nextRangeIndex === undefined ? undefined : state.takeout.ranges[nextRangeIndex];
      if (nextRange === undefined) {
        complete = true;
        break;
      }
      before = Math.min(target.end, nextRange.max_id) + 1;
    } else if (providerOldest !== null) {
      before = providerOldest;
    }
    if (performance.now() >= deadline) break;
  }
  if (!complete && oldest === null) throw new Error("Telegram history did not advance");
  const traversedFrom = complete ? target.start : oldest;
  if (traversedFrom === null) throw new Error("Telegram history did not state target coverage");
  const progress = complete
    ? { kind: "completeTarget", forwardCheckpoint: { kind: "replace", value: state } }
    : { kind: "continueTarget", continuationToken: {
        checkpoint: state,
        target: { scope_id: scopeId, start: target.start, end: target.end,
          range_index: ranges[rangePosition], before_message_id: before },
      } };
  return {
    envelopes,
    traversed: { [scopeId]: [traversedFrom, invocationUpper] },
    progress,
    total: chat.message_count,
  };
}

function targetRanges(
  state: TelegramCheckpoint,
  chat: TakeoutChatCheckpoint,
  target: { start: number; end: number },
): number[] {
  return chat.ranges.filter((index) => {
    const range = state.takeout.ranges[index];
    return range !== undefined && range.max_id >= target.start && range.min_id <= target.end;
  }).sort((left, right) => {
    const leftRange = state.takeout.ranges[left];
    const rightRange = state.takeout.ranges[right];
    if (leftRange === undefined || rightRange === undefined) throw new Error("Telegram Takeout chat range is missing");
    return rightRange.max_id - leftRange.max_id;
  });
}
