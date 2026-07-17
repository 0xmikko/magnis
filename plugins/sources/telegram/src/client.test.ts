// Conversion + credential + flood-retry parity tests — the TS mirror of the Rust
// plugins/sources/telegram/src/client.rs `mod tests`.

import { describe, expect, test } from "bun:test";
import {
  accountIdFromMeta,
  chatMemberCount,
  chatToIntermediate,
  chatTypeStr,
  chatUsername,
  credsFromMeta,
  extractMediaInfo,
  floodWaitSecs,
  historyErrorIsFatal,
  messageToIntermediate,
  MtprotoTimeoutError,
  MTPROTO_REQUEST_TIMEOUT_MS,
  offsetPeerFromEntity,
  RATE_LIMITED_PREFIX,
  senderDisplayName,
  sendWithFloodRetry,
  withTimeout,
  type DialogMeta,
  type EntityLike,
  type MessageLike,
} from "./client";

function rpcErr(code: number, name: string): Error & { code: number; errorMessage: string } {
  const e = new Error(name) as Error & { code: number; errorMessage: string };
  e.code = code;
  e.errorMessage = name;
  return e;
}

/** gramjs raises a FloodWaitError: code 420 + `.seconds`. */
function floodErr(secs: number): Error & { code: number; errorMessage: string; seconds: number } {
  const e = rpcErr(420, "FLOOD_WAIT") as Error & {
    code: number;
    errorMessage: string;
    seconds: number;
  };
  e.seconds = secs;
  return e;
}

// ── credentials ─────────────────────────────────────────────────────────────

describe("credsFromMeta / accountIdFromMeta", () => {
  const good = { api_id: 12345, api_hash: "deadbeef", session: "1AAB", account_id: "conn-1" };

  test("tst_tgts_creds_001 api_id accepts a number OR a numeric string, must be > 0", () => {
    expect(credsFromMeta({ _meta: good }).api_id).toBe(12345);
    expect(credsFromMeta({ _meta: { ...good, api_id: "12345" } }).api_id).toBe(12345);
    for (const bad of [0, -1, "0", "not-a-number", "", null, undefined]) {
      expect(() => credsFromMeta({ _meta: { ...good, api_id: bad } })).toThrow(
        "missing or invalid credential 'api_id' in _meta",
      );
    }
  });

  test("tst_tgts_creds_002 each missing/empty credential has its EXACT Rust message", () => {
    expect(() => credsFromMeta({})).toThrow("missing _meta with Telegram credentials");
    expect(() => credsFromMeta({ _meta: { ...good, api_hash: "" } })).toThrow(
      "missing credential 'api_hash' in _meta",
    );
    expect(() => credsFromMeta({ _meta: { ...good, api_hash: undefined } })).toThrow(
      "missing credential 'api_hash' in _meta",
    );
    expect(() => credsFromMeta({ _meta: { ...good, session: "" } })).toThrow(
      "missing credential 'session' in _meta",
    );
  });

  test("tst_tgts_creds_003 account_id is REQUIRED and never collapses to empty", () => {
    expect(accountIdFromMeta({ _meta: good })).toBe("conn-1");
    // NO FALLBACKS: an empty account_id must NOT collapse to "" (that silently
    // breaks media download: "no session for account ''").
    for (const args of [{}, { _meta: {} }, { _meta: { account_id: "" } }]) {
      expect(() => accountIdFromMeta(args)).toThrow("missing required _meta.account_id");
    }
  });
});

// ── media extraction ────────────────────────────────────────────────────────

const doc = (mimeType: string, attributes: { className?: string; fileName?: string }[] = []) => ({
  id: 1,
  media: { className: "MessageMediaDocument", document: { mimeType, attributes } },
});

