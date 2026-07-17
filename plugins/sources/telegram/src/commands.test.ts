// Bootstrap / catch-up parity tests — the TS mirror of the Rust
// plugins/sources/telegram/src/commands.rs `mod tests` (FakePager harness).

import { describe, expect, test } from "bun:test";
import type {
  DialogOffset,
  DialogPage,
  DialogPager,
  EntityLike,
  MessageLike,
  RawDialogLike,
} from "./client";
import { resolveHydratedMessages } from "./client";
import type { TgChat, TgMessage } from "./envelope";
import {
  BOOTSTRAP_BATCH_DIALOGS,
  runBootstrap,
  runCatchup,
  type CatchupDialog,
  type TgOps,
} from "./commands";

// ── fakes ───────────────────────────────────────────────────────────────────

/** A typed RPC error the way gramjs raises it (code + errorMessage). */
function rpcErr(code: number, name: string): Error & { code: number; errorMessage: string } {
  const e = new Error(name) as Error & { code: number; errorMessage: string };
  e.code = code;
  e.errorMessage = name;
  return e;
}

function fakeChat(chatId: number, isPinned: boolean): TgChat {
  return {
    chat_id: chatId,
    title: `Chat ${chatId}`,
    chat_type: "private",
    is_pinned: isPinned,
    pin_order: 0,
    unread_count: 0,
    unread_mark: false,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_mentions_count: 0,
    top_message: 0,
  };
}

function fakeMsg(chatId: number, messageId: number): TgMessage {
  return {
    message_id: messageId,
    chat_id: chatId,
    text: "",
    date: "2026-01-01T00:00:00+00:00",
    is_outgoing: false,
    has_media: false,
    is_pinned: false,
    account_id: "",
    live: false,
  };
}

interface FakeDialog {
  chat_id: number;
  is_pinned: boolean;
  msg_ids: number[];
  /** When set, this chat's history hydration fails with the given RPC error —
   * routed through the SAME resolveHydratedMessages seam the live pager uses. */
  history_rpc_err?: [number, string];
}

/** Deterministic DialogPager over an ordered in-memory dialog list. Pages by a
 * synthetic index encoded in `offset_id`, records every request, and — crucially
 * — re-serves dialogs from `start`, so a loop that fails to advance the offset
 * (the O(N²) bug) re-hands earlier dialogs and the test catches it. */
class FakePager implements DialogPager {
  readonly requests: (number | null)[] = [];
  handed = 0;

  constructor(
    private readonly dialogs: FakeDialog[],
    private readonly pageSize: number,
    private readonly total: number | null = null,
  ) {}

  async dialogPage(offset: DialogOffset | null, limit: number): Promise<DialogPage> {
    this.requests.push(offset === null ? null : offset.offset_id);
    const start = offset === null ? 0 : offset.offset_id;
    const take = Math.min(limit, this.pageSize);
    const end = Math.min(start + take, this.dialogs.length);
    this.handed += Math.max(0, end - start);

    const dialogs = [];
    for (const fd of this.dialogs.slice(start, end)) {
      // Mirror LiveDialogPager: hydrate into a settled result, then run it
      // through the real skip/propagate seam. A transient error yields an empty
      // snapshot (chat still discovered); a fatal one aborts the page.
      const fetched: { ok: true; messages: TgMessage[] } | { ok: false; error: unknown } =
        fd.history_rpc_err !== undefined
          ? { ok: false, error: rpcErr(fd.history_rpc_err[0], fd.history_rpc_err[1]) }
          : { ok: true, messages: fd.msg_ids.map((m) => fakeMsg(fd.chat_id, m)) };
      const messages = resolveHydratedMessages(fd.chat_id, fetched);
      dialogs.push({ chat: fakeChat(fd.chat_id, fd.is_pinned), messages });
    }

    const nextOffset: DialogOffset | null =
      end < this.dialogs.length
        ? { offset_date: 0, offset_id: end, offset_peer: { ty: "user", id: 0 } }
        : null;
    return { dialogs, next_offset: nextOffset, total: this.total };
  }
}

function simpleDialogs(n: number): FakeDialog[] {
  return Array.from({ length: n }, (_, i) => ({
    chat_id: 1000 + i,
    is_pinned: false,
    msg_ids: [i * 10 + 1, i * 10 + 2],
  }));
}

/** Drive the HOST's bootstrap loop over the fake: repeatedly call runBootstrap
 * threading nextCursor until hasMore=false. Returns the emitted chat ids (in
 * order, across batches), the per-batch hasMore, and the final cursor. */
