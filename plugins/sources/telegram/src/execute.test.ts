// `magnis.execute` parity tests — the TS mirror of the Rust
// plugins/sources/telegram/src/commands.rs execute/backfill/arg_i64 tests, plus
// the FLOOD_WAIT → -32002 wire mapping from main.rs.

import { describe, expect, test } from "bun:test";
import { argI64, backfillHasMore, execute, type TgOps } from "./commands";
import type { MessageLike } from "./client";
import {
  classifyToolError,
  handleMessage,
  toolErrorReply,
  AUTH_REQUIRED_CODE,
  RATE_LIMITED_CODE,
  TOOL_ERROR_CODE,
} from "./dispatch";
import { SubscriptionRegistry } from "./subscriptions";

const noSleep = { sleep: async () => {} };

function rpcErr(code: number, name: string): Error & { code: number; errorMessage: string } {
  const e = new Error(name) as Error & { code: number; errorMessage: string };
  e.code = code;
  e.errorMessage = name;
  return e;
}

function floodErr(secs: number) {
  const e = rpcErr(420, "FLOOD_WAIT") as Error & {
    code: number;
    errorMessage: string;
    seconds: number;
  };
  e.seconds = secs;
  return e;
}

interface OpsCalls {
  sendMessage: { peer: unknown; message: string; replyTo?: number }[];
  getMessages: { peer: unknown; params: Record<string, unknown> }[];
  downloadMedia: { dest: string }[];
}

interface FakeOpsOpts {
  /** Messages `getMessages` serves (recording still happens). */
  messages?: MessageLike[];
  sendMessage?: () => Promise<{ id: number }>;
  downloadMedia?: (message: MessageLike) => Promise<number>;
}

function fakeOps(opts: FakeOpsOpts = {}): { ops: TgOps; calls: OpsCalls } {
  const calls: OpsCalls = { sendMessage: [], getMessages: [], downloadMedia: [] };
  const ops: TgOps = {
    async listDialogs() {
      return [];
    },
    async resolvePeer(chatId) {
      return `peer:${chatId}`;
    },
    async getMessages(peer, params) {
      calls.getMessages.push({ peer, params: params as Record<string, unknown> });
      return opts.messages ?? [];
    },
    async sendMessage(peer, params) {
      calls.sendMessage.push({ peer, message: params.message, replyTo: params.replyTo });
      if (opts.sendMessage !== undefined) return await opts.sendMessage();
      return { id: 555 };
    },
    async downloadMedia(message, dest) {
      calls.downloadMedia.push({ dest });
      if (opts.downloadMedia !== undefined) return await opts.downloadMedia(message);
      return 2048;
    },
  };
  return { ops, calls };
}

// ── arg_i64 ─────────────────────────────────────────────────────────────────

describe("argI64", () => {
  // Twin of tst_src_tg_argi64_001.
  test("tst_tgts_arg_001 accepts i64, f64, and a numeric string", () => {
    const big = 4_891_473_905; // a real telegram chat_id, > i32::MAX
    expect(argI64({ chat_id: big }, "chat_id")).toBe(big);
    // JS numbers are doubles: a float-encoded id must still resolve.
    expect(argI64({ chat_id: big + 0.0 }, "chat_id")).toBe(big);
    expect(argI64({ chat_id: String(big) }, "chat_id")).toBe(big);
    expect(argI64({ chat_id: " -42 " }, "chat_id")).toBe(-42);
  });

  test("tst_tgts_arg_002 rejects absent and non-numeric values", () => {
    expect(argI64({}, "chat_id")).toBeUndefined();
    expect(argI64({ chat_id: "abc" }, "chat_id")).toBeUndefined();
    expect(argI64({ chat_id: null }, "chat_id")).toBeUndefined();
    expect(argI64({ chat_id: {} }, "chat_id")).toBeUndefined();
  });
});

// ── send_message / reply ────────────────────────────────────────────────────