describe("extractMediaInfo", () => {
  test("tst_tgts_media_001 photo / sticker → downloadable, no file_name", () => {
    expect(extractMediaInfo({ id: 1, media: { className: "MessageMediaPhoto" } })).toEqual({
      media_type: "photo",
      has_media: true,
    });
    // gramjs models a sticker as a Document + a Sticker attribute (grammers has a
    // dedicated Media::Sticker variant); both must yield ("sticker", true, none).
    expect(
      extractMediaInfo(doc("image/webp", [{ className: "DocumentAttributeSticker" }])),
    ).toEqual({ media_type: "sticker", has_media: true });
  });

  test("tst_tgts_media_002 document mime dispatch mirrors the Rust ladder", () => {
    expect(extractMediaInfo(doc("video/mp4")).media_type).toBe("video");
    // audio/ogg OR any mime containing "opus" → voice (checked BEFORE audio/*).
    expect(extractMediaInfo(doc("audio/ogg")).media_type).toBe("voice");
    expect(extractMediaInfo(doc("audio/opus")).media_type).toBe("voice");
    expect(extractMediaInfo(doc("application/x-opus")).media_type).toBe("voice");
    expect(extractMediaInfo(doc("audio/mpeg")).media_type).toBe("audio");
    expect(extractMediaInfo(doc("application/pdf")).media_type).toBe("document");
    expect(extractMediaInfo(doc("")).media_type).toBe("document");
  });

  test("tst_tgts_media_003 a document's file_name is used; an empty one is dropped", () => {
    expect(
      extractMediaInfo(
        doc("application/pdf", [{ className: "DocumentAttributeFilename", fileName: "r.pdf" }]),
      ),
    ).toEqual({ media_type: "document", has_media: true, file_name: "r.pdf" });
    expect(
      extractMediaInfo(
        doc("application/pdf", [{ className: "DocumentAttributeFilename", fileName: "" }]),
      ).file_name,
    ).toBeUndefined();
  });

  test("tst_tgts_media_004 other media → 'unsupported' (media_type but NOT downloadable)", () => {
    for (const className of ["MessageMediaWebPage", "MessageMediaContact", "MessageMediaPoll"]) {
      expect(extractMediaInfo({ id: 1, media: { className } })).toEqual({
        media_type: "unsupported",
        has_media: false,
      });
    }
  });

  test("tst_tgts_media_005 no media → no media_type at all", () => {
    expect(extractMediaInfo({ id: 1 })).toEqual({ has_media: false });
    expect(extractMediaInfo({ id: 1, media: null })).toEqual({ has_media: false });
  });
});

// ── entity conversion ───────────────────────────────────────────────────────

describe("chat entity conversion", () => {
  test("tst_tgts_chat_001 type map: User→private, Chat→group, Channel/megagroup→supergroup", () => {
    expect(chatTypeStr({ className: "User" })).toBe("private");
    expect(chatTypeStr({ className: "Chat" })).toBe("group");
    expect(chatTypeStr({ className: "Channel" })).toBe("supergroup");
    // A megagroup IS an Api.Channel in gramjs → supergroup (not "group").
    expect(chatTypeStr({ className: "Channel", megagroup: true })).toBe("supergroup");
  });

  test("tst_tgts_chat_002 member_count: null for a User, participants for Chat/Channel", () => {
    expect(chatMemberCount({ className: "User", participantsCount: 9 })).toBeUndefined();
    expect(chatMemberCount({ className: "Chat", participantsCount: 5 })).toBe(5);
    expect(chatMemberCount({ className: "Channel", participantsCount: 900 })).toBe(900);
    // A channel with no reported count stays absent.
    expect(chatMemberCount({ className: "Channel" })).toBeUndefined();
  });

  test("tst_tgts_chat_003 username: User/Channel only — a basic Group has none", () => {
    expect(chatUsername({ className: "User", username: "alice" })).toBe("alice");
    expect(chatUsername({ className: "Channel", username: "news" })).toBe("news");
    // A basic group NEVER reports a username, even if the field is set.
    expect(chatUsername({ className: "Chat", username: "nope" })).toBeUndefined();
  });

  test("tst_tgts_chat_003b gramjs null username never leaks into the chat payload", () => {
    // gramjs: absent username = null. chatUsername must fold it to undefined,
    // or chatToIntermediate spreads { username: null } and the module schema
    // rejects the batch ("null is not of type \"string\" at /username").
    expect(chatUsername({ className: "User", id: 7, username: null })).toBeUndefined();
    expect(chatUsername({ className: "Channel", id: 8, username: null })).toBeUndefined();
    const c = chatToIntermediate(
      { className: "Channel", id: 9, title: "News", username: null },
      { is_pinned: false, pin_order: 0, unread_count: 0, unread_mark: false,
        read_inbox_max_id: 0, read_outbox_max_id: 0, unread_mentions_count: 0, top_message: 0 },
    );
    expect("username" in c).toBe(false);
    // senderDisplayName: a nameless User with null username → "User {id}", not "@null"
    expect(senderDisplayName({ className: "User", id: 5, username: null })).toBe("User 5");
  });

  test("tst_tgts_chat_004 chatToIntermediate carries the meta + omits absent optionals", () => {
    const meta: DialogMeta = {
      is_pinned: true,
      pin_order: 2,
      unread_count: 3,
      unread_mark: true,
      read_inbox_max_id: 10,
      read_outbox_max_id: 9,
      unread_mentions_count: 1,
      top_message: 42,
      pts: 77,
    };
    const chat = chatToIntermediate(
      { className: "Channel", id: -100500, title: "News", participantsCount: 12, username: "news" },
      meta,
    );
    expect(chat).toEqual({
      chat_id: -100500,
      title: "News",
      chat_type: "supergroup",
      is_pinned: true,
      pin_order: 2,
      unread_count: 3,
      unread_mark: true,
      read_inbox_max_id: 10,
      read_outbox_max_id: 9,
      unread_mentions_count: 1,
      top_message: 42,
      pts: 77,
      member_count: 12,
      username: "news",
    });
    // avatar_url is always absent here (twin of the Rust `avatar_url: None`).
    expect("avatar_url" in chat).toBe(false);
  });
});