async function driveBootstrap(
  pager: FakePager,
  cursor: unknown = null,
): Promise<{ emitted: number[]; hasMores: boolean[]; cursor: unknown }> {
  const emitted: number[] = [];
  const hasMores: boolean[] = [];
  for (let i = 0; i < 50; i += 1) {
    const out = await runBootstrap(cursor, pager);
    for (const env of out.envelopes as Record<string, unknown>[]) {
      const rid = String(env.remote_id ?? "");
      if (rid.startsWith("tg:chat:")) {
        emitted.push((env.payload as Record<string, unknown>).chat_id as number);
      }
    }
    const hm = out.hasMore as boolean;
    hasMores.push(hm);
    cursor = out.nextCursor;
    if (!hm) break;
  }
  return { emitted, hasMores, cursor };
}

// ── bootstrap ───────────────────────────────────────────────────────────────

describe("bootstrap", () => {
  // Twin of tst_src_tg_bootstrap_001.
  test("tst_tgts_boot_001 every dialog enumerated exactly once; hasMore until exhausted", async () => {
    const pager = new FakePager(simpleDialogs(130), 50);
    const { emitted, hasMores, cursor } = await driveBootstrap(pager);

    expect(emitted).toHaveLength(130);
    expect(new Set(emitted).size).toBe(130);
    expect(hasMores).toEqual([true, true, false]);
    expect((cursor as Record<string, unknown>).dialog_offset).toBeNull();
  });

  // Twin of tst_src_tg_o_n_002 — the O(N) regression lock.
  test("tst_tgts_boot_002 the pager hands each dialog once; offsets advance", async () => {
    const pager = new FakePager(simpleDialogs(130), 50);
    await driveBootstrap(pager);
    expect(pager.handed).toBe(130);
    expect(pager.requests).toEqual([null, 50, 100]);
  });

  test("tst_tgts_boot_003 the loop requests the Rust batch size (50)", async () => {
    let seenLimit = -1;
    const pager: DialogPager = {
      async dialogPage(_offset, limit) {
        seenLimit = limit;
        return { dialogs: [], next_offset: null, total: null };
      },
    };
    await runBootstrap(null, pager);
    expect(seenLimit).toBe(BOOTSTRAP_BATCH_DIALOGS);
    expect(seenLimit).toBe(50);
  });

  test("tst_tgts_boot_004 emission order is chat-then-its-messages, per dialog", async () => {
    const pager = new FakePager(
      [
        { chat_id: 7, is_pinned: false, msg_ids: [1, 2] },
        { chat_id: 8, is_pinned: false, msg_ids: [3] },
      ],
      50,
    );
    const out = await runBootstrap(null, pager);
    expect((out.envelopes as Record<string, unknown>[]).map((e) => e.remote_id)).toEqual([
      "tg:chat:7",
      "tg:msg:7:1",
      "tg:msg:7:2",
      "tg:chat:8",
      "tg:msg:8:3",
    ]);
  });

  // Twin of tst_src_tg_zero_msg_003.
  test("tst_tgts_boot_005 a 0-message chat is recorded once with watermark 0", async () => {
    const dialogs = simpleDialogs(60);
    dialogs[10]!.msg_ids = [];
    const emptyId = dialogs[10]!.chat_id;
    const { emitted, cursor } = await driveBootstrap(new FakePager(dialogs, 50));

    expect(emitted.filter((c) => c === emptyId)).toHaveLength(1);
    const chats = (cursor as Record<string, unknown>).chats as Record<string, unknown>;
    expect((chats[String(emptyId)] as Record<string, unknown>).last_msg_id).toBe(0);
  });

  test("tst_tgts_boot_006 the watermark is the MAX message id of the chat", async () => {
    const pager = new FakePager([{ chat_id: 5, is_pinned: false, msg_ids: [9, 40, 12] }], 50);
    const out = await runBootstrap(null, pager);
    const chats = (out.nextCursor as Record<string, unknown>).chats as Record<string, unknown>;
    expect((chats["5"] as Record<string, unknown>).last_msg_id).toBe(40);
  });

  // Twin of tst_src_tg_pinned_004.
  test("tst_tgts_boot_007 pinned_count seeds monotonically across batch boundaries", async () => {
    // 3 pinned at the head, 2 normal; page size 2 → the pinned span batches 1-2.
    const dialogs = simpleDialogs(5);
    for (const d of dialogs.slice(0, 3)) d.is_pinned = true;
    const { emitted, cursor } = await driveBootstrap(new FakePager(dialogs, 2));

    expect(emitted).toHaveLength(5);
    // Exactly 3 pinned counted — no double-count across batches.
    expect((cursor as Record<string, unknown>).pinned_count).toBe(3);
  });

  test("tst_tgts_boot_008 pin_order is assigned by the LOOP: running for pinned, 0 otherwise", async () => {
    const dialogs: FakeDialog[] = [
      { chat_id: 1, is_pinned: true, msg_ids: [] },
      { chat_id: 2, is_pinned: false, msg_ids: [] },
      { chat_id: 3, is_pinned: true, msg_ids: [] },
    ];
    const out = await runBootstrap(null, new FakePager(dialogs, 50));
    const orders = (out.envelopes as Record<string, unknown>[]).map(
      (e) => (e.payload as Record<string, unknown>).pin_order,
    );
    expect(orders).toEqual([0, 0, 1]); // pinned:0, unpinned:0, pinned:1

    // A resumed batch SEEDS from cursor.pinned_count (monotonic across batches).
    const resumed = await runBootstrap(
      { chats: {}, pinned_count: 7 },
      new FakePager([{ chat_id: 9, is_pinned: true, msg_ids: [] }], 50),
    );
    expect(
      ((resumed.envelopes as Record<string, unknown>[])[0]!.payload as Record<string, unknown>)
        .pin_order,
    ).toBe(7);
    expect(resumed.pinned_count).toBeUndefined(); // it lives on the cursor
    expect((resumed.nextCursor as Record<string, unknown>).pinned_count).toBe(8);
  });

  // Twin of tst_src_tg_bootstrap_total_001.
  test("tst_tgts_boot_009 total passes through; discovered is CUMULATIVE", async () => {
    const pager = new FakePager(simpleDialogs(130), 50, 130);

    const first = await runBootstrap(null, pager);
    expect(first.total).toBe(130);
    expect(first.discovered).toBe(50);

    let cursor = first.nextCursor;
    let lastDiscovered = first.discovered as number;
    for (let i = 0; i < 10; i += 1) {
      const out = await runBootstrap(cursor, pager);
      expect(out.total).toBe(130);
      lastDiscovered = out.discovered as number;
      cursor = out.nextCursor;
      if (!(out.hasMore as boolean)) break;
    }
    expect(lastDiscovered).toBe(130);
  });

  test("tst_tgts_boot_010 total is null when the pager omits it", async () => {
    const out = await runBootstrap(null, new FakePager(simpleDialogs(3), 50));
    expect(out.total).toBeNull();
  });

  test("tst_tgts_boot_011 nextCursor is null IFF no chats AND no next offset", async () => {
    // Empty account: nothing enumerated, walk exhausted → null cursor.
    const empty = await runBootstrap(null, new FakePager([], 50));
    expect(empty.nextCursor).toBeNull();
    expect(empty.hasMore).toBe(false);

    // Chats present → a cursor is emitted even though the walk is exhausted.
    const some = await runBootstrap(null, new FakePager(simpleDialogs(2), 50));
    expect(some.nextCursor).not.toBeNull();
    expect((some.nextCursor as Record<string, unknown>).dialog_offset).toBeNull();
  });

  test("tst_tgts_boot_012 the cursor round-trips the dialog_offset peer ty verbatim", async () => {
    const pager: DialogPager = {
      async dialogPage() {
        return {
          dialogs: [],
          next_offset: {
            offset_date: 1234,
            offset_id: 99,
            offset_peer: { ty: "channel", id: -100500, access_hash: 42 },
          },
          total: null,
        };
      },
    };
    const out = await runBootstrap(null, pager);
    expect((out.nextCursor as Record<string, unknown>).dialog_offset).toEqual({
      offset_date: 1234,
      offset_id: 99,
      offset_peer: { ty: "channel", id: -100500, access_hash: 42 },
    });
    expect(out.hasMore).toBe(true);

    // …and a resumed call hands that exact offset straight back to the pager.
    let seen: DialogOffset | null = null;
    await runBootstrap(out.nextCursor, {
      async dialogPage(offset) {
        seen = offset;
        return { dialogs: [], next_offset: null, total: null };
      },
    });
    expect(seen).toEqual({
      offset_date: 1234,
      offset_id: 99,
      offset_peer: { ty: "channel", id: -100500, access_hash: 42 },
    });
  });

  // Twin of tst_src_tg_cursor_compat_005.
  test("tst_tgts_boot_013 an OLD cursor (chats, no dialog_offset) resumes from the top", async () => {
    const pager = new FakePager(simpleDialogs(120), 50);
    const oldCursor = {
      date: "2026-01-01T00:00:00+00:00",
      chats: { "1000": { last_msg_id: 5 }, "1001": { last_msg_id: 7 } },
      pinned_count: 1,
    };
    const { emitted, hasMores } = await driveBootstrap(pager, oldCursor);

    expect(pager.requests[0]).toBeNull(); // no dialog_offset → resume from the top
    expect(new Set(emitted).size).toBe(120);
    expect(hasMores.at(-1)).toBe(false);
  });
});