describe("send_message / reply", () => {
  test("tst_tgts_exec_001 send_message returns the Rust result shape", async () => {
    const { ops, calls } = fakeOps();
    const out = await execute(ops, "acct", { action: "send_message", chat_id: 111, text: "hi" }, noSleep);
    expect(out).toEqual({
      message_id: 555,
      chat_id: 111,
      text: "hi",
      schema_id: "telegram.message",
    });
    expect(calls.sendMessage).toEqual([{ peer: "peer:111", message: "hi", replyTo: undefined }]);
  });

  test("tst_tgts_exec_002 the action DEFAULTS to send_message when absent", async () => {
    const { ops } = fakeOps();
    const out = await execute(ops, "acct", { chat_id: 1, text: "x" }, noSleep);
    expect(out.schema_id).toBe("telegram.message");
  });

  test("tst_tgts_exec_003 reply threads reply_to_message_id", async () => {
    const { ops, calls } = fakeOps();
    await execute(
      ops,
      "acct",
      { action: "reply", chat_id: 1, text: "re", reply_to_message_id: "77" },
      noSleep,
    );
    expect(calls.sendMessage[0]!.replyTo).toBe(77);
  });

  test("tst_tgts_exec_004 missing chat_id / text carry the exact Rust messages", async () => {
    const { ops } = fakeOps();
    await expect(execute(ops, "a", { action: "send_message", text: "x" }, noSleep)).rejects.toThrow(
      "missing chat_id",
    );
    await expect(
      execute(ops, "a", { action: "send_message", chat_id: 1 }, noSleep),
    ).rejects.toThrow("missing text");
  });
});

// ── backfill_chat ───────────────────────────────────────────────────────────

describe("backfill_chat", () => {
  // Twin of tst_src_tg_backfill_001.
  test("tst_tgts_exec_005 has_more = returned > 0 — only an EMPTY page ends backfill", () => {
    // A short but non-empty page may still have older history behind it: Telegram
    // returns 251 for a limit of 500 mid-history. `len == limit` stopped early and
    // dropped real history.
    expect(backfillHasMore(251)).toBe(true);
    expect(backfillHasMore(500)).toBe(true);
    expect(backfillHasMore(0)).toBe(false);
  });

  test("tst_tgts_exec_006 backfill returns SNAKE_CASE keys + the oldest id", async () => {
    const msgs: MessageLike[] = [{ id: 30, date: 0 }, { id: 10, date: 0 }, { id: 20, date: 0 }];
    const { ops, calls } = fakeOps({ messages: msgs });
    const out = await execute(
      ops,
      "conn-1",
      { action: "backfill_chat", chat_id: 5, before_message_id: 40, limit: 3 },
      noSleep,
    );
    expect(out.has_more).toBe(true);
    expect(out.oldest_message_id).toBe(10); // the MIN id of the page
    expect((out.envelopes as unknown[]).length).toBe(3);
    // The page is anchored on before_message_id (exclusive) with the given limit.
    expect(calls.getMessages[0]!.params).toEqual({ offsetId: 40, limit: 3 });
  });

  test("tst_tgts_exec_007 a short non-empty page still reports has_more=true", async () => {
    const { ops } = fakeOps({ messages: [{ id: 1, date: 0 }] });
    const out = await execute(
      ops,
      "a",
      { action: "backfill_chat", chat_id: 5, limit: 50 },
      noSleep,
    );
    expect(out.has_more).toBe(true);
  });

  test("tst_tgts_exec_008 an empty page ends backfill, with a null oldest id", async () => {
    const { ops } = fakeOps({ messages: [] });
    const out = await execute(ops, "a", { action: "backfill_chat", chat_id: 5 }, noSleep);
    expect(out.has_more).toBe(false);
    expect(out.oldest_message_id).toBeNull();
    expect(out.envelopes).toEqual([]);
  });

  test("tst_tgts_exec_009 defaults: before_message_id=0, limit=50", async () => {
    const { ops, calls } = fakeOps();
    await execute(ops, "a", { action: "backfill_chat", chat_id: 5 }, noSleep);
    expect(calls.getMessages[0]!.params).toEqual({ offsetId: 0, limit: 50 });
  });

  // The Bug-2 regression: backfilled media MUST carry the real account_id.
  test("tst_tgts_exec_010 the real account_id reaches backfilled source_ref", async () => {
    const media: MessageLike = {
      id: 7,
      date: 0,
      media: { className: "MessageMediaPhoto" },
    };
    const { ops } = fakeOps({ messages: [media] });
    const out = await execute(
      ops,
      "conn-xyz",
      { action: "backfill_chat", chat_id: 100 },
      noSleep,
    );
    const env = (out.envelopes as Record<string, unknown>[])[0]!;
    const sourceRef = (env.payload as Record<string, unknown>).source_ref as Record<
      string,
      unknown
    >;
    expect(sourceRef.account_id).toBe("conn-xyz");
    expect(sourceRef.dest_subpath).toBe("telegram/photos/tg_100_7.jpg");
  });
});

