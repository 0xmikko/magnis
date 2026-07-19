import { describe, expect, test } from "bun:test";
import {
  CURSOR_EXPIRED_CODE,
  CursorExpiredError,
  handleMessage,
  RateLimitError,
} from "@magnis/connector-sdk";
import {
  buildRawMessage,
  encodeBase64UrlNoPad,
  fetchHistoryChanges,
  fetchMessagePage,
  flattenMailPayload,
  gmailMessageToMailMessage,
  mimeEncodeHeader,
  parseMailDraft,
  resolveHistoryActions,
  sendMessage,
  sortedActions,
  type GmailMessage,
} from "./gmail";
import { extractBodyContent } from "./mime";
import {
  GoogleRateLimitError,
  HistoryExpiredError,
  type FetchLike,
  type HttpResponse,
} from "../../http";

// ── Shared fakes ────────────────────────────────────────────────────────────

function ok(data: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function status(code: number, body = "", retryAfter?: string): HttpResponse {
  return {
    ok: false,
    status: code,
    headers: { get: (n) => (n === "retry-after" ? (retryAfter ?? null) : null) },
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  };
}

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

function fullGmailMessage(): GmailMessage {
  return {
    id: "msg_1",
    threadId: "thread_1",
    labelIds: ["UNREAD", "STARRED", "INBOX"],
    snippet: "Hello preview",
    internalDate: "1700000000000",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: "Test subject" },
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "Bob <bob@example.com>, carol@example.com" },
        { name: "Cc", value: "dave@example.com" },
        { name: "Bcc", value: "" },
        { name: "Date", value: "Tue, 14 Nov 2023 22:13:20 +0000" },
        { name: "Message-Id", value: "<mid-1@example.com>" },
      ],
      body: { size: 11, data: b64url("Hello world") },
    },
  };
}

// ── Conversion (spec test 1) ────────────────────────────────────────────────

