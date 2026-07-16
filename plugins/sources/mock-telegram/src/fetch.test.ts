import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchMockTelegram } from "./fetch";
import { buildChat, buildMessage, chatRemoteId, messageRemoteId } from "./envelope";
import { handleHttp, injectChat, injectMessage, status } from "./http";
import { appendItem, readItems } from "./store";

// Wire-parity suite for the TS mock-telegram: the assertions mirror the Rust
// connector's own e2e (tst_conn_mocktelegram_001/002) plus the payload shapes
// the Rust `build_chat` / `build_message` produced.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mocktg-"));
  process.env.MOCK_INJECT_FILE = join(dir, "inject.jsonl");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MOCK_INJECT_FILE;
});

function seed(): void {
  const chat = {
    surface: "telegram",
    payload: {
      entity_type: "telegram_chat",
      chat_id: 111,
      title: "Project X",
      type: "group",
      is_pinned: false,
      unread_count: 2,
      top_message: 42,
    },
    remote_id: "tg:chat:111",
    kind: "snapshot",
  };
  const message = {
    surface: "telegram",
    payload: {
      message_id: 42,
      chat_id: 111,
      text: "Hello world",
      date: "2026-05-20T10:00:00+00:00",
      is_outgoing: false,
      sender_name: "Alice",
      sender_id: 222,
    },
    remote_id: "tg:msg:111:42",
    kind: "live",
  };
  writeFileSync(
    process.env.MOCK_INJECT_FILE!,
    `${JSON.stringify(chat)}\n${JSON.stringify(message)}\n`,
  );
}

describe("mock-telegram fetch", () => {
  // tst_conn_mocktelegram_ts_001 — twin of the Rust tst_conn_mocktelegram_001:
  // chats replay as snapshot (no trigger), messages as live (trigger.check).
  test("tst_conn_mocktelegram_ts_001 serves chat (snapshot) + message (live)", async () => {
    seed();
    const out = await fetchMockTelegram({ surface: "telegram", cursor: 0 });
    expect(out.envelopes).toHaveLength(2);

    const chat = out.envelopes[0]!;
    expect(chat.payload.entity_type).toBe("telegram_chat");
    expect(chat.payload.chat_id).toBe(111);
    expect(chat.payload.title).toBe("Project X");
    expect(chat.remote_id).toBe("tg:chat:111");
    expect(chat.kind).toBe("snapshot");

    const msg = out.envelopes[1]!;
    expect(msg.payload.message_id).toBe(42);
    expect(msg.payload.text).toBe("Hello world");
    expect(msg.payload.sender_name).toBe("Alice");
    expect(msg.remote_id).toBe("tg:msg:111:42");
    expect(msg.kind).toBe("live");

    expect(out.nextCursor).toBe(2);
    expect(out.hasMore).toBe(false);
  });

  test("tst_conn_mocktelegram_ts_002 cursor skips consumed items", async () => {
    seed();
    const out = await fetchMockTelegram({ surface: "telegram", cursor: 2 });
    expect(out.envelopes).toHaveLength(0);
    expect(out.nextCursor).toBe(2);
  });

  test("tst_conn_mocktelegram_ts_003 a stored item with no kind replays as live", async () => {
    writeFileSync(
      process.env.MOCK_INJECT_FILE!,
      JSON.stringify({ surface: "telegram", payload: { message_id: 1 }, remote_id: "r" }) + "\n",
    );
    const out = await fetchMockTelegram({ surface: "telegram" });
    expect(out.envelopes[0]!.kind).toBe("live");
  });

  test("tst_conn_mocktelegram_ts_004 missing file ⇒ empty page", async () => {
    const out = await fetchMockTelegram({ surface: "telegram", cursor: 0 });
    expect(out.envelopes).toHaveLength(0);
    expect(out.nextCursor).toBe(0);
  });

  test("tst_conn_mocktelegram_ts_005 MOCK_INJECT_FILE is required (no fallback)", () => {
    delete process.env.MOCK_INJECT_FILE;
    expect(() => readItems("telegram")).toThrow(/MOCK_INJECT_FILE/);
  });
});

