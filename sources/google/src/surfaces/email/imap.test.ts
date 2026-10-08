import { expect, test } from "bun:test";
import { downloadImapAttachment, readImapPage, type ImapMailbox, type ImapRawMessage } from "./imap";
import { gmailMessageToMailMessage } from "./gmail";
import { buildConnectorConfig } from "../../connector";
import type { FetchLike } from "../../http";

const allSenders = { choices: {}, unknownSenderEnabled: true };

const raw = (uid: number): ImapRawMessage => ({
  uid,
  emailId: String(10_000 + uid),
  threadId: String(20_000 + uid),
  flags: new Set(uid === 1 ? [] : ["\\Seen"]),
  labels: new Set(["INBOX"]),
  internalDate: new Date("2026-09-24T10:00:00Z"),
  source: Buffer.from(`Subject: Mail ${uid}\r\nFrom: Sender <sender@example.com>\r\nTo: User <user@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBody ${uid}`),
});

function mailbox(messages: ImapRawMessage[], uidValidity = "42"): ImapMailbox {
  return {
    uidValidity,
    searchBelow: async (uid) => messages.map((message) => message.uid).filter((value) => uid === undefined || value < uid),
    fetchHeaders: async function* (uids) { for (const message of messages.filter((entry) => uids.includes(entry.uid))) yield { uid: message.uid, emailId: message.emailId, headers: message.source.subarray(0, message.source.indexOf("\r\n\r\n") + 4) }; },
    fetch: async function* (uids) { for (const message of messages.filter((entry) => uids.includes(entry.uid)).reverse()) yield message; },
    close: async () => {},
  };
}

test("tst_src_communication_002 IMAP preserves system-label evidence", async () => {
  for (const [labels, kinds] of [
    [["\\Inbox"], ["received"]],
    [["\\Sent"], ["sent"]],
    [["\\Sent", "\\Inbox"], ["sent", "received"]],
    [["\\Drafts", "\\Inbox"], []],
  ] satisfies [string[], string[]][]) {
    const message = { ...raw(1), labels: new Set(labels) };
    const page = await readImapPage("user@example.com", "token", undefined, allSenders, async () => mailbox([message]));
    const hydrated = page.messages[0];
    if (!hydrated) throw new Error("expected hydrated message");
    expect(gmailMessageToMailMessage(hydrated)).toHaveProperty("communication", kinds.map((kind) => ({
      kind, occurredAt: "2026-09-24T10:00:00Z",
    })));
  }
});

/**
 * @test-id: tst_src_iso_google_018
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::readImapPage
 * @deterministic: yes
 * @fixtures: scripted IMAP mailbox with 101 messages
 */
test("tst_src_iso_google_018 IMAP pages preserve Gmail IDs, MIME and cursor across reconnect", async () => {
  const messages = Array.from({ length: 101 }, (_, index) => raw(index + 1));
  const open = async () => mailbox(messages);
  const first = await readImapPage("user@example.com", "token", undefined, allSenders, open);
  expect(first.messages).toHaveLength(100);
  expect(first.remaining).toBe(101);
  expect(first.messages[0]?.id).toBe(BigInt(10_101).toString(16));
  expect(first.messages[0]?.threadId).toBe(BigInt(20_101).toString(16));
  expect(first.messages[0]?.payload?.headers).toContainEqual({ name: "Subject", value: "Mail 101" });
  expect(first.nextCursor).toEqual({ uid_validity: "42", before_uid: 2 });
  expect(first.hasMore).toBe(true);

  const second = await readImapPage("user@example.com", "token", first.nextCursor!, allSenders, open);
  expect(second.messages.map((message) => message.id)).toEqual([BigInt(10_001).toString(16)]);
  expect(second.remaining).toBe(1);
  expect(second.messages[0]?.labelIds).toContain("UNREAD");
  expect(second.nextCursor).toBeNull();
  expect(second.hasMore).toBe(false);
});