// ── download_file ───────────────────────────────────────────────────────────

describe("download_file", () => {
  test("tst_tgts_exec_011 local_path is the RELATIVE dest_subpath, not the abs dest", async () => {
    const { ops, calls } = fakeOps({ messages: [{ id: 7, date: 0 }] });
    const out = await execute(
      ops,
      "a",
      {
        action: "download_file",
        source_ref: {
          chat_id: 100,
          message_id: 7,
          dest_subpath: "telegram/photos/tg_100_7.jpg",
        },
        dest: "/abs/files/telegram/photos/tg_100_7.jpg",
      },
      noSleep,
    );
    // The host joins local_path onto its files_dir, so it MUST stay relative.
    expect(out).toEqual({
      size_bytes: 2048,
      local_path: "telegram/photos/tg_100_7.jpg",
    });
    expect(calls.downloadMedia).toEqual([{ dest: "/abs/files/telegram/photos/tg_100_7.jpg" }]);
    // The message is looked up by id.
    expect(calls.getMessages[0]!.params).toEqual({ ids: [7] });
  });

  test("tst_tgts_exec_012 without dest_subpath, local_path falls back to dest", async () => {
    const { ops } = fakeOps({ messages: [{ id: 7, date: 0 }] });
    const out = await execute(
      ops,
      "a",
      { action: "download_file", source_ref: { chat_id: 1, message_id: 7 }, dest: "/tmp/x.bin" },
      noSleep,
    );
    expect(out.local_path).toBe("/tmp/x.bin");
  });

  test("tst_tgts_exec_013 download errors carry the exact Rust messages", async () => {
    const { ops } = fakeOps({ messages: [{ id: 7, date: 0 }] });
    await expect(execute(ops, "a", { action: "download_file", dest: "/x" }, noSleep)).rejects.toThrow(
      "download_file: missing source_ref",
    );
    await expect(
      execute(ops, "a", { action: "download_file", source_ref: {} }, noSleep),
    ).rejects.toThrow("missing dest");
    await expect(
      execute(ops, "a", { action: "download_file", source_ref: {}, dest: "/x" }, noSleep),
    ).rejects.toThrow("missing chat_id");
    await expect(
      execute(
        ops,
        "a",
        { action: "download_file", source_ref: { chat_id: 1 }, dest: "/x" },
        noSleep,
      ),
    ).rejects.toThrow("missing message_id");
  });

  test("tst_tgts_exec_014 a message with NO downloadable media errors", async () => {
    const { ops } = fakeOps({
      messages: [{ id: 7, date: 0 }],
      downloadMedia: async (m) => {
        throw new Error(`download_file: no downloadable media in message ${m.id}`);
      },
    });
    await expect(
      execute(
        ops,
        "a",
        { action: "download_file", source_ref: { chat_id: 1, message_id: 7 }, dest: "/x" },
        noSleep,
      ),
    ).rejects.toThrow("download_file: no downloadable media in message 7");
  });
});

describe("unknown action", () => {
  test("tst_tgts_exec_015 an unsupported action carries the exact Rust message", async () => {
    const { ops } = fakeOps();
    await expect(execute(ops, "a", { action: "weird_thing" }, noSleep)).rejects.toThrow(
      "unsupported telegram execute action 'weird_thing'",
    );
  });
});

// ── FLOOD_WAIT → the wire ───────────────────────────────────────────────────

