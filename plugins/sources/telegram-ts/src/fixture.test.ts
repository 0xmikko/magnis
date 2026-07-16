// Fixture-mode + wire end-to-end tests — the TS mirror of the Rust
// plugins/sources/telegram/src/fixture.rs `mod tests` plus the main.rs wire
// (mode gate, listen_start/listen_stop, capabilities). Everything is driven
// through the REAL dispatcher; no network, no gramjs.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleMessage, type DispatchDeps } from "./dispatch";
import { SubscriptionRegistry, notificationLine } from "./subscriptions";

const FIXTURE_DOC = {
  chats: [
    { chat_id: 5, title: "C", type: "private" },
    { chat_id: 6, title: "Group", type: "group", is_pinned: true, member_count: 3 },
  ],
  messages: [
    { message_id: 10, chat_id: 5, text: "old", date: "2026-01-01T00:00:00+00:00" },
    { message_id: 20, chat_id: 5, text: "new", date: "2026-01-02T00:00:00+00:00" },
    { message_id: 30, chat_id: 6, text: "grp", date: "2026-01-03T00:00:00+00:00" },
    // A live arrival: pushed by the listener, NEVER served by fetch.
    { message_id: 99, chat_id: 5, text: "live!", date: "2026-01-04T00:00:00+00:00", live: true },
  ],
};

function withFixture(doc: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "tgts-fixture-"));
  const path = join(dir, "telegram-fixture.json");
  writeFileSync(path, typeof doc === "string" ? doc : JSON.stringify(doc));
  process.env.TELEGRAM_FIXTURE_FILE = path;
  return path;
}

afterEach(() => {
  delete process.env.TELEGRAM_FIXTURE_FILE;
});

function deps(over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    authMode: false,
    registry: new SubscriptionRegistry(),
    write: () => {},
    resolveClient: async () => {
      throw new Error("fixture mode must not resolve a live client");
    },
    ...over,
  };
}

async function call(
  name: string,
  args: Record<string, unknown>,
  d: DispatchDeps = deps(),
): Promise<Record<string, unknown>> {
  const reply = await handleMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    d,
  );
  return reply as Record<string, unknown>;
}

const envIds = (r: Record<string, unknown>): unknown[] =>
  ((r.result as Record<string, unknown>).envelopes as Record<string, unknown>[]).map(
    (e) => e.remote_id,
  );

// ── fixture fetch ───────────────────────────────────────────────────────────