describe("gmail message conversion", () => {
  test("tst_gts_gmail_001 full message → flattened canonical fields", () => {
    const mail = gmailMessageToMailMessage(fullGmailMessage());
    expect(mail.id).toBe("msg_1");
    expect(mail.thread_id).toBe("thread_1");
    expect(mail.subject).toBe("Test subject");
    expect(mail.from.address).toBe("alice@example.com");
    expect(mail.from.name).toBe("Alice");
    expect(mail.to).toHaveLength(2);
    expect(mail.to[1].address).toBe("carol@example.com");
    expect(mail.cc).toHaveLength(1);
    expect(mail.bcc).toHaveLength(0);
    expect(mail.is_read).toBe(false); // UNREAD present
    expect(mail.is_starred).toBe(true);
    // Date header wins over internalDate; chrono-style RFC3339 Z (no .000).
    expect(mail.sent_at).toBe("2023-11-14T22:13:20Z");
    // Message-Id matched case-insensitively.
    expect(mail.message_id_header).toBe("<mid-1@example.com>");
    expect(mail.body_text).toBe("Hello world");
    expect(mail.has_attachments).toBe(false);
  });

  test("tst_gts_gmail_002 sent_at falls back to internalDate millis", () => {
    const msg = fullGmailMessage();
    msg.payload!.headers = msg.payload!.headers!.filter((h) => h.name !== "Date");
    const mail = gmailMessageToMailMessage(msg);
    expect(mail.sent_at).toBe("2023-11-14T22:13:20Z"); // 1700000000000 ms
    // Neither Date nor internalDate → epoch (Rust unwrap_or_default).
    msg.internalDate = null;
    expect(gmailMessageToMailMessage(msg).sent_at).toBe("1970-01-01T00:00:00Z");
  });

  test("tst_gts_gmail_003 bodies: multipart split, snippet fallback, attachments", () => {
    // Multipart keeps text/plain and text/html separate (nested parts walked).
    const body = extractBodyContent({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Plain body") } },
        { mimeType: "text/html", body: { data: b64url("<p>HTML body</p>") } },
      ],
    });
    expect(body.bodyText).toBe("Plain body");
    expect(body.bodyHtml).toBe("<p>HTML body</p>");

    // HTML-only single-part: no invented plaintext at the MIME layer …
    const htmlOnly = extractBodyContent({
      mimeType: "text/html",
      body: { data: b64url("<div>Hello</div>") },
    });
    expect(htmlOnly.bodyText).toBeNull();
    expect(htmlOnly.bodyHtml).toBe("<div>Hello</div>");

    // … but the message-level body_text falls back to the TRIMMED snippet.
    const msg = fullGmailMessage();
    msg.payload = {
      mimeType: "text/html",
      headers: msg.payload!.headers,
      body: { data: b64url("<div>Hello</div>") },
    };
    msg.snippet = "  trimmed preview  ";
    const mail = gmailMessageToMailMessage(msg);
    expect(mail.body_text).toBe("trimmed preview");
    expect(mail.body_html).toBe("<div>Hello</div>");

    // Attachments: nested parts with filename + attachmentId are collected.
    msg.payload = {
      mimeType: "multipart/mixed",
      headers: msg.payload.headers,
      parts: [
        { mimeType: "text/plain", body: { data: b64url("hi") } },
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "application/pdf",
              filename: "doc.pdf",
              body: { attachmentId: "att-1", size: 1234 },
            },
            // filename but no attachmentId → not an attachment
            { mimeType: "image/png", filename: "inline.png", body: {} },
          ],
        },
      ],
    };
    const withAtt = gmailMessageToMailMessage(msg);
    expect(withAtt.has_attachments).toBe(true);
    expect(withAtt.attachments).toEqual([
      { attachment_id: "att-1", filename: "doc.pdf", mime_type: "application/pdf", size: 1234 },
    ]);
  });

  test("tst_gts_gmail_004 flattenMailPayload from/to/cc/bcc", () => {
    const payload: Record<string, unknown> = {
      id: "msg_1",
      from: { name: "Alice", address: "alice@x.com" },
      to: [{ name: "Bob", address: "bob@y.com" }],
      cc: [{ address: "carol@z.com" }],
      bcc: [],
    };
    flattenMailPayload(payload);
    expect(payload.from_name).toBe("Alice");
    expect(payload.from_address).toBe("alice@x.com");
    expect(payload.to_addresses).toBe("bob@y.com");
    expect(payload.cc_addresses).toBe("carol@z.com");
    expect(payload.bcc_addresses).toBe("");
    expect("from" in payload).toBe(false);
    expect("to" in payload).toBe(false);
  });

  test("tst_gts_gmail_005 no payload → convert error (skipped upstream)", () => {
    expect(() => gmailMessageToMailMessage({ id: "np" })).toThrow(
      "message np has no payload",
    );
  });
});

// ── History resolution (spec test 2) ────────────────────────────────────────