// ── per-chat history error policy ───────────────────────────────────────────

describe("per-chat history error policy", () => {
  // Twin of tst_src_tg_bootstrap_history_skip_012 — THE live regression: a single
  // chat's getHistory 500 aborted the WHOLE bootstrap at 1954/2581 dialogs.
  test("tst_tgts_hist_001 a transient (500) history error skips the chat, batch continues", async () => {
    const dialogs = simpleDialogs(60);
    const failingId = dialogs[30]!.chat_id;
    dialogs[30]!.history_rpc_err = [500, "RPC_CALL_FAIL"];
    const { emitted, hasMores, cursor } = await driveBootstrap(new FakePager(dialogs, 50, 60));

    expect(new Set(emitted).size).toBe(60);
    // The failing chat is STILL discovered (its chat envelope is emitted).
    expect(emitted).toContain(failingId);
    expect(hasMores.at(-1)).toBe(false);
    // …recorded with watermark 0 → re-attempted next cycle.
    const chats = (cursor as Record<string, unknown>).chats as Record<string, unknown>;
    expect((chats[String(failingId)] as Record<string, unknown>).last_msg_id).toBe(0);
  });

  test("tst_tgts_hist_002 the skipped chat emits its chat envelope but NO messages", async () => {
    const out = await runBootstrap(
      null,
      new FakePager(
        [{ chat_id: 5, is_pinned: false, msg_ids: [1, 2, 3], history_rpc_err: [500, "RPC_CALL_FAIL"] }],
        50,
      ),
    );
    expect((out.envelopes as Record<string, unknown>[]).map((e) => e.remote_id)).toEqual([
      "tg:chat:5",
    ]);
  });

  // Twin of tst_src_tg_bootstrap_history_fatal_013.
  test("tst_tgts_hist_003 401 / 420 / FLOOD_WAIT are FATAL and abort the batch", async () => {
    for (const [code, name] of [
      [401, "AUTH_KEY_UNREGISTERED"],
      [420, "FLOOD_WAIT_30"],
    ] as [number, string][]) {
      const dialogs = simpleDialogs(10);
      dialogs[3]!.history_rpc_err = [code, name];
      await expect(runBootstrap(null, new FakePager(dialogs, 50))).rejects.toThrow(name);
    }
  });

  test("tst_tgts_hist_004 a non-RPC error is transient (skip, don't abort)", async () => {
    const messages = resolveHydratedMessages(42, {
      ok: false,
      error: new Error("connection reset"),
    });
    expect(messages).toEqual([]);
  });
});

