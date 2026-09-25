import { describe, expect, jest, test } from "bun:test";
import {
  CURSOR_EXPIRED_CODE,
  CursorExpiredError,
  handleMessage,
  RateLimitError,
} from "@magnis/connector-sdk";
import {
  buildRawMessage,
  downloadAttachment,
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
import { buildConnectorConfig } from "../../connector";
import type { ImapMailbox, ImapRawMessage } from "./imap";

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

/**
 * @test-id: tst_src_iso_google_021
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/connector.ts::buildConnectorConfig
 * @deterministic: yes
 * @fixtures: one IMAP message and a stale Gmail profile count
 */
test("tst_src_iso_google_021 new Gmail bootstrap uses IMAP and keeps REST history catch-up", async () => {
  const urls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    urls.push(url);
    if (url.includes("oauth2.googleapis.com/token")) return ok({ access_token: "at-imap", expires_in: 3600 });
    if (url.endsWith("/profile")) return ok({ emailAddress: "user@example.com", historyId: "h1", messagesTotal: 1 });
    if (url.endsWith("/labels/SPAM")) return ok({ messagesTotal: 1 });
    if (url.endsWith("/labels/TRASH")) return ok({ messagesTotal: 0 });
    if (url.includes("/history?")) return ok({ historyId: "h2", history: [] });
    throw new Error(`unexpected REST request: ${url}`);
  };
  const raw: ImapRawMessage = {
    uid: 9,
    emailId: "12345",
    threadId: "54321",
    flags: new Set(["\\Seen"]),
    labels: new Set(["\\Inbox"]),
    internalDate: new Date("2026-09-24T10:00:00Z"),
    source: Buffer.from("Subject: IMAP mail\r\nFrom: sender@example.com\r\nContent-Type: text/plain\r\n\r\nMessage body"),
  };
  const open = async (email: string, token: string): Promise<ImapMailbox> => {
    expect([email, token]).toEqual(["user@example.com", "at-imap"]);
    return {
      uidValidity: "42",
      searchBelow: async () => [9],
      fetch: async function* () { yield raw; },
      close: async () => {},
    };
  };
  const source = buildConnectorConfig(fetchFn, open);
  const meta = { client_id: "imap-client", client_secret: "secret", refresh_token: "refresh" };
  const first = await source.fetch({ surface: "email", meta });
  expect(first.envelopes.map((envelope) => envelope.remote_id)).toEqual(["mailbox", BigInt(12345).toString(16)]);
  expect(first.envelopes[0]?.payload).toEqual({ entity_type: "mailbox", messages_total: 2, skipped: 1 });
  expect(String(first.envelopes[1]?.payload.body_text).trim()).toBe("Message body");
  expect(first.nextCursor).toEqual({ history_id: "h1" });
  expect(first.hasMore).toBe(false);
  await source.fetch({ surface: "email", direction: "forward", cursor: first.nextCursor, meta });
  expect(urls.some((url) => url.includes("/history?startHistoryId=h1"))).toBe(true);
  expect(urls.some((url) => url.includes("/messages?"))).toBe(false);
});

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
    const to1 = mail.to[1];
    if (to1 === undefined) throw new Error("mail: missing to[1]");
    expect(to1.address).toBe("carol@example.com");
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

  test("tst_gts_gmail_005 no payload → convert error", () => {
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

    // Across entries: later entry overrides (delete → re-add = live).
    actions = resolveHistoryActions([
      { messagesDeleted: [added("m2")] },
      { messagesAdded: [added("m2")] },
    ]);
    expect(actions.get("m2")).toBe("live");

    // Labels only snapshot when the message wasn't added/deleted anywhere yet.
    actions = resolveHistoryActions([
      { messagesDeleted: [added("m3")] },
      { labelsAdded: [added("m3")], labelsRemoved: [added("m4")] },
    ]);
    expect(actions.get("m3")).toBe("delete"); // or_insert keeps earlier delete
    expect(actions.get("m4")).toBe("snapshot");

    // sortedActions is BTreeMap-ordered (byte order of ids).
    expect(sortedActions(actions).map(([id]) => id)).toEqual(["m3", "m4"]);
  });

  test("tst_gts_hist_007 forward fetch: delete envelope shape, no counters on the page or the cursor", async () => {
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

    const r = await fetchHistoryChanges("tok", { history_id: "100" }, fetchFn);
    // Deletes first (BTreeMap order within kind), then hydrated live messages.
    expect(r.envelopes[0]).toEqual({
      surface: "email",
      payload: {},
      remote_id: "mZ",
      kind: "delete",
    });
    const env1 = r.envelopes[1];
    if (env1 === undefined) throw new Error("email page: missing envelope 1");
    expect(env1.kind).toBe("live");
    expect(env1.remote_id).toBe("mA");
    // The watermark advances; the page carries no counters — the host counts
    // what the Graph stamped and reads the plan from the module's receipt.
    expect(r.hasMore).toBe(false);
    expect(r.nextCursor).toEqual({ history_id: "999" });
    expect("total" in r).toBe(false);
    expect("discovered" in r).toBe(false);
  });

  /**
   * @test-id: tst_src_gmail_011
   * @scenario: scn_gmail_trigger_001
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchHistoryChanges
   * @deterministic: yes
   * @fixtures: inline Gmail History API responses
   *
   * Test environment: Google source connector email forward-sync
   * Clients: direct calls
   * Mocks: fixture-backed FetchLike
   * Data: one newly-added message and one label-only change
   */
  test("tst_src_gmail_011 forward sync marks new mail live but label-only changes snapshot", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.includes("/history?startHistoryId=100")) {
        return ok({
          history: [
            {
              messagesAdded: [added("new-mail")],
              labelsAdded: [added("existing-mail")],
            },
          ],
          historyId: "101",
        });
      }
      if (url.includes("/messages/new-mail?format=full")) {
        return ok({ ...fullGmailMessage(), id: "new-mail" });
      }
      if (url.includes("/messages/existing-mail?format=full")) {
        return ok({ ...fullGmailMessage(), id: "existing-mail" });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const r = await fetchHistoryChanges("tok", { history_id: "100" }, fetchFn);
    const byId = new Map(r.envelopes.map((envelope) => [envelope.remote_id, envelope]));

    expect(byId.get("new-mail")?.kind).toBe("live");
    expect(byId.get("existing-mail")?.kind).toBe("snapshot");
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
      // The two labels the list leaves out: what the plan skips.
      if (url.endsWith("/users/me/labels/SPAM")) return ok({ id: "SPAM", messagesTotal: 7 });
      if (url.endsWith("/users/me/labels/TRASH")) return ok({ id: "TRASH", messagesTotal: 3 });
      if (url.includes("/users/me/messages?maxResults=50")) {
        if (url.includes("pageToken=p2")) {
          return ok({ messages: [{ id: "m3" }] }); // last page
        }
        return ok({ messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "p2" });
      }
      if (url.includes("?format=full")) {
        const seg = url.split("/messages/")[1];
        if (seg === undefined)
          throw new Error("gmail url: missing message segment");
        const id = seg.split("?")[0];
        return ok({ ...fullGmailMessage(), id });
      }
      throw new Error(`unexpected url ${url}`);
    };
    return { fetchFn, calls };
  }

  /**
   * @test-id: tst_src_iso_google_001
   * @scenario: scn_google_pull_001
   * @covers: sources/google/src/connector.ts::buildConnectorConfig
   * @deterministic: yes
   * @fixtures: two IMAP pages and two distinct credential tuples
   */
  test("tst_src_iso_google_001 one token serves two ordered pages per credential", async () => {
    const tokenCalls: string[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        const refreshToken = new URLSearchParams(String(init?.body)).get("refresh_token");
        if (refreshToken === null) throw new Error("missing refresh token");
        tokenCalls.push(refreshToken);
        return ok({ access_token: `access-${refreshToken}`, expires_in: 3600 });
      }
      if (url.endsWith("/profile")) return ok({ emailAddress: "user@example.com", historyId: "h1", messagesTotal: 101 });
      if (url.includes("/labels/")) return ok({ messagesTotal: 0 });
      throw new Error(`unexpected REST request: ${url}`);
    };
    const messages = Array.from({ length: 101 }, (_, index): ImapRawMessage => ({
      uid: index + 1,
      emailId: String(10_000 + index + 1),
      threadId: String(20_000 + index + 1),
      flags: new Set(),
      labels: new Set(),
      internalDate: new Date("2026-09-24T10:00:00Z"),
      source: Buffer.from(`Subject: Mail ${index + 1}\r\nContent-Type: text/plain\r\n\r\nBody`),
    }));
    const open = async (): Promise<ImapMailbox> => ({
      uidValidity: "42",
      searchBelow: async (before) => messages.map((message) => message.uid).filter((uid) => before === undefined || uid < before),
      fetch: async function* (uids) { for (const message of messages.filter((item) => uids.includes(item.uid))) yield message; },
      close: async () => {},
    });
    const source = buildConnectorConfig(fetchFn, open);
    const meta = { client_id: "gmail-pages-client", client_secret: "secret", refresh_token: "gmail-pages-a" };
    const first = await source.fetch({ surface: "email", meta });
    const second = await source.fetch({ surface: "email", cursor: first.nextCursor, meta });
    expect(first.envelopes).toHaveLength(101);
    expect(first.envelopes[1]?.remote_id).toBe(BigInt(10_101).toString(16));
    expect(second.envelopes.map((e) => e.remote_id)).toEqual([BigInt(10_001).toString(16)]);
    expect(tokenCalls).toEqual(["gmail-pages-a"]);
    await source.fetch({ surface: "email", meta: { ...meta, refresh_token: "gmail-pages-b" } });
    expect(tokenCalls).toEqual(["gmail-pages-a", "gmail-pages-b"]);
  });

  /** @test-id: tst_gts_email_009
   * @scenario: scn_google_sync_001
   * @covers: fetchMessagePage mailbox envelope and cursor
   * @deterministic: yes
   * @fixtures: a profile of 100 messages, 7 in SPAM and 3 in TRASH, two list pages
   */
  test("tst_gts_email_009 cursor ALWAYS present; the mailbox states its count first on the first page only", async () => {
    const { fetchFn, calls } = pagedApi();

    const p1 = await fetchMessagePage("tok", undefined, fetchFn);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toEqual({ page_token: "p2", history_id: "h1" });
    expect("total" in p1).toBe(false);
    expect("discovered" in p1).toBe(false);
    // The mailbox envelope precedes the messages: the whole mailbox as the
    // profile counts it, and the SPAM and TRASH messages the list leaves out.
    expect(p1.envelopes[0]).toEqual({
      surface: "email",
      kind: "snapshot",
      remote_id: "mailbox",
      payload: { entity_type: "mailbox", messages_total: 100, skipped: 10 },
    });
    expect(p1.envelopes.slice(1).map((e) => e.remote_id)).toEqual(["m1", "m2"]);
    const env0 = p1.envelopes[1];
    if (env0 === undefined) throw new Error("email page: missing envelope 1");
    expect(env0.kind).toBe("snapshot");
    expect(env0.surface).toBe("email");
    // Payload is FLATTENED (from_name/from_address, joined *_addresses).
    expect(env0.payload.from_address).toBe("alice@example.com");
    expect(env0.payload.to_addresses).toBe(
      "bob@example.com, carol@example.com",
    );
    expect("from" in env0.payload).toBe(false);

    const profileCalls = calls.filter((u) => u.endsWith("/profile") || u.includes("/labels/")).length;
    expect(profileCalls).toBe(3);
    const p2 = await fetchMessagePage("tok", p1.nextCursor, fetchFn);
    // Page 2+ never re-hits the profile or the labels (history_id read from cursor).
    expect(calls.filter((u) => u.endsWith("/profile") || u.includes("/labels/")).length).toBe(profileCalls);
    expect(p2.hasMore).toBe(false);
    expect(p2.envelopes.map((e) => e.remote_id)).toEqual(["m3"]);
    // Last page STILL returns a cursor (email cursor is never null).
    expect(p2.nextCursor).toEqual({ history_id: "h1" });
  });

  /**
   * @test-id: tst_src_iso_google_003
   * @scenario: scn_google_pull_001
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchMessagePage
   * @deterministic: yes
   * @fixtures: scripted message-get 404, 500, and malformed message
   */
  test("tst_src_iso_google_003 only a concurrent 404 may be omitted", async () => {
    const fetchFn: FetchLike = async (url) => {
      if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
      if (url.includes("/labels/")) return ok({ id: "SPAM", messagesTotal: 0 });
      if (url.includes("/users/me/messages?maxResults=50")) {
        return ok({ messages: [{ id: "a" }, { id: "b" }, { id: "c" }] });
      }
      if (url.includes("/messages/b?")) return status(404, "gone");
      const seg = url.split("/messages/")[1];
      if (seg === undefined)
        throw new Error("gmail url: missing message segment");
      const id = seg.split("?")[0];
      return ok({ ...fullGmailMessage(), id });
    };
    const r = await fetchMessagePage("tok", undefined, fetchFn);
    // No messagesTotal in the profile: the mailbox states no count, and the
    // cursor carries none.
    expect(r.envelopes.map((e) => e.remote_id)).toEqual(["a", "c"]);
    expect(r.nextCursor).toEqual({ history_id: "h1" });

    const hardFailure: FetchLike = async (url) => {
      if (url.includes("/messages/b?")) return status(500, "boom");
      return fetchFn(url);
    };
    await expect(fetchMessagePage("tok", undefined, hardFailure)).rejects.toThrow("boom");

    const malformed: FetchLike = async (url) => {
      if (url.includes("/messages/b?")) return ok({ id: "b", payload: { headers: [{ name: "Subject" }] } });
      return fetchFn(url);
    };
    await expect(fetchMessagePage("tok", undefined, malformed)).rejects.toThrow();

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

  /**
   * @test-id: tst_src_iso_google_004
   * @scenario: scn_google_pull_001
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchEnvelopes
   * @deterministic: yes
   * @fixtures: first of twelve hydration requests is rate limited; the rest stay queued
   */
  test("tst_src_iso_google_004 stops queued hydration after the first hold", async () => {
    const started: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
      if (url.includes("maxResults=50")) {
        return ok({ messages: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}` })) });
      }
      const id = url.split("/messages/")[1]?.split("?")[0];
      if (id === undefined) throw new Error("missing message id");
      started.push(id);
      if (id === "m0") return status(429, "quota", "17");
      return ok({ ...fullGmailMessage(), id });
    };
    const page = fetchMessagePage("tok", undefined, fetchFn);
    await expect(page).rejects.toBeInstanceOf(GoogleRateLimitError);
    expect(started).toEqual(["m0"]);
  });

  /**
   * @test-id: tst_src_iso_google_016
   * @scenario: scn_google_pull_004
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchEnvelopes
   * @deterministic: yes
   * @fixtures: two scripted eight-message pages and a simulated clock
   */
  test("tst_src_iso_google_016 spaces full-message requests across pages", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-24T00:00:00Z"));
    try {
      const starts: number[] = [];
      const fetchFn: FetchLike = async (url) => {
        if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
        if (url.includes("/labels/")) return ok({ messagesTotal: 0 });
        if (url.includes("maxResults=50")) {
          const second = url.includes("pageToken=next");
          return ok({
            messages: Array.from({ length: 8 }, (_, i) => ({ id: `m${second ? i + 8 : i}` })),
            nextPageToken: second ? undefined : "next",
          });
        }
        if (url.includes("?format=full")) {
          starts.push(Date.now());
          return ok(fullGmailMessage());
        }
        throw new Error(`unexpected Gmail URL: ${url}`);
      };
      const advanceUntil = async (count: number): Promise<void> => {
        for (let i = 0; i < 40; i += 1) {
          for (let j = 0; j < 8; j += 1) await Promise.resolve();
          if (starts.length >= count) return;
          jest.advanceTimersByTime(250);
        }
        throw new Error(`only ${starts.length} of ${count} Gmail requests started`);
      };
      const first = fetchMessagePage("tok", undefined, fetchFn);
      await advanceUntil(8);
      const firstPage = await first;
      const second = fetchMessagePage("tok", firstPage.nextCursor, fetchFn);
      await advanceUntil(16);
      await second;
      expect(starts).toHaveLength(16);
      expect(starts.every((start, i) => i === 0 || start - starts[i - 1]! >= 250)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * @test-id: tst_src_iso_google_017
   * @scenario: scn_google_pull_004
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchEnvelopes
   * @deterministic: yes
   * @fixtures: twelve messages; one scripted quota hold on the ninth read
   */
  test("tst_src_iso_google_017 a quota retry reuses completed message reads", async () => {
    const reads = new Map<string, number>();
    let held = false;
    const fetchFn: FetchLike = async (url) => {
      if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
      if (url.includes("/labels/")) return ok({ messagesTotal: 0 });
      if (url.includes("maxResults=50")) {
        return ok({ messages: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}` })) });
      }
      const id = url.split("/messages/")[1]?.split("?")[0];
      if (id === undefined) throw new Error(`unexpected Gmail URL: ${url}`);
      reads.set(id, (reads.get(id) ?? 0) + 1);
      if (id === "m8" && !held) {
        held = true;
        return status(429, "quota", "1");
      }
      return ok({ ...fullGmailMessage(), id });
    };
    await expect(fetchMessagePage("tok", undefined, fetchFn)).rejects.toBeInstanceOf(GoogleRateLimitError);
    const completed = new Map([...reads].filter(([id]) => id !== "m8"));
    const retried = await fetchMessagePage("tok", undefined, fetchFn);
    expect(retried.envelopes.filter((envelope) => envelope.remote_id !== "mailbox")).toHaveLength(12);
    for (const [id, count] of completed) expect(reads.get(id)).toBe(count);
  }, 15_000);

  /**
   * @test-id: tst_src_iso_google_013
   * @scenario: scn_google_pull_004
   * @covers: sources/google/src/surfaces/email/gmail.ts::fetchMessagePage
   * @deterministic: yes
   * @fixtures: Gmail list and get return quota 403 without Retry-After
   */
  test("tst_src_iso_google_013 list and get propagate quota 403 as a typed hold", async () => {
    const quota = JSON.stringify({ error: { details: [{
      reason: "RATE_LIMIT_EXCEEDED",
      metadata: { quota_unit: "1/min/{project}/{user}", window_start_time: "1" },
    }] } });
    for (const failingRequest of ["list", "get"]) {
      const fetchFn: FetchLike = async (url) => {
        if (url.endsWith("/users/me/profile")) return ok({ historyId: "h1" });
        if (url.includes("/labels/")) return ok({ id: "SPAM", messagesTotal: 0 });
        if (url.includes("maxResults=50")) {
          return failingRequest === "list" ? status(403, quota) : ok({ messages: [{ id: "m1" }] });
        }
        if (url.includes("/messages/m1?")) return status(403, quota);
        throw new Error(`unexpected Gmail URL: ${url}`);
      };
      await expect(fetchMessagePage("tok", { history_id: "h1" }, fetchFn))
        .rejects.toBeInstanceOf(GoogleRateLimitError);
    }
  });

  /**
   * @test-id: tst_src_iso_google_014
   * @scenario: scn_google_pull_004
   * @covers: sources/google/src/surfaces/email/gmail.ts::downloadAttachment
   * @deterministic: yes
   * @fixtures: Gmail attachment endpoint returns quota 403 without Retry-After
   */
  test("tst_src_iso_google_014 attachment download preserves a quota hold", async () => {
    const quota = JSON.stringify({ error: { details: [{
      reason: "RATE_LIMIT_EXCEEDED",
      metadata: { quota_unit: "1/min/{project}/{user}", window_start_time: "1" },
    }] } });
    const fetchFn: FetchLike = async () => status(403, quota);
    await expect(downloadAttachment("tok", "m1", "att-1", fetchFn))
      .rejects.toBeInstanceOf(GoogleRateLimitError);
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
