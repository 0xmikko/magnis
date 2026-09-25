import { expect, test } from "bun:test";
import { downloadImapAttachment, readImapPage, type ImapMailbox, type ImapRawMessage } from "./imap";
import { gmailMessageToMailMessage } from "./gmail";

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
    fetch: async function* (uids) { for (const message of messages.filter((entry) => uids.includes(entry.uid)).reverse()) yield message; },
    close: async () => {},
  };
}

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
  const first = await readImapPage("user@example.com", "token", undefined, open);
  expect(first.messages).toHaveLength(100);
  expect(first.messages[0]?.id).toBe(BigInt(10_101).toString(16));
  expect(first.messages[0]?.threadId).toBe(BigInt(20_101).toString(16));
  expect(first.messages[0]?.payload?.headers).toContainEqual({ name: "Subject", value: "Mail 101" });
  expect(first.nextCursor).toEqual({ uid_validity: "42", before_uid: 2 });
  expect(first.hasMore).toBe(true);

  const second = await readImapPage("user@example.com", "token", first.nextCursor!, open);
  expect(second.messages.map((message) => message.id)).toEqual([BigInt(10_001).toString(16)]);
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
  await expect(readImapPage("user@example.com", "token", { uid_validity: "41", before_uid: 10 }, async () => mailbox([raw(1)], "42")))
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
    'Subject: Attached\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n' +
    '--b\r\nContent-Type: text/plain\r\n\r\nHello\r\n' +
    '--b\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="note.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    'YXR0YWNobWVudA==\r\n--b--\r\n',
  );
  const open = async () => mailbox([message]);
  const page = await readImapPage("user@example.com", "token", undefined, open);
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
  message.source = Buffer.from("Subject: A\u0000B\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHi\u0000there");
  const page = await readImapPage("user@example.com", "token", undefined, async () => mailbox([message]));
  const mail = gmailMessageToMailMessage(page.messages[0]!);
  expect(mail.subject).toBe("AB");
  expect(mail.body_text?.trim()).toBe("Hithere");
});