/**
 * @test-id: tst_src_iso_google_019
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::readImapPage
 * @deterministic: yes
 * @fixtures: mailbox recreated with a different UIDVALIDITY
 */
test("tst_src_iso_google_019 changed UIDVALIDITY refuses the old IMAP cursor", async () => {
  await expect(readImapPage("user@example.com", "token", { uid_validity: "41", before_uid: 10 }, allSenders, async () => mailbox([raw(1)], "42")))
    .rejects.toThrow("UIDVALIDITY");
});

/**
 * @test-id: tst_src_iso_google_020
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::downloadImapAttachment
 * @deterministic: yes
 * @fixtures: multipart message with one historical attachment
 */
test("tst_src_iso_google_020 IMAP attachment reads the exact message and mailbox generation", async () => {
  const message = raw(7);
  message.source = Buffer.from(
    'From: sender@example.com\r\nSubject: Attached\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n' +
    '--b\r\nContent-Type: text/plain\r\n\r\nHello\r\n' +
    '--b\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="note.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    'YXR0YWNobWVudA==\r\n--b--\r\n',
  );
  const open = async () => mailbox([message]);
  const page = await readImapPage("user@example.com", "token", undefined, allSenders, open);
  const attachmentId = page.messages[0]?.payload?.parts?.find((part) => part.filename === "note.txt")?.body?.attachmentId;
  expect(attachmentId).toBe("imap:42:7:0");
  expect(Buffer.from(await downloadImapAttachment("user@example.com", "token", page.messages[0]!.id, attachmentId!, open)).toString())
    .toBe("attachment");
  await expect(downloadImapAttachment("user@example.com", "token", "wrong-id", attachmentId!, open)).rejects.toThrow();
});

/**
 * @test-id: tst_src_iso_google_022
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::readImapPage
 * @deterministic: yes
 * @fixtures: one MIME message containing NUL in a header and body
 */
test("tst_src_iso_google_022 IMAP removes PostgreSQL-invalid NUL from MIME text", async () => {
  const message = raw(8);
  message.source = Buffer.from("From: sender@example.com\r\nSubject: A\u0000B\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHi\u0000there");
  const page = await readImapPage("user@example.com", "token", undefined, allSenders, async () => mailbox([message]));
  const mail = gmailMessageToMailMessage(page.messages[0]!);
  expect(mail.subject).toBe("AB");
  expect(mail.body_text?.trim()).toBe("Hithere");
});

/**
 * @test-id: tst_src_iso_google_023
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::readImapPage
 * @deterministic: yes
 * @fixtures: one IMAP label containing an unpaired low surrogate
 */
test("tst_src_iso_google_023 IMAP repairs PostgreSQL-invalid Unicode in labels", async () => {
  const message = raw(9);
  message.labels.add("broken\uDC00label");
  const page = await readImapPage("user@example.com", "token", undefined, allSenders, async () => mailbox([message]));
  const mail = gmailMessageToMailMessage(page.messages[0]!);
  expect(mail.labels).toContain("broken\uFFFDlabel");
  expect(JSON.stringify(mail)).not.toContain("\\udc00");
});

/**
 * @test-id: tst_src_iso_google_024
 * @scenario: scn_google_pull_001
 * @covers: sources/google/src/surfaces/email/imap.ts::readImapPage
 * @deterministic: yes
 * @fixtures: an emoji split by the IMAP snippet boundary
 */