describe("senderDisplayName", () => {
  test("tst_tgts_sender_001 the entity name wins when non-empty", () => {
    expect(senderDisplayName({ className: "User", id: 1, firstName: "Al", lastName: "Ice" })).toBe(
      "Al Ice",
    );
    expect(senderDisplayName({ className: "Channel", id: 2, title: "News" })).toBe("News");
  });

  test("tst_tgts_sender_002 a nameless User falls back to @username, then `User {id}`", () => {
    expect(senderDisplayName({ className: "User", id: 7, username: "bob" })).toBe("@bob");
    expect(senderDisplayName({ className: "User", id: 7 })).toBe("User 7");
  });

  test("tst_tgts_sender_003 a nameless non-User falls back to the bare id; none → undefined", () => {
    expect(senderDisplayName({ className: "Channel", id: 99 })).toBe("99");
    expect(senderDisplayName(null)).toBeUndefined();
    expect(senderDisplayName(undefined)).toBeUndefined();
  });
});

describe("messageToIntermediate", () => {
  const user: EntityLike = {
    className: "User",
    id: 222,
    firstName: "Alice",
    lastName: "A",
    username: "alice",
    phone: "+100",
  };

  test("tst_tgts_msg_001 the CALLER's dialog id wins over msg.chat.id (min-peer guard)", () => {
    // A "min" peer whose own id (999) differs from the dialog id (111): keying to
    // it would ORPHAN the message from its chat entity.
    const msg: MessageLike = {
      id: 42,
      message: "hi",
      date: 1779271200,
      chat: { className: "User", id: 999, firstName: "Min" },
      sender: user,
    };
    const m = messageToIntermediate(msg, "acct", 111);
    expect(m.chat_id).toBe(111);
    expect(m.message_id).toBe(42);
    expect(m.account_id).toBe("acct");
  });

  test("tst_tgts_msg_002 sender_info is built for User senders only", () => {
    const m = messageToIntermediate({ id: 1, sender: user, date: 0 }, "a", 1);
    expect(m.sender_info).toEqual({
      first_name: "Alice",
      last_name: "A",
      username: "alice",
      phone: "+100",
    });
    expect(m.sender_id).toBe(222);
    expect(m.sender_name).toBe("Alice A");

    // A channel sender: a display name, but NO sender_id and NO sender_info.
    const ch = messageToIntermediate(
      { id: 1, sender: { className: "Channel", id: 5, title: "News" }, date: 0 },
      "a",
      1,
    );
    expect(ch.sender_info).toBeUndefined();
    expect(ch.sender_id).toBeUndefined();
    expect(ch.sender_name).toBe("News");
  });

  test("tst_tgts_msg_002b gramjs null sender fields are OMITTED, never null (envelope.rs:19-24 skip_serializing_if)", () => {
    // gramjs sets absent User fields to null (NOT undefined) — the live trap:
    // `!== undefined` lets null through, the module schema then rejects the
    // whole batch ("null is not of type \"string\" at /sender_info/phone").
    const nullUser = { className: "User", id: 7, firstName: "Bob", lastName: null, username: null, phone: null };
    const m = messageToIntermediate({ id: 2, sender: nullUser, date: 0 }, "a", 1);
    expect(m.sender_info).toEqual({ first_name: "Bob" });
    expect(Object.keys(m.sender_info!)).toEqual(["first_name"]);
  });

  test("tst_tgts_msg_003 the unix-seconds date becomes the +00:00 RFC3339 form", () => {
    const m = messageToIntermediate({ id: 1, date: 1779271200 }, "a", 1);
    expect(m.date).toBe("2026-05-20T10:00:00+00:00");
  });

  test("tst_tgts_msg_004 defaults: empty text, not outgoing, not pinned, no reply", () => {
    const m = messageToIntermediate({ id: 1, date: 0 }, "a", 1);
    expect(m.text).toBe("");
    expect(m.is_outgoing).toBe(false);
    expect(m.is_pinned).toBe(false);
    expect(m.reply_to_msg_id).toBeUndefined();
    expect(m.chat_title).toBeUndefined();
    expect(m.live).toBe(false);
  });

  test("tst_tgts_msg_005 replyTo + pinned + outgoing are read through", () => {
    const m = messageToIntermediate(
      { id: 1, date: 0, out: true, pinned: true, replyTo: { replyToMsgId: 7 } },
      "a",
      1,
    );
    expect(m.is_outgoing).toBe(true);
    expect(m.is_pinned).toBe(true);
    expect(m.reply_to_msg_id).toBe(7);
  });
});