describe("history action resolution", () => {
  const added = (id: string) => ({ message: { id } });

  test("tst_gts_hist_006 delete beats add in one entry; later entries win", () => {
    // Within one entry: Deleted wins.
    let actions = resolveHistoryActions([
      { messagesAdded: [added("m1")], messagesDeleted: [added("m1")] },
    ]);
    expect(actions.get("m1")).toBe("delete");

    // Across entries: later entry overrides (delete → re-add = fetch).
    actions = resolveHistoryActions([
      { messagesDeleted: [added("m2")] },
      { messagesAdded: [added("m2")] },
    ]);
    expect(actions.get("m2")).toBe("fetch");

    // Labels only fetch when the message wasn't added/deleted anywhere yet.
    actions = resolveHistoryActions([
      { messagesDeleted: [added("m3")] },
      { labelsAdded: [added("m3")], labelsRemoved: [added("m4")] },
    ]);
    expect(actions.get("m3")).toBe("delete"); // or_insert keeps earlier delete
    expect(actions.get("m4")).toBe("fetch");

    // sortedActions is BTreeMap-ordered (byte order of ids).
    expect(sortedActions(actions).map(([id]) => id)).toEqual(["m3", "m4"]);
  });

  test("tst_gts_hist_007 forward fetch: delete envelope shape + counters carried", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?startHistoryId=100")) {
        return ok({
          history: [
            { messagesAdded: [added("mA")], messagesDeleted: [added("mZ")] },
          ],
          historyId: "999",
        });
      }
      if (url.includes("/messages/mA?format=full")) return ok(fullGmailMessage());
      throw new Error(`unexpected url ${url}`);
    };

    const r = await fetchHistoryChanges(
      "tok",
      { history_id: "100", discovered: 200, total: 500 },
      fetchFn,
    );
    // Deletes first (BTreeMap order within kind), then hydrated snapshots.
    expect(r.envelopes[0]).toEqual({
      surface: "email",
      payload: {},
      remote_id: "mZ",
      kind: "delete",
    });
    expect(r.envelopes[1].kind).toBe("snapshot");
    expect(r.envelopes[1].remote_id).toBe("mA");
    // INV-8: counters carried FORWARD, never reset; watermark advances.
    expect(r.hasMore).toBe(false);
    expect(r.nextCursor).toEqual({ history_id: "999", discovered: 200, total: 500 });
    expect(r.total).toBe(500);
    expect(r.discovered).toBe(200);
  });

  test("tst_gts_hist_008 missing history_id or HTTP 404 → historyId expired", async () => {
    const never: FetchLike = async () => {
      throw new Error("no network expected");
    };
    await expect(fetchHistoryChanges("tok", {}, never)).rejects.toThrow(
      "Gmail historyId expired (404)",
    );

    const notFound: FetchLike = async () => status(404, "gone");
    await expect(
      fetchHistoryChanges("tok", { history_id: "1" }, notFound),
    ).rejects.toThrow("Gmail historyId expired (404)");

    // Both expiry paths are CursorExpiredError so the SDK maps them to -32003.
    for (const cursor of [{}, { history_id: "1" }]) {
      const e = await fetchHistoryChanges("tok", cursor, notFound).catch((x) => x);
      expect(e).toBeInstanceOf(HistoryExpiredError);
      expect(e).toBeInstanceOf(CursorExpiredError);
    }
  });

  // The reason a history 404 must not be a plain Error: the host types it off
  // the JSON-RPC code alone. -32003 → SourceErrorKind::CursorExpired → the
  // scheduler resets to Bootstrap and re-syncs; anything else → SyncStatus
  // ::Error, which parks email sync permanently (the live-run failure this
  // fixes: state=failed, error="mcp rpc error -32000: Gmail historyId expired
  // (404)"). Wire-level: drive the real 404 through the SDK's tools/call.
  test("tst_gts_hist_008b history 404 reaches the host wire as -32003", async () => {
    const notFound: FetchLike = async () => status(404, "gone");
    const reply = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: { name: "magnis.sync.fetch", arguments: { surface: "email" } },
      },
      {
        name: "google",
        version: "0.0.1",
        surfaces: ["email"],
        fetch: async () =>
          (await fetchHistoryChanges("tok", { history_id: "1" }, notFound)) as never,
      },
    );
    const err = reply!.error as Record<string, unknown>;
    expect(err.code).toBe(CURSOR_EXPIRED_CODE);
    expect(err.code).toBe(-32003);
    expect(err.message).toBe("Gmail historyId expired (404)");
  });
});

// ── Bootstrap paging (spec test 5) ──────────────────────────────────────────