// ── catch-up ────────────────────────────────────────────────────────────────

function entity(id: number): EntityLike {
  return { className: "User", id, firstName: `U${id}` };
}

function rawDialog(topMessage: number, pinned = false): RawDialogLike {
  return { className: "Dialog", pinned, topMessage, unreadCount: 0 };
}

function liveMsg(id: number): MessageLike {
  return { id, message: "", date: 1767225600, out: false };
}

/** Minimal TgOps fake: a dialog list + a per-chat newest-first message list. */
function fakeOps(
  dialogs: { chatId: number; topMessage: number; pinned?: boolean; messages: number[] }[],
  calls: { getMessages: number[] } = { getMessages: [] },
): TgOps {
  return {
    async listDialogs(): Promise<CatchupDialog[]> {
      return dialogs.map((d) => ({
        entity: entity(d.chatId),
        raw: rawDialog(d.topMessage, d.pinned),
        pinned: d.pinned === true,
        peer: d.chatId,
      }));
    },
    async resolvePeer(chatId) {
      return chatId;
    },
    async getMessages(peer) {
      calls.getMessages.push(peer as number);
      const d = dialogs.find((x) => x.chatId === peer);
      // Newest-first, as gramjs returns.
      return (d?.messages ?? []).slice().sort((a, b) => b - a).map(liveMsg);
    },
    async sendMessage() {
      throw new Error("not used");
    },
    async downloadMedia() {
      throw new Error("not used");
    },
  };
}

