// Envelope-builder parity tests — the TS mirror of the Rust
// plugins/sources/telegram/src/envelope.rs `mod tests`.

import { describe, expect, test } from "bun:test";
import {
  chatEnvelope,
  chatPayload,
  messageEnvelope,
  messagePayload,
  tgMediaExt,
  tgMediaSubdir,
  toRfc3339Utc,
  type TgChat,
  type TgMessage,
} from "./envelope";

/** A plain text message with every optional field unset. */
function baseMessage(over: Partial<TgMessage> = {}): TgMessage {
  return {
    message_id: 42,
    chat_id: 111,
    text: "Hello world",
    date: "2026-05-20T10:00:00+00:00",
    is_outgoing: false,
    has_media: true,
    is_pinned: false,
    account_id: "",
    live: false,
    ...over,
  };
}

function baseChat(over: Partial<TgChat> = {}): TgChat {
  return {
    chat_id: 111,
    title: "Project X",
    chat_type: "group",
    is_pinned: false,
    pin_order: 0,
    unread_count: 0,
    unread_mark: false,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_mentions_count: 0,
    top_message: 0,
    ...over,
  };
}

describe("message payload", () => {
  // Twin of tst_conn_telegram_env_001.
  test("tst_tgts_env_001 plain message: canonical payload, remote_id, cursor", () => {
    const env = messageEnvelope(
      baseMessage({ chat_title: "Project X", sender_name: "Alice", sender_id: 222 }),
      "snapshot",
    );
    expect(env.surface).toBe("telegram");
    expect(env.remote_id).toBe("tg:msg:111:42");
    expect(env.kind).toBe("snapshot");
    expect(env.cursor).toEqual({ chat_id: 111, message_id: 42 });

    const p = env.payload as Record<string, unknown>;
    expect(p.message_id).toBe(42);
    expect(p.chat_id).toBe(111);
    expect(p.text).toBe("Hello world");
    expect(p.date).toBe("2026-05-20T10:00:00+00:00");
    expect(p.is_outgoing).toBe(false);
    expect(p.chat_title).toBe("Project X");
    expect(p.sender_name).toBe("Alice");
    expect(p.sender_id).toBe(222);
    // Absent keys must NOT be emitted (not even as null).
    for (const k of [
      "media_type",
      "source_ref",
      "file_name",
      "reply_to_msg_id",
      "is_pinned",
      "sender_info",
    ]) {
      expect(k in p).toBe(false);
    }
  });

  test("tst_tgts_env_002 the 5 always-keys lead, in the Rust source's order", () => {
    const p = messagePayload(baseMessage({ chat_title: "C", sender_name: "A" }));
    expect(Object.keys(p).slice(0, 5)).toEqual([
      "message_id",
      "chat_id",
      "text",
      "date",
      "is_outgoing",
    ]);
  });

  // Twin of tst_conn_telegram_env_002.
  test("tst_tgts_env_003 downloadable media: source_ref + derived file_name", () => {
    const p = messagePayload(
      baseMessage({
        message_id: 7,
        chat_id: -100,
        text: "",
        date: "2026-05-20T11:00:00+00:00",
        reply_to_msg_id: 6,
        media_type: "photo",
        has_media: true,
        is_pinned: true,
        sender_info: { first_name: "Bob", last_name: "Jones", username: "bobj" },
        account_id: "acct-1",
      }),
    );
    expect(p.media_type).toBe("photo");
    expect(p.reply_to_msg_id).toBe(6);
    expect(p.is_pinned).toBe(true);
    expect(p.source_ref).toEqual({
      account_id: "acct-1",
      chat_id: -100,
      message_id: 7,
      media_type: "photo",
      dest_subpath: "telegram/photos/tg_-100_7.jpg",
    });
    expect(p.file_name).toBe("photo_-100_7.jpg");
    expect(p.sender_info).toEqual({
      first_name: "Bob",
      last_name: "Jones",
      username: "bobj",
    });
    // An unset optional sender_info key is omitted entirely.
    expect("phone" in (p.sender_info as Record<string, unknown>)).toBe(false);
  });

  test("tst_tgts_env_003b explicit-null sender_info members are OMITTED like Rust serde (envelope.rs:19-24)", () => {
    // A fixture may carry {"phone": null} — Rust deserializes null into
    // Option::None and skip_serializing_if omits the key on output. The TS
    // emission point must drop nulls identically, or the module schema
    // rejects the batch ("null is not of type \"string\"").
    const env = messageEnvelope(
      baseMessage({
        message_id: 8,
        sender_info: { first_name: "Bob", last_name: null, username: null, phone: null } as never,
      }),
      "snapshot",
    );
    const p = env.payload as Record<string, unknown>;
    expect(p.sender_info).toEqual({ first_name: "Bob" });
    expect(Object.keys(p.sender_info as object)).toEqual(["first_name"]);
  });

  test("tst_tgts_env_004 an original file_name wins over the generated one", () => {
    const p = messagePayload(
      baseMessage({ media_type: "document", has_media: true, file_name: "report.pdf" }),
    );
    expect(p.file_name).toBe("report.pdf");
    expect((p.source_ref as Record<string, unknown>).dest_subpath).toBe(
      "telegram/documents/tg_111_42.bin",
    );
  });

  // Twin of tst_conn_telegram_env_003: media_type WITHOUT source_ref/file_name.
  test("tst_tgts_env_005 non-downloadable media keeps media_type, drops source_ref", () => {
    const p = messagePayload(
      baseMessage({ media_type: "unsupported", has_media: false }),
    );
    expect(p.media_type).toBe("unsupported");
    expect("source_ref" in p).toBe(false);
    expect("file_name" in p).toBe(false);
  });

  test("tst_tgts_env_006 is_pinned is OMITTED when false, present only when true", () => {
    expect("is_pinned" in messagePayload(baseMessage({ is_pinned: false }))).toBe(false);
    expect(messagePayload(baseMessage({ is_pinned: true })).is_pinned).toBe(true);
  });

  test("tst_tgts_env_007 sender_id is emitted only when set (User senders)", () => {
    // A channel/group sender leaves sender_id unset while sender_name still shows.
    const chan = messagePayload(baseMessage({ sender_name: "Announcements" }));
    expect(chan.sender_name).toBe("Announcements");
    expect("sender_id" in chan).toBe(false);

    const user = messagePayload(baseMessage({ sender_name: "Alice", sender_id: 5 }));
    expect(user.sender_id).toBe(5);
  });

  // Twin of tst_src_tg_file_account_006 (Bug 2).
  test("tst_tgts_env_008 source_ref.account_id mirrors the message's account_id", () => {
    const media = (accountId: string): TgMessage =>
      baseMessage({
        message_id: 7,
        chat_id: 100,
        text: "",
        media_type: "photo",
        has_media: true,
        account_id: accountId,
      });
    expect(
      (messagePayload(media("conn-xyz")).source_ref as Record<string, unknown>).account_id,
    ).toBe("conn-xyz");
    // Regression guard: an empty account_id yields an empty source_ref.account_id
    // — exactly why backfill must thread the REAL id (an empty one silently
    // breaks the media download worker: "no session for account ''").
    expect(
      (messagePayload(media("")).source_ref as Record<string, unknown>).account_id,
    ).toBe("");
  });
});