describe("FLOOD_WAIT on the send path", () => {
  test("tst_tgts_flood_wire_001 a SHORT FloodWait retries once and the send succeeds", async () => {
    let attempts = 0;
    const slept: number[] = [];
    const { ops } = fakeOps({
      sendMessage: async () => {
        attempts += 1;
        if (attempts === 1) throw floodErr(5);
        return { id: 900 };
      },
    });
    const out = await execute(ops, "a", { chat_id: 1, text: "x" }, {
      sleep: async (s) => {
        slept.push(s);
      },
    });
    expect(out.message_id).toBe(900);
    expect(attempts).toBe(2);
    expect(slept).toEqual([5]);
  });

  test("tst_tgts_flood_wire_002 a LONG FloodWait → -32002 with data.retry_after", async () => {
    const { ops } = fakeOps({
      sendMessage: async () => {
        throw floodErr(120);
      },
    });
    const reply = (await handleMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "magnis.execute",
          arguments: { action: "send_message", chat_id: 1, text: "x" },
        },
      },
      {
        authMode: false,
        registry: new SubscriptionRegistry(),
        write: () => {},
        resolveClient: async () => ({ ops, pager: { dialogPage: async () => ({ dialogs: [], next_offset: null, total: null }) }, accountId: "a" }),
        sleep: async () => {
          throw new Error("a long FloodWait must NOT sleep");
        },
      },
    )) as Record<string, unknown>;

    const error = reply.error as Record<string, unknown>;
    expect(error.code).toBe(RATE_LIMITED_CODE);
    expect(error.code).toBe(-32002);
    // The host reads the TYPED retry_after, not the message text.
    expect(error.data).toEqual({ retry_after: 120 });
    expect(error.message).toBe("rate limited; retry after 120s");
  });
});

// ── error classification (twin of main.rs tests) ────────────────────────────

describe("error classification", () => {
  // Twin of tst_src_tg_001.
  test("tst_tgts_class_001 an RPC 401 is classified AUTH_REQUIRED (-32001)", () => {
    const [code, message] = classifyToolError(rpcErr(401, "AUTH_KEY_UNREGISTERED"));
    expect(code).toBe(AUTH_REQUIRED_CODE);
    expect(code).toBe(-32001);
    expect(message).toContain("AUTH_KEY_UNREGISTERED");
  });

  // Twin of tst_src_tg_002.
  test("tst_tgts_class_002 non-auth errors keep the generic code (-32601)", () => {
    expect(classifyToolError(rpcErr(420, "FLOOD_WAIT"))[0]).toBe(TOOL_ERROR_CODE);
    expect(classifyToolError(new Error("some parse failure"))[0]).toBe(TOOL_ERROR_CODE);
    expect(TOOL_ERROR_CODE).toBe(-32601);
  });

  // Twin of tst_src_tg_024.
  test("tst_tgts_class_003 the RATE_LIMITED sentinel → -32002 + retry_after", () => {
    const [code, message] = classifyToolError(new Error("RATE_LIMITED:120"));
    expect(code).toBe(RATE_LIMITED_CODE);
    expect(toolErrorReply(code, message)).toEqual({
      code: -32002,
      message: "rate limited; retry after 120s",
      data: { retry_after: 120 },
    });
  });

  test("tst_tgts_class_004 a plain error reply carries NO data field", () => {
    const reply = toolErrorReply(TOOL_ERROR_CODE, "missing required arg 'chat_id'");
    expect(reply).toEqual({ code: -32601, message: "missing required arg 'chat_id'" });
    expect("data" in reply).toBe(false);
  });

  // The BOOTSTRAP path: gramjs throws a RAW FloodWaitError (code 420, .seconds) out
  // of getDialogs/getMessages — it never passes through the send-path sentinel
  // wrapper. It must STILL surface as -32002 + retry_after, so a long flood during
  // bootstrap makes the host back off instead of showing a frozen "bootstrapping".
  test("tst_tgts_class_005 a RAW gramjs FloodWait (with .seconds) → -32002 + retry_after", () => {
    const [code, message] = classifyToolError(floodErr(120));
    expect(code).toBe(RATE_LIMITED_CODE);
    expect(code).toBe(-32002);
    expect(toolErrorReply(code, message)).toEqual({
      code: -32002,
      message: "rate limited; retry after 120s",
      data: { retry_after: 120 },
    });
  });
});
