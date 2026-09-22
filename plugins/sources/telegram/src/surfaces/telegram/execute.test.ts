// Telegram actions, bounded fetch and shared SDK error mapping.

import { describe, expect, spyOn, test } from "bun:test";
import { handleMessage, RATE_LIMIT_CODE } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "../../connector";
import { argI64, execute, fetch, type TgOps } from "./commands";
import type { MessageLike } from "../../client";

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

const emptyPager = {
  dialogPage: async () => ({ dialogs: [], next_offset: null, total: null }),
};

async function connectorReply(
  ops: TgOps,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await handleMessage(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "magnis.execute", arguments: args },
    },
    buildConnectorConfig({
      resolveClient: async () => ({ ops, pager: emptyPager, accountId: "acct" }),
      sleep: async () => {
        throw new Error("a FloodWait must NOT sleep");
      },
    }),
  );
  return reply as Record<string, unknown>;
}

async function fetchGapPage(
  ops: TgOps,
  accountId: string,
  scopeId: string,
  start: number,
  end: number,
  messageCount = end,
): Promise<Record<string, unknown>> {
  const chatId = Number(scopeId);
  return await fetch(ops, emptyPager, accountId, {
    surface: "telegram",
    direction: "backward",
    scope_id: scopeId,
    target: { kind: "gap", start, end },
    forward_checkpoint: {
      takeout: { id: "1", phase: "download", ranges: [{ min_id: start, max_id: end }],
        range_index: 1, range_started: false, dialog_offset: null, pinned_count: 0,
        publish_index: 1, download_index: 1 },
      chats: { [scopeId]: { chat: { chat_id: chatId, title: `Chat ${scopeId}`, chat_type: "private",
        is_pinned: false, pin_order: 0, unread_count: 0, unread_mark: false,
        read_inbox_max_id: 0, read_outbox_max_id: 0, unread_mentions_count: 0,
        top_message: end, message_count: messageCount }, peer: { ty: "chat", id: chatId },
        message_count: messageCount, ranges: [0], last_msg_id: end } },
    },
  });
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

  test("tst_tgts_exec_demo_001 local demo dry-run never calls Telegram sendMessage", async () => {
    const { ops, calls } = fakeOps();

    const out = await execute(
      ops,
      "acct",
      { action: "send_message", chat_id: 111, text: "demo" },
      { ...noSleep, demoDryRun: true },
    );

    expect(out).toEqual({
      chat_id: 111,
      text: "demo",
      delivered: false,
      demo_dry_run: true,
      suppressed_by: "MAGNIS_TELEGRAM_DEMO_DRY_RUN",
    });
    expect(calls.sendMessage).toEqual([]);
  });

  test("tst_tgts_exec_demo_002 dispatch honors the demo flag and reports non-delivery", async () => {
    const previous = process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN;
    process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN = "1";
    const { ops, calls } = fakeOps();
    try {
      const reply = await handleMessage(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "magnis.execute",
            arguments: { action: "send_message", chat_id: 111, text: "demo" },
          },
        },
        buildConnectorConfig({
          resolveClient: async () => ({
            ops,
            pager: emptyPager,
            accountId: "acct",
          }),
        }),
      );

      expect(reply?.result).toEqual({
        chat_id: 111,
        text: "demo",
        delivered: false,
        demo_dry_run: true,
        suppressed_by: "MAGNIS_TELEGRAM_DEMO_DRY_RUN",
      });
      expect(calls.sendMessage).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN;
      else process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN = previous;
    }
  });

  test("tst_tgts_exec_demo_003 dispatch sends normally when the demo flag is absent", async () => {
    const previous = process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN;
    delete process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN;
    const { ops, calls } = fakeOps();
    try {
      const reply = await handleMessage(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "magnis.execute",
            arguments: { action: "send_message", chat_id: 222, text: "live" },
          },
        },
        buildConnectorConfig({
          resolveClient: async () => ({
            ops,
            pager: emptyPager,
            accountId: "acct",
          }),
        }),
      );

      expect(reply?.result).toEqual({
        message_id: 555,
        chat_id: 222,
        text: "live",
        schema_id: "telegram.message",
      });
      expect(calls.sendMessage).toEqual([
        { peer: "peer:222", message: "live", replyTo: undefined },
      ]);
    } finally {
      if (previous === undefined) delete process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN;
      else process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN = previous;
    }
  });
});

// ── bounded gap fetch ───────────────────────────────────────────────────────