describe("fixture fetch", () => {
  test("tst_tgts_fx_001 backward serves chat-then-its-messages, one page, no counters", async () => {
    withFixture(FIXTURE_DOC);
    const r = await call("magnis.sync.fetch", { direction: "backward" });
    const result = r.result as Record<string, unknown>;

    // Interleaved: each chat, then ITS messages. The `live` message is EXCLUDED.
    expect(envIds(r)).toEqual(["tg:chat:5", "tg:msg:5:10", "tg:msg:5:20", "tg:chat:6", "tg:msg:6:30"]);
    expect(result.hasMore).toBe(false);
    // A fixture page carries NO total/discovered keys (Rust parity).
    expect("total" in result).toBe(false);
    expect("discovered" in result).toBe(false);
    // The cursor is the per-chat watermark.
    expect((result.nextCursor as Record<string, unknown>).chats).toEqual({
      "5": { last_msg_id: 20 },
      "6": { last_msg_id: 30 },
    });
  });

  test("tst_tgts_fx_002 a live:true message is NEVER served by fetch", async () => {
    withFixture(FIXTURE_DOC);
    expect(envIds(await call("magnis.sync.fetch", {}))).not.toContain("tg:msg:5:99");
  });

  // Twin of tst_conn_telegram_fix_002.
  test("tst_tgts_fx_003 forward drops messages at/below the per-chat cursor", async () => {
    withFixture(FIXTURE_DOC);
    const r = await call("magnis.sync.fetch", {
      direction: "forward",
      cursor: { chats: { "5": { last_msg_id: 10 } } },
    });
    // Chat 5 keeps only message 20; chat 6 (no cursor entry) keeps everything.
    expect(envIds(r)).toEqual(["tg:chat:5", "tg:msg:5:20", "tg:chat:6", "tg:msg:6:30"]);
  });

  test("tst_tgts_fx_004 fixture mode needs NO _meta at all (checked before creds)", async () => {
    withFixture(FIXTURE_DOC);
    // No _meta, and resolveClient throws if reached — yet fetch succeeds.
    const r = await call("magnis.sync.fetch", {});
    expect(r.error).toBeUndefined();
    expect((r.result as Record<string, unknown>).hasMore).toBe(false);
  });

  test("tst_tgts_fx_005 the fixture runs the SAME builders (payload parity)", async () => {
    withFixture({
      chats: [{ chat_id: 6, title: "Group", type: "group", is_pinned: true, member_count: 3 }],
      messages: [
        {
          message_id: 30,
          chat_id: 6,
          text: "grp",
          date: "2026-01-03T00:00:00+00:00",
          media_type: "photo",
          account_id: "acct-1",
        },
      ],
    });
    const envs = (
      (await call("magnis.sync.fetch", {})).result as Record<string, unknown>
    ).envelopes as Record<string, unknown>[];

    expect((envs[0]!.payload as Record<string, unknown>).entity_type).toBe("telegram_chat");
    expect((envs[0]!.payload as Record<string, unknown>).member_count).toBe(3);
    // `has_media` defaults to TRUE, so media_type alone yields a full source_ref.
    const msg = envs[1]!.payload as Record<string, unknown>;
    expect(msg.source_ref).toEqual({
      account_id: "acct-1",
      chat_id: 6,
      message_id: 30,
      media_type: "photo",
      dest_subpath: "telegram/photos/tg_6_30.jpg",
    });
    expect(envs[1]!.cursor).toEqual({ chat_id: 6, message_id: 30 });
  });

  test("tst_tgts_fx_006 orphan messages (no chat entry) are still served", async () => {
    withFixture({
      messages: [{ message_id: 7, chat_id: 42, text: "orphan", date: "2026-01-01T00:00:00+00:00" }],
    });
    const r = await call("magnis.sync.fetch", {});
    expect(envIds(r)).toEqual(["tg:msg:42:7"]);
    expect(((r.result as Record<string, unknown>).nextCursor as Record<string, unknown>).chats).toEqual({
      "42": { last_msg_id: 7 },
    });
  });

  test("tst_tgts_fx_007 a missing/malformed fixture yields empty — NEVER an error", async () => {
    process.env.TELEGRAM_FIXTURE_FILE = "/nonexistent/telegram-fixture.json";
    let r = await call("magnis.sync.fetch", {});
    expect(r.error).toBeUndefined();
    expect((r.result as Record<string, unknown>).envelopes).toEqual([]);
    expect((r.result as Record<string, unknown>).nextCursor).toBeNull();

    withFixture("{not json");
    r = await call("magnis.sync.fetch", {});
    expect(r.error).toBeUndefined();
    expect((r.result as Record<string, unknown>).envelopes).toEqual([]);
  });
});

// ── fixture execute ─────────────────────────────────────────────────────────

describe("fixture execute", () => {
  // Twin of tst_conn_telegram_fix_001.
  test("tst_tgts_fx_008 send_message is echoed with a NEGATIVE synthetic id", async () => {
    withFixture(FIXTURE_DOC);
    const out = (await call("magnis.execute", { action: "send_message", chat_id: 111, text: "hi" }))
      .result as Record<string, unknown>;
    expect(out.action).toBe("send_message");
    expect(out.recorded).toBe(true);
    expect(out.chat_id).toBe(111);
    expect(out.text).toBe("hi");
    expect(out.schema_id).toBe("telegram.message");
    // Negative so it never collides with a real Telegram message id.
    expect(out.message_id).toBeLessThan(0);
  });

  test("tst_tgts_fx_009 backfill / download / unknown actions are recorded", async () => {
    withFixture(FIXTURE_DOC);
    expect((await call("magnis.execute", { action: "backfill_chat", chat_id: 5 })).result).toEqual({
      envelopes: [],
      recorded: true,
      action: "backfill_chat",
    });
    expect(
      (await call("magnis.execute", { action: "download_file", dest: "/tmp/never.bin" })).result,
    ).toEqual({ local_path: "/tmp/never.bin", size_bytes: 0, recorded: true, action: "download_file" });
    expect((await call("magnis.execute", { action: "weird_thing" })).result).toEqual({
      recorded: true,
      action: "weird_thing",
    });
  });
});

// ── fixture listener ────────────────────────────────────────────────────────