describe("offsetPeerFromEntity", () => {
  test("tst_tgts_offset_001 ty map + access_hash omitted when absent", () => {
    expect(offsetPeerFromEntity({ className: "User", id: 111, accessHash: 42 })).toEqual({
      ty: "user",
      id: 111,
      access_hash: 42,
    });
    expect(offsetPeerFromEntity({ className: "Channel", id: 222, accessHash: 7 })).toEqual({
      ty: "channel",
      id: 222,
      access_hash: 7,
    });
    // A basic chat has NO access_hash — the field must be omitted, not null.
    const basic = offsetPeerFromEntity({ className: "Chat", id: 333 });
    expect(basic).toEqual({ ty: "chat", id: 333 });
    expect("access_hash" in basic).toBe(false);
    // …and it survives a JSON round-trip through the host's cursor.
    expect(JSON.parse(JSON.stringify(basic))).toEqual({ ty: "chat", id: 333 });
  });
});

// ── error classification ────────────────────────────────────────────────────

describe("historyErrorIsFatal", () => {
  // Twin of tst_src_tg_history_class_010.
  test("tst_tgts_fatal_001 500 RPC_CALL_FAIL + connection drops are TRANSIENT", () => {
    // The exact failure from the live app: server 500 RPC_CALL_FAIL.
    expect(historyErrorIsFatal(rpcErr(500, "RPC_CALL_FAIL"))).toBe(false);
    expect(historyErrorIsFatal(rpcErr(500, "INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(historyErrorIsFatal(new Error("connection reset"))).toBe(false);
  });

  test("tst_tgts_fatal_002 401 auth + 420/FLOOD_WAIT are FATAL", () => {
    expect(historyErrorIsFatal(rpcErr(401, "AUTH_KEY_UNREGISTERED"))).toBe(true);
    expect(historyErrorIsFatal(rpcErr(401, "SESSION_REVOKED"))).toBe(true);
    expect(historyErrorIsFatal(rpcErr(420, "FLOOD_WAIT_30"))).toBe(true);
    expect(historyErrorIsFatal(floodErr(31))).toBe(true);
  });
});

describe("floodWaitSecs", () => {
  // Twin of tst_src_tg_023.
  test("tst_tgts_flood_001 reads .seconds off a FloodWait; other errors → undefined", () => {
    expect(floodWaitSecs(floodErr(31))).toBe(31);
    expect(floodWaitSecs(rpcErr(401, "AUTH_KEY_UNREGISTERED"))).toBeUndefined();
    expect(floodWaitSecs(rpcErr(500, "RPC_CALL_FAIL"))).toBeUndefined();
    expect(floodWaitSecs(new Error("plain error"))).toBeUndefined();
  });
});

describe("sendWithFloodRetry", () => {
  // Twin of tst_src_tg_021.
  test("tst_tgts_flood_002 a SHORT FloodWait (<= 30s) sleeps then retries ONCE", async () => {
    let attempts = 0;
    const slept: number[] = [];
    const result = await sendWithFloodRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw floodErr(5);
        return { message_id: 99 };
      },
      async (secs) => {
        slept.push(secs);
      },
    );
    expect(result).toEqual({ message_id: 99 });
    expect(attempts).toBe(2); // initial + exactly one retry
    expect(slept).toEqual([5]); // slept for the FloodWait seconds
  });

  test("tst_tgts_flood_003 the boundary 30s retries; 31s does not", async () => {
    let attempts = 0;
    await sendWithFloodRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw floodErr(30);
        return "ok";
      },
      async () => {},
    );
    expect(attempts).toBe(2); // 30 is INCLUSIVE (<= FLOOD_WAIT_RETRY_MAX)

    await expect(
      sendWithFloodRetry(
        async () => {
          throw floodErr(31);
        },
        async () => {},
      ),
    ).rejects.toThrow(`${RATE_LIMITED_PREFIX}31`);
  });

  // Twin of tst_src_tg_022.
  test("tst_tgts_flood_004 a LONG FloodWait (> 30s) throws the sentinel WITHOUT sleeping", async () => {
    let attempts = 0;
    let slept = false;
    await expect(
      sendWithFloodRetry(
        async () => {
          attempts += 1;
          throw floodErr(120);
        },
        async () => {
          slept = true;
        },
      ),
    ).rejects.toThrow("RATE_LIMITED:120");
    expect(attempts).toBe(1); // must NOT retry (the connector is not blocked)
    expect(slept).toBe(false); // must NOT sleep in the connector
  });

  test("tst_tgts_flood_005 a failing retry surfaces the retry's error; non-flood propagates", async () => {
    // The retry's own error is what the caller sees.
    let n = 0;
    await expect(
      sendWithFloodRetry(
        async () => {
          n += 1;
          throw n === 1 ? floodErr(5) : rpcErr(401, "AUTH_KEY_UNREGISTERED");
        },
        async () => {},
      ),
    ).rejects.toThrow("AUTH_KEY_UNREGISTERED");

    // A non-flood error is propagated unchanged, with no retry.
    let calls = 0;
    await expect(
      sendWithFloodRetry(
        async () => {
          calls += 1;
          throw new Error("boom");
        },
        async () => {},
      ),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});

// ── request timeout (the live-sync hang) ────────────────────────────────────

describe("withTimeout", () => {
  // THE bug that froze the live bootstrap at 154 chats: gramjs `invoke` waits
  // FOREVER on a silently-dropped MTProto response (process stuck in ep_poll).
  // withTimeout must REJECT with a typed error within the deadline, NOT hang.
  test("tst_tgts_timeout_001 a never-resolving call rejects with MtprotoTimeoutError (does not hang)", async () => {
    const never = new Promise<number>(() => {}); // never settles — the ep_poll hang
    const start = Date.now();
    await expect(withTimeout(never, 20, "invoke")).rejects.toBeInstanceOf(MtprotoTimeoutError);
    expect(Date.now() - start).toBeLessThan(1000); // bounded — it did NOT wait forever
  });

  test("tst_tgts_timeout_002 a call that settles before the deadline passes through unchanged", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "invoke")).resolves.toBe(42);
    await expect(withTimeout(Promise.reject(new Error("rpc")), 1000, "invoke")).rejects.toThrow(
      "rpc",
    );
  });

  test("tst_tgts_timeout_003 the default request timeout is a bounded, sane value", () => {
    expect(MTPROTO_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(MTPROTO_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});