describe("bounded gap fetch", () => {
  test("tst_tgts_exec_005 a short provider page continues until exhaustion", async () => {
    const calls: Record<string, unknown>[] = [];
    const base = fakeOps().ops;
    const pages: MessageLike[][] = [[{ id: 30, date: 0 }], []];
    const ops: TgOps = {
      ...base,
      async getMessages(_peer, params) {
        calls.push(params as Record<string, unknown>);
        return pages.shift() ?? [];
      },
    };
    const out = await fetchGapPage(ops, "acct", "5", 1, 39);
    expect(out.progress).toMatchObject({ kind: "completeTarget" });
    expect(calls).toHaveLength(1);
    expect(out.traversed).toEqual({ "5": [1, 39] });
  });

  test("tst_tgts_exec_006 gap fetch uses standard result keys and exact coverage", async () => {
    const msgs: MessageLike[] = [{ id: 30, date: 0 }, { id: 20, date: 0 }, { id: 10, date: 0 }];
    const { ops, calls } = fakeOps({ messages: msgs });
    const out = await fetchGapPage(ops, "conn-1", "5", 10, 39);
    expect(out.progress).toMatchObject({ kind: "completeTarget" });
    expect(out).not.toHaveProperty("nextCursor");
    expect(out.traversed).toEqual({ "5": [10, 39] });
    expect((out.envelopes as unknown[]).length).toBe(3);
    expect(calls.getMessages[0]!.params).toMatchObject({ offsetId: 40, limit: 100 });
  });

  test("tst_tgts_exec_007 reaching the requested lower message completes the target", async () => {
    const { ops } = fakeOps({ messages: [{ id: 1, date: 0 }] });
    const out = await fetchGapPage(ops, "a", "5", 1, 1);
    expect(out.progress).toMatchObject({ kind: "completeTarget" });
    expect(out.traversed).toEqual({ "5": [1, 1] });
  });

  test("tst_tgts_exec_008 an empty page completes the whole asked gap", async () => {
    const { ops } = fakeOps({ messages: [] });
    const out = await fetchGapPage(ops, "a", "5", 1, 99);
    expect(out.progress).toMatchObject({ kind: "completeTarget" });
    expect(out).not.toHaveProperty("nextCursor");
    expect(out.envelopes).toEqual([]);
    expect(out.traversed).toEqual({ "5": [1, 99] });
  });

  test("tst_tgts_exec_009 starts immediately above the asked gap", async () => {
    const { ops, calls } = fakeOps();
    await fetchGapPage(ops, "a", "5", 1, 99);
    expect(calls.getMessages[0]!.params).toMatchObject({ offsetId: 100, limit: 100 });
  });

  /**
   * @test-id: tst_src_tgfast_007
   * @scenario: scn_tg_backfill_budget_001
   * @covers: plugins/sources/telegram/src/surfaces/telegram/commands.ts::fetch
   * @deterministic: yes; performance clock is fixed and Telegram pages are scripted
   * @fixtures: three in-memory provider pages of 100, 100, and 50 messages
   *
   * Test environment: Telegram Source fetch handler
   * Clients: direct calls
   * Mocks: scripted TgOps
   * Data: message ids 250 through 1
   */
  test("tst_src_tgfast_007 bounded fetch joins provider pages without a message count limit", async () => {
    const calls: Record<string, unknown>[] = [];
    const base = fakeOps().ops;
    const ops: TgOps = {
      ...base,
      async getMessages(_peer, params) {
        calls.push(params as Record<string, unknown>);
        const before = params.offsetId ?? 0;
        const upper = before - 1;
        const messages = Array.from(
          { length: Math.min(100, upper) },
          (_, index): MessageLike => ({ id: upper - index, date: 0 }),
        ) as MessageLike[] & { total?: number };
        messages.total = 250;
        return messages;
      },
    };
    const now = spyOn(performance, "now").mockReturnValue(0);
    try {
      const out = await fetchGapPage(ops, "a", "5", 1, 250);
      expect((out.envelopes as unknown[]).length).toBe(250);
      expect(out.progress).toMatchObject({ kind: "completeTarget" });
      expect(out.traversed).toEqual({ "5": [1, 250] });
      expect(calls.map((call) => call.offsetId)).toEqual([251, 151, 51]);
      expect(calls.every((call) => call.limit === 100)).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  test("tst_tgts_exec_010 the real account_id reaches fetched source_ref", async () => {
    const media: MessageLike = {
      id: 7,
      date: 0,
      media: { className: "MessageMediaPhoto" },
    };
    const { ops } = fakeOps({ messages: [media] });
    const out = await fetchGapPage(ops, "conn-xyz", "100", 7, 7);
    const env = (out.envelopes as Record<string, unknown>[])[0]!;
    const sourceRef = (env.payload as Record<string, unknown>).source_ref as Record<
      string,
      unknown
    >;
    expect(sourceRef.account_id).toBe("conn-xyz");
    expect(sourceRef.dest_subpath).toBe("telegram/photos/tg_100_7.jpg");
  });

  test("tst_tgts_exec_016 bounded fetch exposes the provider message total", async () => {
    const messages = Object.assign([{ id: 7, date: 0 }], { total: 137 });
    const { ops } = fakeOps({ messages });

    const out = await fetchGapPage(ops, "conn-xyz", "100", 7, 7, 137);

    expect(out.total).toBe(137);
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
  /** @test-id: tst_tgts_flood_wire_001
   * @scenario: scn_tgflood_002
   * @covers: TGFLOOD_005; public execute does not resend a flooded action
   * @deterministic: yes
   * @fixtures: existing fakeOps with synthetic provider failure
   */
  test("tst_tgts_flood_wire_001 a SHORT FloodWait fails without sleeping or resending", async () => {
    let attempts = 0;
    const slept: number[] = [];
    const { ops } = fakeOps({
      sendMessage: async () => {
        attempts += 1;
        if (attempts === 1) throw floodErr(5);
        return { id: 900 };
      },
    });
    await expect(execute(ops, "a", { chat_id: 1, text: "x" }, {
      sleep: async (s) => {
        slept.push(s);
      },
    })).rejects.toThrow("RATE_LIMITED:5");
    expect(attempts).toBe(1);
    expect(slept).toEqual([]);
  });

  test("tst_tgts_flood_wire_002 short and long send/reply waits → -32002 with data.retry_after", async () => {
    for (const seconds of [4, 120, 3600]) for (const action of ["send_message", "reply"]) {
      const { ops, calls } = fakeOps({
        sendMessage: async () => {
          throw floodErr(seconds);
        },
      });
      const reply = await connectorReply(ops, {
        action, chat_id: 1, text: "x", reply_to_message_id: 77,
      });

      const error = reply.error as Record<string, unknown>;
      expect(error.code).toBe(RATE_LIMIT_CODE);
      expect(error.code).toBe(-32002);
      // The host reads the TYPED retry_after, not the message text.
      expect(error.data).toEqual({ retry_after: seconds });
      expect(error.message).toBe(`rate limited; retry_after=${String(seconds)}`);
      expect(calls.sendMessage).toHaveLength(1);
    }
  });
});

// ── shared SDK error classification ─────────────────────────────────────────

describe("error classification", () => {
  test("tst_tgts_class_001 an RPC 401 is classified AUTH_REQUIRED (-32001)", async () => {
    const { ops } = fakeOps({ sendMessage: async () => { throw rpcErr(401, "AUTH_KEY_UNREGISTERED"); } });
    const reply = await connectorReply(ops, { action: "send_message", chat_id: 1, text: "x" });
    expect(reply.error).toMatchObject({
      code: -32001,
      message: "AUTH_KEY_UNREGISTERED",
      data: { kind: "auth", message: "AUTH_KEY_UNREGISTERED" },
    });
  });

  test("tst_tgts_class_002 non-auth errors use the SDK generic code", async () => {
    const { ops } = fakeOps({ sendMessage: async () => { throw new Error("some parse failure"); } });
    const reply = await connectorReply(ops, { action: "send_message", chat_id: 1, text: "x" });
    expect(reply.error).toEqual({ code: -32000, message: "some parse failure" });
  });

  test("tst_tgts_class_003 the RATE_LIMITED sentinel → -32002 + retry_after", async () => {
    const { ops } = fakeOps({ sendMessage: async () => { throw new Error("RATE_LIMITED:120"); } });
    const reply = await connectorReply(ops, { action: "send_message", chat_id: 1, text: "x" });
    expect(reply.error).toEqual({
      code: -32002,
      message: "rate limited; retry_after=120",
      data: { retry_after: 120 },
    });
  });

  test("tst_tgts_class_004 a plain error reply carries NO data field", async () => {
    const { ops } = fakeOps({ sendMessage: async () => { throw new Error("missing required arg 'chat_id'"); } });
    const reply = await connectorReply(ops, { action: "send_message", chat_id: 1, text: "x" });
    expect(reply.error).toEqual({ code: -32000, message: "missing required arg 'chat_id'" });
    expect("data" in (reply.error as Record<string, unknown>)).toBe(false);
  });

  // The BOOTSTRAP path: gramjs throws a RAW FloodWaitError (code 420, .seconds) out
  // of getDialogs/getMessages — it never passes through the send-path sentinel
  // wrapper. It must STILL surface as -32002 + retry_after, so a long flood during
  // bootstrap makes the host back off instead of showing a frozen "bootstrapping".
  test("tst_tgts_class_005 a RAW gramjs FloodWait (with .seconds) → -32002 + retry_after", async () => {
    const { ops } = fakeOps({ sendMessage: async () => { throw floodErr(120); } });
    const reply = await connectorReply(ops, { action: "send_message", chat_id: 1, text: "x" });
    expect(reply.error).toEqual({
      code: -32002,
      message: "rate limited; retry_after=120",
      data: { retry_after: 120 },
    });
  });
});