describe("catch-up", () => {
  test("tst_tgts_catch_001 emits only messages ABOVE the watermark; no total/discovered", async () => {
    const ops = fakeOps([{ chatId: 5, topMessage: 20, messages: [10, 20] }]);
    const out = await runCatchup(ops, "acct", { chats: { "5": { last_msg_id: 10 } } });

    expect((out.envelopes as Record<string, unknown>[]).map((e) => e.remote_id)).toEqual([
      "tg:chat:5",
      "tg:msg:5:20",
    ]);
    expect(out.hasMore).toBe(false);
    // Bootstrap-only progress counters must be ABSENT (not null) on catch-up.
    expect("total" in out).toBe(false);
    expect("discovered" in out).toBe(false);
  });

  test("tst_tgts_catch_002 skips the history call when top_message <= watermark", async () => {
    const calls = { getMessages: [] as number[] };
    const ops = fakeOps([{ chatId: 5, topMessage: 10, messages: [10] }], calls);
    const out = await runCatchup(ops, "acct", { chats: { "5": { last_msg_id: 10 } } });

    // The chat envelope is emitted ALWAYS, but no history was fetched…
    expect((out.envelopes as Record<string, unknown>[]).map((e) => e.remote_id)).toEqual([
      "tg:chat:5",
    ]);
    expect(calls.getMessages).toEqual([]);
    // …and the watermark is CARRIED, not dropped.
    const chats = (out.nextCursor as Record<string, unknown>).chats as Record<string, unknown>;
    expect((chats["5"] as Record<string, unknown>).last_msg_id).toBe(10);
  });

  test("tst_tgts_catch_003 breaks the walk at the first message <= watermark", async () => {
    // Newest-first [30, 20, 10] with watermark 10 → 30 and 20 emitted, then break.
    const ops = fakeOps([{ chatId: 5, topMessage: 30, messages: [10, 20, 30] }]);
    const out = await runCatchup(ops, "acct", { chats: { "5": { last_msg_id: 10 } } });
    expect((out.envelopes as Record<string, unknown>[]).map((e) => e.remote_id)).toEqual([
      "tg:chat:5",
      "tg:msg:5:30",
      "tg:msg:5:20",
    ]);
    const chats = (out.nextCursor as Record<string, unknown>).chats as Record<string, unknown>;
    expect((chats["5"] as Record<string, unknown>).last_msg_id).toBe(30);
  });

  test("tst_tgts_catch_004 no cursor → every message flows (offset 0 disables the break)", async () => {
    const ops = fakeOps([{ chatId: 5, topMessage: 30, messages: [10, 20, 30] }]);
    const out = await runCatchup(ops, "acct", null);
    expect(out.envelopes).toHaveLength(4); // chat + 3 messages
  });

  test("tst_tgts_catch_005 a 0-message chat with no watermark is NOT recorded", async () => {
    // new_last = max(undefined ?? 0, 0) = 0 → insert only if > 0.
    const ops = fakeOps([{ chatId: 5, topMessage: 0, messages: [] }]);
    const out = await runCatchup(ops, "acct", null);
    expect(out.nextCursor).toBeNull(); // no chats recorded → null cursor
    expect(out.envelopes).toHaveLength(1); // the chat envelope still emitted
  });

  test("tst_tgts_catch_006 pinned order restarts at 0 on each catch-up pass", async () => {
    const ops = fakeOps([
      { chatId: 1, topMessage: 0, pinned: true, messages: [] },
      { chatId: 2, topMessage: 0, pinned: false, messages: [] },
      { chatId: 3, topMessage: 0, pinned: true, messages: [] },
    ]);
    const out = await runCatchup(ops, "acct", null);
    expect(
      (out.envelopes as Record<string, unknown>[]).map(
        (e) => (e.payload as Record<string, unknown>).pin_order,
      ),
    ).toEqual([0, 0, 1]);
  });

  test("tst_tgts_catch_007 the account_id reaches the message payloads", async () => {
    const ops = fakeOps([{ chatId: 5, topMessage: 1, messages: [1] }]);
    const out = await runCatchup(ops, "conn-abc", null);
    const msg = (out.envelopes as Record<string, unknown>[])[1]!;
    // No media here, so source_ref is absent — but the intermediate carries the
    // account id, which media messages stamp into source_ref.account_id.
    expect((msg.payload as Record<string, unknown>).message_id).toBe(1);
    expect(msg.remote_id).toBe("tg:msg:5:1");
  });
});