describe("email bootstrap cursor", () => {
  function pagedApi() {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.endsWith("/users/me/profile")) {
        return ok({ historyId: "h1", messagesTotal: 100 });
      }
      if (url.includes("/users/me/messages?maxResults=50")) {
        if (url.includes("pageToken=p2")) {
          return ok({ messages: [{ id: "m3" }] }); // last page
        }
        return ok({ messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "p2" });
      }
      if (url.includes("?format=full")) {
        const id = url.split("/messages/")[1].split("?")[0];
        return ok({ ...fullGmailMessage(), id });
      }
      throw new Error(`unexpected url ${url}`);
    };
    return { fetchFn, calls };
  }

  test("tst_gts_email_009 cursor ALWAYS present; total/discovered threaded", async () => {
    const { fetchFn, calls } = pagedApi();

    const p1 = await fetchMessagePage("tok", undefined, fetchFn);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toEqual({
      page_token: "p2",
      history_id: "h1",
      discovered: 2,
      total: 100,
    });
    expect(p1.total).toBe(100);
    expect(p1.discovered).toBe(2);
    expect(p1.envelopes.map((e) => e.remote_id)).toEqual(["m1", "m2"]);
    expect(p1.envelopes[0].kind).toBe("snapshot");
    expect(p1.envelopes[0].surface).toBe("email");
    // Payload is FLATTENED (from_name/from_address, joined *_addresses).
    expect(p1.envelopes[0].payload.from_address).toBe("alice@example.com");
    expect(p1.envelopes[0].payload.to_addresses).toBe(
      "bob@example.com, carol@example.com",
    );
    expect("from" in p1.envelopes[0].payload).toBe(false);

    const profileCalls = calls.filter((u) => u.endsWith("/profile")).length;
    const p2 = await fetchMessagePage("tok", p1.nextCursor, fetchFn);
    // Page 2+ never re-hits the profile (history_id read from cursor).
    expect(calls.filter((u) => u.endsWith("/profile")).length).toBe(profileCalls);
    expect(p2.hasMore).toBe(false);
    // Last page STILL returns a cursor (email cursor is never null).
    expect(p2.nextCursor).toEqual({ history_id: "h1", discovered: 3, total: 100 });
    expect(p2.discovered).toBe(3);
    expect(p2.total).toBe(100);
  });

  test("tst_gts_email_010 hydration keeps order; non-fatal skips, 429 aborts", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
      if (url.includes("/users/me/messages?maxResults=50")) {
        return ok({ messages: [{ id: "a" }, { id: "b" }, { id: "c" }] });
      }
      if (url.includes("/messages/b?")) return status(500, "boom");
      const id = url.split("/messages/")[1].split("?")[0];
      return ok({ ...fullGmailMessage(), id });
    };
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    expect(r.envelopes.map((e) => e.remote_id)).toEqual(["a", "c"]);
    // discovered counts ENUMERATED ids (page length), not surviving envelopes.
    expect(r.discovered).toBe(3);
    // No messagesTotal in profile → total null, key omitted from cursor.
    expect(r.total).toBeNull();
    expect("total" in r.nextCursor).toBe(false);

    // Fatal: a 429 during hydration aborts the whole batch, typed.
    const rateLimited: FetchLike = async (url) => {
      if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
      if (url.includes("maxResults=50")) return ok({ messages: [{ id: "a" }] });
      return status(429, "", "30");
    };
    const err = await fetchMessagePage("tok", undefined, rateLimited).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleRateLimitError);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterSecs).toBe(30);
    expect(err.message).toBe("Google rate limited: retry after 30s");
  });
});

// ── MIME build + send (spec test 6) ─────────────────────────────────────────

