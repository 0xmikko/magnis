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
  buildDialogMeta,
  chatToIntermediate,
  messageToIntermediate,
  sendWithFloodRetry,
  toNum,
} from "../../client";
import { chatEnvelope, messageEnvelope, toRfc3339Utc } from "./envelope";

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
  resolvePeer(chatId: number): Promise<unknown>;
  getMessages(
    peer: unknown,
    params: { limit?: number; offsetId?: number; ids?: number[] },
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
    ? await runCatchup(ops, accountId, cursor)
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

/** CatchUp: walk ALL dialogs from the top and emit only messages newer than each
 * chat's watermark. Result carries NO `total` / `discovered` (bootstrap-only
 * progress counters) and `hasMore` is always false. */
export async function runCatchup(
  ops: TgOps,
  accountId: string,
  cursor: unknown,
): Promise<Record<string, unknown>> {
  const c = asObject(cursor);
  const inChats = asObject(c?.chats) ?? {};
  const offsetFor = (chatId: number): number => {
    const entry = asObject(inChats[String(chatId)]);
    const last = entry?.last_msg_id;
    return typeof last === "number" ? last : 0;
  };

  const envelopes: Record<string, unknown>[] = [];
  const newCursorChats: Record<string, unknown> = {};
  // pinned_order restarts at 0 on every catch-up pass (the walk starts at the top).
  let pinnedOrder = 0;

  for (const dialog of await ops.listDialogs()) {
    const chatId = toNum(dialog.entity.id);
    const isPinned = dialog.pinned;
    let pinOrder = 0;
    if (isPinned) {
      pinOrder = pinnedOrder;
      pinnedOrder += 1;
    }
    const meta = buildDialogMeta(dialog.raw, isPinned, pinOrder);
    // The chat envelope is emitted ALWAYS, even when its history is skipped.
    envelopes.push(chatEnvelope(chatToIntermediate(dialog.entity, meta)));

    const offsetId = offsetFor(chatId);
    if (offsetId > 0 && meta.top_message <= offsetId) {
      // Nothing new in this chat — carry the watermark, skip the history call.
      newCursorChats[String(chatId)] = { last_msg_id: offsetId };
      continue;
    }

    let highest: number | undefined;
    const messages = await ops.getMessages(dialog.peer, {
      limit: CATCHUP_MESSAGES_PER_CHAT,
    });
    for (const msg of messages) {
      const msgId = msg.id;
      // getMessages is newest-first: the first message at/below the watermark
      // ends the walk for this chat.
      if (offsetId > 0 && msgId <= offsetId) break;
      highest = highest === undefined ? msgId : Math.max(highest, msgId);
      envelopes.push(
        messageEnvelope(messageToIntermediate(msg, accountId, chatId), "snapshot"),
      );
    }
    const newLast = Math.max(highest ?? offsetId, offsetId);
    if (newLast > 0) newCursorChats[String(chatId)] = { last_msg_id: newLast };
  }

  const nextCursor =
    Object.keys(newCursorChats).length === 0
      ? null
      : { date: toRfc3339Utc(new Date()), chats: newCursorChats };

  return { envelopes, nextCursor, hasMore: false };
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

  const envelopes: Record<string, unknown>[] = [];
  let oldest: number | null = null;
  // Stamp the connection's account_id into every backfilled message's source_ref.
  // Previously hardcoded "" — which the host did NOT re-stamp for the external
  // connector, so backfilled media facets carried account_id="" and the
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
  };
}