describe("mock-telegram envelope builders", () => {
  test("tst_conn_mocktelegram_ts_006 chat payload defaults match the Rust builder", () => {
    const built = buildChat({ chat_id: 777 })!;
    expect(built.remoteId).toBe("tg:chat:777");
    expect(built.payload).toEqual({
      entity_type: "telegram_chat",
      chat_id: 777,
      title: "Chat 777", // empty/absent title ⇒ synthesized
      type: "private",
      is_pinned: false,
      pin_order: 0,
      unread_count: 0,
      unread_mark: false,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_mentions_count: 0,
      top_message: 0,
    });
    // Optional fields appear ONLY when supplied.
    const rich = buildChat({
      chat_id: 5,
      title: "Acme Team",
      type: "group",
      member_count: 3,
      username: "acme",
      avatar_url: "https://x/a.png",
    })!;
    expect(rich.payload.member_count).toBe(3);
    expect(rich.payload.username).toBe("acme");
    expect(rich.payload.avatar_url).toBe("https://x/a.png");
    expect(rich.payload.title).toBe("Acme Team");
  });

  test("tst_conn_mocktelegram_ts_007 chat_id must be an integer", () => {
    expect(buildChat({})).toBeNull();
    expect(buildChat({ chat_id: "777" })).toBeNull();
    expect(buildMessage({})).toBeNull();
  });

  test("tst_conn_mocktelegram_ts_008 message auto-assigns message_id from the file length", () => {
    // One item already stored ⇒ the next auto id is 2 (Rust: len() + 1).
    appendItem({ entity_type: "telegram_chat", chat_id: 777 }, chatRemoteId(777), "snapshot");
    const built = buildMessage({ chat_id: 777, text: "ship it", sender_name: "Bob", sender_id: 99 })!;
    expect(built.payload.message_id).toBe(2);
    expect(built.remoteId).toBe("tg:msg:777:2");
    expect(built.payload.text).toBe("ship it");
    expect(built.payload.sender_name).toBe("Bob");
    expect(built.payload.sender_id).toBe(99);
    expect(built.payload.is_outgoing).toBe(false);
    expect(typeof built.payload.date).toBe("string");
    expect(built.payload).not.toHaveProperty("chat_title");
    expect(built.payload).not.toHaveProperty("reply_to_msg_id");
  });

  test("tst_conn_mocktelegram_ts_009 explicit message_id + date + reply are honoured", () => {
    const built = buildMessage({
      chat_id: 111,
      message_id: 42,
      text: "Hello world",
      date: "2026-05-20T10:00:00+00:00",
      is_outgoing: true,
      chat_title: "Project X",
      reply_to_msg_id: 7,
    })!;
    expect(built.remoteId).toBe(messageRemoteId(111, 42));
    expect(built.payload.date).toBe("2026-05-20T10:00:00+00:00");
    expect(built.payload.is_outgoing).toBe(true);
    expect(built.payload.chat_title).toBe("Project X");
    expect(built.payload.reply_to_msg_id).toBe(7);
    expect(built.payload.text).toBe("Hello world");
  });
});

describe("mock-telegram control server", () => {
  // tst_conn_mocktelegram_ts_010 — twin of the Rust tst_conn_mocktelegram_002:
  // inject-chat then inject-message, then fetch sees both with the right kinds.
  test("tst_conn_mocktelegram_ts_010 inject-chat + inject-message → fetch", async () => {
    expect(injectChat({ chat_id: 777, title: "Acme Team", type: "group", member_count: 3 })).toEqual(
      { queued: true, total: 1, remote_id: "tg:chat:777" },
    );
    expect(injectMessage({ chat_id: 777, text: "ship it", sender_name: "Bob", sender_id: 99 })).toEqual(
      { queued: true, total: 2, remote_id: "tg:msg:777:2" },
    );

    const out = await fetchMockTelegram({ surface: "telegram", cursor: 0 });
    expect(out.envelopes.map((e) => e.kind)).toEqual(["snapshot", "live"]);
    expect(out.envelopes[0]!.payload.member_count).toBe(3);
    expect(out.envelopes[1]!.payload.text).toBe("ship it");
    expect(status()).toEqual({ chats: 1, messages: 1, total: 2 });
  });

  test("tst_conn_mocktelegram_ts_011 missing chat_id is refused, not queued", () => {
    expect(injectChat({ title: "no id" })).toEqual({
      queued: false,
      error: "chat_id (integer) required",
    });
    expect(injectMessage({ text: "no id" })).toEqual({
      queued: false,
      error: "chat_id (integer) required",
    });
    expect(status()).toEqual({ chats: 0, messages: 0, total: 0 });
  });

  test("tst_conn_mocktelegram_ts_012 routes: /inject-chat, /inject-message, /health, /status", async () => {
    const post = (path: string, b: unknown) =>
      handleHttp(new Request(`http://x${path}`, { method: "POST", body: JSON.stringify(b) }));

    expect(await (await post("/inject-chat", { chat_id: 1 })).json()).toEqual({
      queued: true,
      total: 1,
      remote_id: "tg:chat:1",
    });
    expect(await (await post("/inject-message", { chat_id: 1, text: "hi" })).json()).toEqual({
      queued: true,
      total: 2,
      remote_id: "tg:msg:1:2",
    });

    expect(await (await handleHttp(new Request("http://x/health"))).text()).toBe("ok");
    expect(await (await handleHttp(new Request("http://x/status"))).json()).toEqual({
      chats: 1,
      messages: 1,
      total: 2,
    });
    expect((await handleHttp(new Request("http://x/nope"))).status).toBe(404);
  });
});