test("tst_src_iso_google_024 IMAP snippet keeps valid Unicode at its boundary", async () => {
  const message = raw(10);
  message.source = Buffer.from("From: sender@example.com\r\nSubject: Split\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + "a".repeat(119) + "😀");
  const page = await readImapPage("user@example.com", "token", undefined, allSenders, async () => mailbox([message]));
  expect(page.messages[0]?.snippet).toBe("a".repeat(119) + "😀");
});

/**
 * @test-id: tst_src_google_sender_sync_002
 * @scenario: scn_google_sync_001
 * @covers: readImapPage, buildConnectorConfig
 * @deterministic: yes
 * @fixtures: header and full-body requests observed separately for three senders
 */
test("tst_src_google_sender_sync_002 IMAP downloads only enabled bodies after header selection", async () => {
  const messages = [raw(1), raw(2), raw(3)];
  for (const [index, message] of messages.entries()) {
    const address = ["a@example.com", "b@example.com", "new@example.com"][index];
    message.source = Buffer.from(`From: Name <${address}>\r\nSubject: S\r\n\r\nBody`);
  }
  const base = mailbox(messages);
  const bodies: number[] = [];
  const headers: number[] = [];
  const open = async () => ({
    ...base,
    fetchHeaders: async function* (uids: number[]) {
      headers.push(...uids);
      for (const message of messages.filter((item) => uids.includes(item.uid))) {
        yield { uid: message.uid, emailId: message.emailId, headers: message.source.subarray(0, message.source.indexOf("\r\n\r\n") + 4) };
      }
    },
    fetch: async function* (uids: number[]) { bodies.push(...uids); yield* base.fetch(uids); },
  });
  const fetchFn: FetchLike = async (url) => {
    const body = url.includes("oauth2.googleapis.com/token") ? { access_token: "imap-filter-token", expires_in: 3600 }
      : url.endsWith("/profile") ? { emailAddress: "user@example.com", historyId: "h1", messagesTotal: 3 }
      : url.includes("/labels/") ? { messagesTotal: 0 } : null;
    if (body === null) throw new Error(`Unexpected REST request ${url}`);
    return new Response(JSON.stringify(body));
  };
  const page = await buildConnectorConfig(fetchFn, open).fetch({
    surface: "email", senderSync: { choices: { "a@example.com": true, "b@example.com": false }, unknownSenderEnabled: false },
    meta: { client_id: "imap-filter-client", client_secret: "secret", refresh_token: "imap-filter-refresh" },
  });
  expect(bodies).toEqual([1]);
  expect(headers).toEqual([3, 2, 1]);
  expect(page.nextCursor).toEqual({ history_id: "h1" });
  expect(page.envelopes.find((item) => item.remote_id === BigInt(10_003).toString(16))?.payload).toEqual({ entity_type: "sender", from_address: "new@example.com", from_name: "Name" });
  expect(page.envelopes.some((item) => item.remote_id === BigInt(10_002).toString(16))).toBe(false);
});

/**
 * @test-id: tst_src_google_sender_sync_006
 * @scenario: scn_google_sync_001
 * @covers: readImapPage
 * @deterministic: yes
 * @fixtures: 101 stopped messages; missing header response; mismatched full response
 */
test("tst_src_google_sender_sync_006 stopped IMAP pages advance but incomplete or mismatched data fails", async () => {
  const base = mailbox(Array.from({ length: 101 }, (_, index) => raw(index + 1)));
  const bodies: number[] = [];
  const open = async () => ({ ...base, fetch: async function* (uids: number[]) { bodies.push(...uids); yield* base.fetch(uids); } });
  const selection = { choices: { "sender@example.com": false }, unknownSenderEnabled: false };
  const first = await readImapPage("me@example.com", "token", undefined, selection, open);
  expect(first.messages).toEqual([]);
  expect(first.discoveries).toEqual([]);
  expect(first.nextCursor).toEqual({ uid_validity: "42", before_uid: 2 });
  const second = await readImapPage("me@example.com", "token", first.nextCursor!, selection, open);
  expect(second.hasMore).toBe(false);
  expect(bodies).toEqual([]);
  await expect(readImapPage("me@example.com", "token", undefined, allSenders, async () => ({
    ...mailbox([raw(1)]), fetchHeaders: async function* () {},
  }))).rejects.toThrow("header response is incomplete");
  const wrong = raw(1);
  wrong.source = Buffer.from("From: stopped@example.com\r\n\r\nWrong body");
  await expect(readImapPage("me@example.com", "token", undefined, allSenders, async () => ({
    ...mailbox([raw(1)]), fetch: async function* () { yield wrong; },
  }))).rejects.toThrow("sender changed");
});