describe("RFC 2822 build + send", () => {
  test("tst_gts_mime_011 plain draft → CRLF headers, text/plain", () => {
    const raw = buildRawMessage(
      parseMailDraft({
        to: [{ name: "Bob", address: "bob@y.com" }],
        subject: "Hi there",
        body_text: "Hello Bob",
      }),
    );
    expect(raw).toBe(
      "To: Bob <bob@y.com>\r\n" +
        "Subject: Hi there\r\n" +
        "MIME-Version: 1.0\r\n" +
        "Content-Type: text/plain; charset=UTF-8\r\n" +
        "\r\n" +
        "Hello Bob",
    );
  });

  test("tst_gts_mime_012 non-ASCII subject/name → RFC 2047 encoded-word", () => {
    expect(mimeEncodeHeader("plain ascii")).toBe("plain ascii");
    const encoded = mimeEncodeHeader("Привет, мир");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/);
    const b64 = encoded.slice("=?UTF-8?B?".length, -2);
    expect(Buffer.from(b64, "base64").toString("utf-8")).toBe("Привет, мир");

    const raw = buildRawMessage(
      parseMailDraft({
        to: [{ name: "Миша", address: "m@x.com" }],
        cc: [{ address: "c@x.com" }],
        subject: "Привет",
        body_text: "тело",
        in_reply_to: "<orig@x.com>",
      }),
    );
    expect(raw).toContain(`Subject: ${mimeEncodeHeader("Привет")}\r\n`);
    expect(raw).toContain(`To: ${mimeEncodeHeader("Миша")} <m@x.com>\r\n`);
    expect(raw).toContain("Cc: c@x.com\r\n");
    expect(raw).toContain("In-Reply-To: <orig@x.com>\r\nReferences: <orig@x.com>\r\n");
  });

  test("tst_gts_mime_013 attachments → multipart/mixed; raw is base64url-nopad", async () => {
    const draft = parseMailDraft({
      to: [{ address: "bob@y.com" }],
      subject: "With file",
      body_text: "see attached",
      attachments: [
        {
          filename: "a.txt",
          mime_type: "text/plain",
          data: Buffer.from("file-bytes").toString("base64"),
        },
      ],
    });
    const raw = buildRawMessage(draft);
    const boundary = /boundary="([^"]+)"/.exec(raw)?.[1];
    expect(boundary).toMatch(/^----=_Part_[0-9a-f]{32}$/);
    expect(raw).toContain(`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8`);
    expect(raw).toContain('Content-Disposition: attachment; filename="a.txt"');
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(raw).toContain(Buffer.from("file-bytes").toString("base64"));
    expect(raw.endsWith(`--${boundary}--`)).toBe(true);

    // Wire body: {raw} is base64url WITHOUT padding, decodable, CRLF inside.
    let sent: string | undefined;
    const fetchFn: FetchLike = async (url, init) => {
      if (url.endsWith("/messages/send")) {
        sent = (JSON.parse(init?.body as string) as { raw: string }).raw;
        return ok({ id: "sent-1", threadId: "t-9" });
      }
      throw new Error("unexpected");
    };
    const result = await sendMessage("tok", draft, fetchFn);
    expect(result).toEqual({ message_id: "sent-1", thread_id: "t-9" });
    expect(sent).toBeDefined();
    expect(sent!).not.toMatch(/[+/=]/); // URL_SAFE_NO_PAD
    const decoded = Buffer.from(sent!, "base64url").toString("utf-8");
    expect(decoded).toContain("\r\nMIME-Version: 1.0\r\n");
    expect(decoded).toContain("Subject: With file");
  });

  test("tst_gts_mime_014 encodeBase64UrlNoPad round-trips", () => {
    const encoded = encodeBase64UrlNoPad("any carnal pleasure?"); // classic pad case
    expect(encoded).not.toContain("=");
    expect(Buffer.from(encoded, "base64url").toString("utf-8")).toBe(
      "any carnal pleasure?",
    );
  });

  test("tst_gts_mime_015 invalid draft → Invalid MailDraft payload", () => {
    expect(() => parseMailDraft({ subject: "x", body_text: "y" })).toThrow(
      /^Invalid MailDraft payload: /,
    );
    expect(() =>
      parseMailDraft({
        to: [{ address: "a@b.c" }],
        subject: "x",
        body_text: "y",
        attachments: [{ filename: "f", mime_type: "t", data: "!!!not-base64" }],
      }),
    ).toThrow(/^Invalid MailDraft payload: /);
  });
});