describe("fixture listener", () => {
  test("tst_tgts_fx_010 listen_start replays live messages with the EXACT push params", async () => {
    withFixture(FIXTURE_DOC);
    const lines: string[] = [];
    const d = deps({ write: (l) => lines.push(l) });

    const ack = await call("listen_start", { subscription_id: "sub:1", _meta: { account_id: "acct-1" } }, d);
    expect(ack.result).toEqual({ ok: true, subscription_id: "sub:1" });

    // The replay is finite; let it drain.
    await new Promise((r) => setTimeout(r, 10));
    expect(lines).toHaveLength(1); // ONLY the live:true message
    const msg = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(msg.method).toBe("notifications/magnis/envelope");
    // EXACT param shape: NO surface, NO kind, NO cursor.
    const params = msg.params as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual([
      "account_id",
      "payload",
      "remote_id",
      "subscription_id",
    ]);
    expect(params.subscription_id).toBe("sub:1");
    expect(params.account_id).toBe("acct-1");
    expect(params.remote_id).toBe("tg:msg:5:99");
    expect((params.payload as Record<string, unknown>).text).toBe("live!");
  });

  test("tst_tgts_fx_011 the notification line is a bare payload+remote_id envelope", () => {
    const line = JSON.parse(notificationLine("s1", "a1", { k: 1 }, "tg:msg:1:2")) as Record<
      string,
      unknown
    >;
    expect(line).toEqual({
      jsonrpc: "2.0",
      method: "notifications/magnis/envelope",
      params: { subscription_id: "s1", account_id: "a1", payload: { k: 1 }, remote_id: "tg:msg:1:2" },
    });
  });
});

// ── wire: listen_start / listen_stop ────────────────────────────────────────

describe("wire: subscriptions", () => {
  test("tst_tgts_wire_001 listen_start REQUIRES subscription_id (-32602)", async () => {
    withFixture(FIXTURE_DOC);
    for (const args of [{}, { subscription_id: "" }]) {
      const r = await call("listen_start", args);
      expect(r.error).toEqual({
        code: -32602,
        message: "missing required arg 'subscription_id'",
      });
    }
  });

  test("tst_tgts_wire_002 listen_start surfaces a bad _meta as -32602", async () => {
    withFixture(FIXTURE_DOC);
    // account_id is required even in fixture mode (it stamps the notifications).
    const r = await call("listen_start", { subscription_id: "s1" });
    expect((r.error as Record<string, unknown>).code).toBe(-32602);
    expect((r.error as Record<string, unknown>).message).toBe("missing required _meta.account_id");
  });

  // scn_tgts_wire_012 — REGRESSION (found by scripts/diff-connectors.ts): the
  // listener must NOT emit a push before its caller has written the listen ack.
  // The Rust oracle gets this ordering from subscriptions.rs:233
  // `tokio::spawn(async move { … })` — the replay is handed to the scheduler, so
  // main.rs:318 writes `{ok, subscription_id}` FIRST. The TS listener used a bare
  // async IIFE, whose body runs SYNCHRONOUSLY until its first await, so the first
  // notification hit the wire BEFORE the ack — and the host routes a push by
  // subscription_id, which it had not yet been told about.
  test("tst_tgts_wire_012 fixture listener pushes only AFTER the listen ack", async () => {
    withFixture(FIXTURE_DOC);
    const frames: string[] = [];
    const d = deps({ write: () => frames.push("push") });

    const reply = await call("listen_start", { subscription_id: "s1", _meta: { account_id: "a" } }, d);
    // At the moment the dispatcher hands the ack back, NOTHING may be on the wire.
    expect(frames).toEqual([]);
    frames.push("ack");
    expect(reply.result).toEqual({ ok: true, subscription_id: "s1" });

    // Let the deferred replay run: the push must land AFTER the ack.
    await new Promise((res) => setTimeout(res, 50));
    expect(frames).toEqual(["ack", "push"]);
  });

  test("tst_tgts_wire_003 listen_start is idempotent by subscription_id", async () => {
    withFixture(FIXTURE_DOC);
    const d = deps();
    const args = { subscription_id: "s1", _meta: { account_id: "a" } };
    expect((await call("listen_start", args, d)).result).toEqual({ ok: true, subscription_id: "s1" });
    expect((await call("listen_start", args, d)).result).toEqual({ ok: true, subscription_id: "s1" });
    expect(d.registry.size()).toBe(1); // a duplicate start must NOT spawn twice
  });

  test("tst_tgts_wire_004 listen_stop ALWAYS oks, reporting cancelled", async () => {
    withFixture(FIXTURE_DOC);
    const d = deps();
    await call("listen_start", { subscription_id: "s1", _meta: { account_id: "a" } }, d);
    await call("listen_start", { subscription_id: "s2", _meta: { account_id: "a" } }, d);

    expect((await call("listen_stop", { subscription_id: "s1" }, d)).result).toEqual({
      ok: true,
      subscription_id: "s1",
      cancelled: true,
    });
    // s2 is UNAFFECTED by s1's stop.
    expect(d.registry.size()).toBe(1);

    // An unknown / empty id never errors — it reports cancelled:false.
    expect((await call("listen_stop", { subscription_id: "never" }, d)).result).toEqual({
      ok: true,
      subscription_id: "never",
      cancelled: false,
    });
    expect((await call("listen_stop", {}, d)).result).toEqual({
      ok: true,
      subscription_id: "",
      cancelled: false,
    });
  });

  test("tst_tgts_wire_005 legacy magnis.sync.listen derives sub:{account_id}", async () => {
    withFixture(FIXTURE_DOC);
    expect((await call("magnis.sync.listen", { _meta: { account_id: "acct-9" } })).result).toEqual({
      ok: true,
      subscription_id: "sub:acct-9",
    });
    // With no usable account_id it falls back to the legacy id.
    const d = deps();
    const r = await call("magnis.sync.listen", {}, d);
    // …but the registry still requires account_id, so the build fails as -32602.
    expect((r.error as Record<string, unknown>).code).toBe(-32602);
  });
});