describe("media subdir/ext table", () => {
  test("tst_tgts_env_009 every media type maps to the Rust subdir + ext", () => {
    const table: [string, string, string][] = [
      ["photo", "photos", "jpg"],
      ["voice", "voice", "ogg"],
      ["video", "videos", "mp4"],
      ["video_note", "videos", "mp4"],
      ["animation", "videos", "mp4"],
      ["sticker", "stickers", "webp"],
      ["audio", "documents", "mp3"],
      ["document", "documents", "bin"],
      ["anything_else", "documents", "bin"],
    ];
    for (const [mt, subdir, ext] of table) {
      expect(tgMediaSubdir(mt)).toBe(subdir);
      expect(tgMediaExt(mt)).toBe(ext);
      // …and the dest_subpath composed from them.
      const p = messagePayload(
        baseMessage({ media_type: mt, has_media: true, chat_id: 9, message_id: 3 }),
      );
      expect((p.source_ref as Record<string, unknown>).dest_subpath).toBe(
        `telegram/${subdir}/tg_9_3.${ext}`,
      );
      expect(p.file_name).toBe(`${mt}_9_3.${ext}`);
    }
  });
});

describe("date format", () => {
  // The Rust connector emits chrono's `to_rfc3339()` = the `+00:00` offset form;
  // JS `toISOString()` emits `Z`. The host's parser accepts both, but the twins
  // must agree byte-for-byte on the value.
  test("tst_tgts_env_010 dates use the +00:00 offset form, not Z", () => {
    expect(toRfc3339Utc(new Date("2026-05-20T10:00:00Z"))).toBe(
      "2026-05-20T10:00:00+00:00",
    );
    expect(toRfc3339Utc(new Date("2026-05-20T10:00:00Z"))).not.toContain("Z");
    // A non-zero fraction is preserved (chrono's AutoSi behaviour).
    expect(toRfc3339Utc(new Date("2026-05-20T10:00:00.123Z"))).toBe(
      "2026-05-20T10:00:00.123+00:00",
    );
  });
});

describe("chat payload", () => {
  // Twin of tst_conn_telegram_env_004.
  test("tst_tgts_env_011 chat payload + tg:chat: remote_id, no cursor field", () => {
    const env = chatEnvelope(
      baseChat({
        is_pinned: true,
        unread_count: 2,
        read_inbox_max_id: 40,
        read_outbox_max_id: 39,
        top_message: 42,
        member_count: 5,
        username: "projectx",
      }),
    );
    expect(env.remote_id).toBe("tg:chat:111");
    expect(env.kind).toBe("snapshot");
    expect(env.surface).toBe("telegram");
    // A chat envelope carries NO cursor field (unlike a message envelope).
    expect("cursor" in env).toBe(false);

    const p = env.payload as Record<string, unknown>;
    expect(p.entity_type).toBe("telegram_chat");
    expect(p.chat_id).toBe(111);
    expect(p.title).toBe("Project X");
    expect(p.type).toBe("group");
    expect(p.is_pinned).toBe(true);
    expect(p.unread_count).toBe(2);
    expect(p.top_message).toBe(42);
    expect(p.member_count).toBe(5);
    expect(p.username).toBe("projectx");
    expect("pts" in p).toBe(false);
    expect("avatar_url" in p).toBe(false);
  });

  test("tst_tgts_env_012 an empty title falls back to `Chat {chat_id}`", () => {
    expect(chatPayload(baseChat({ title: "", chat_id: -42 })).title).toBe("Chat -42");
    // A present title is passed through untouched.
    expect(chatPayload(baseChat({ title: "Real" })).title).toBe("Real");
  });

  test("tst_tgts_env_013 pin_order + unread_mark are ALWAYS emitted (even falsy)", () => {
    const p = chatPayload(baseChat({ is_pinned: false, pin_order: 0 }));
    expect(p.pin_order).toBe(0);
    expect(p.is_pinned).toBe(false);
    expect(p.unread_mark).toBe(false);
  });
});