// ── wire: mode gate, initialize, tools/list ─────────────────────────────────

describe("wire: mode gate", () => {
  test("tst_tgts_wire_006 a SYNC spawn refuses magnis.auth.*", async () => {
    const r = await call("magnis.auth.begin", {}, deps({ authMode: false }));
    expect(r.error).toEqual({
      code: -32601,
      message: "tool 'magnis.auth.begin' is not available in sync mode",
    });
  });

  test("tst_tgts_wire_007 an AUTH spawn serves ONLY magnis.auth.*", async () => {
    const d = deps({ authMode: true });
    for (const name of ["magnis.sync.fetch", "magnis.execute", "listen_start"]) {
      const r = await call(name, {}, d);
      expect(r.error).toEqual({
        code: -32601,
        message: `tool '${name}' is not available in auth mode`,
      });
    }
    // …and an auth tool DOES reach its handler there (errors on its inputs, not the gate).
    const auth = await call("magnis.auth.step", { _meta: {} }, d);
    expect((auth.error as Record<string, unknown>).code).toBe(-32000);
    expect((auth.error as Record<string, unknown>).message).toBe(
      "no telegram login in progress (call begin first)",
    );
  });

  test("tst_tgts_wire_008 an unknown tool is -32601", async () => {
    const r = await call("bogus.tool", {});
    expect(r.error).toEqual({ code: -32601, message: "unknown tool bogus.tool" });
  });
});

describe("wire: initialize / tools/list", () => {
  test("tst_tgts_wire_009 initialize advertises the push surface with NO interval_secs", async () => {
    const reply = (await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      deps(),
    )) as Record<string, unknown>;
    const result = reply.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.serverInfo).toEqual({ name: "magnis-telegram-ts", version: "1.0.0" });
    expect(result.capabilities).toEqual({
      tools: {},
      experimental: { magnis: { sync: { surfaces: ["telegram"], mode: "push" } } },
    });
    // Telegram is PUSH: the capabilities must carry no interval_secs key at all.
    const sync = (
      ((result.capabilities as Record<string, unknown>).experimental as Record<string, unknown>)
        .magnis as Record<string, unknown>
    ).sync as Record<string, unknown>;
    expect("interval_secs" in sync).toBe(false);
  });

  test("tst_tgts_wire_010 a message with no id gets NO reply (notification)", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", method: "initialize" }, deps())).toBeNull();
  });

  test("tst_tgts_wire_011 tools/list advertises no opinionated tools (skipped)", async () => {
    const reply = (await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      deps(),
    )) as Record<string, unknown>;
    expect(reply.result).toEqual({ tools: [] });
  });
});

// ── wire: live-mode credential errors ───────────────────────────────────────

describe("wire: live-mode credential errors (no fixture)", () => {
  test("tst_tgts_wire_012 missing _meta / credentials surface as -32601 with exact text", async () => {
    // NO fixture set → the live path parses credentials.
    const d: DispatchDeps = {
      authMode: false,
      registry: new SubscriptionRegistry(),
      write: () => {},
    };
    const noMeta = await call("magnis.sync.fetch", {}, d);
    expect(noMeta.error).toEqual({
      code: -32601,
      message: "missing _meta with Telegram credentials",
    });

    const partial = await call(
      "magnis.sync.fetch",
      { _meta: { api_id: 1, api_hash: "h", account_id: "a" } },
      d,
    );
    expect(partial.error).toEqual({
      code: -32601,
      message: "missing credential 'session' in _meta",
    });

    const noAccount = await call(
      "magnis.sync.fetch",
      { _meta: { api_id: 1, api_hash: "h", session: "s" } },
      d,
    );
    expect(noAccount.error).toEqual({ code: -32601, message: "missing required _meta.account_id" });
  });
});
