import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";
import type { GmailMessage } from "./gmail";

const PAGE_SIZE = 100;

export interface ImapRawMessage {
  uid: number;
  emailId: string;
  threadId: string;
  flags: Set<string>;
  labels: Set<string>;
  internalDate: Date;
  source: Buffer;
}

export interface ImapMailbox {
  uidValidity: string;
  searchBelow(uid: number | undefined): Promise<number[]>;
  fetch(uids: number[]): AsyncIterable<ImapRawMessage>;
  close(): Promise<void>;
}

export type OpenImapMailbox = (email: string, accessToken: string) => Promise<ImapMailbox>;

export interface ImapPage {
  messages: GmailMessage[];
  nextCursor: { uid_validity: string; before_uid: number } | null;
  hasMore: boolean;
}

/** Open only Gmail's special-use All Mail mailbox; folder names are localized. */
export async function openGoogleImapMailbox(email: string, accessToken: string): Promise<ImapMailbox> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, accessToken },
    logger: false,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  await client.connect();
  try {
    const allMail = (await client.list()).find((entry) => entry.specialUse === "\\All");
    if (allMail === undefined) throw new Error("Gmail IMAP All Mail mailbox not found");
    const selected = await client.mailboxOpen(allMail.path, { readOnly: true });
    return {
      uidValidity: selected.uidValidity.toString(),
      searchBelow: async (uid): Promise<number[]> => {
        if (uid !== undefined && uid <= 1) return [];
        const found = await client.search({ uid: uid === undefined ? "1:*" : `1:${String(uid - 1)}` }, { uid: true });
        if (!Array.isArray(found)) throw new Error("Gmail IMAP UID SEARCH did not return a list");
        return found;
      },
      fetch: async function* (uids): AsyncGenerator<ImapRawMessage> {
        if (uids.length === 0) return;
        for await (const message of client.fetch(uids.join(","), {
          uid: true,
          flags: true,
          labels: true,
          internalDate: true,
          source: true,
          threadId: true,
        }, { uid: true })) {
          if (message.emailId === undefined || message.threadId === undefined || message.source === undefined || message.internalDate === undefined) {
            throw new Error(`Gmail IMAP message ${String(message.uid)} lacks ID, thread, source or date`);
          }
          yield {
            uid: message.uid,
            emailId: message.emailId,
            threadId: message.threadId,
            flags: message.flags ?? new Set(),
            labels: message.labels ?? new Set(),
            internalDate: new Date(message.internalDate),
            source: message.source,
          };
        }
      },
      close: async (): Promise<void> => { await client.logout(); },
    };
  } catch (error) {
    await client.logout();
    throw error;
  }
}

function gmailHexId(decimal: string): string {
  if (!/^\d+$/.test(decimal)) throw new Error(`Gmail IMAP ID is not decimal: ${decimal}`);
  return BigInt(decimal).toString(16);
}

// PostgreSQL JSONB cannot store U+0000, which is legal in a MIME text part.
function stripNul(value: string): string {
  return value.replaceAll("\u0000", "");
}

async function toGmailMessage(raw: ImapRawMessage, uidValidity: string): Promise<GmailMessage> {
  const parsed = await PostalMime.parse(raw.source);
  const text = stripNul(parsed.text ?? "");
  const html = stripNul(parsed.html ?? "");
  const parts = [
    ...(text ? [{ mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } }] : []),
    ...(html ? [{ mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } }] : []),
    ...parsed.attachments.map((attachment, index) => ({
      mimeType: stripNul(attachment.mimeType),
      filename: stripNul(attachment.filename ?? ""),
      body: {
        attachmentId: `imap:${uidValidity}:${String(raw.uid)}:${String(index)}`,
        size: typeof attachment.content === "string" ? Buffer.byteLength(attachment.content) : attachment.content.byteLength,
      },
    })),
  ];
  const labels = [...raw.labels].map((label) => label === "\\Inbox" ? "INBOX" : label);
  if (!raw.flags.has("\\Seen")) labels.push("UNREAD");
  if (raw.flags.has("\\Flagged")) labels.push("STARRED");
  return {
    id: gmailHexId(raw.emailId),
    threadId: gmailHexId(raw.threadId),
    labelIds: labels,
    snippet: text.slice(0, 120),
    internalDate: String(raw.internalDate.getTime()),
    payload: {
      mimeType: "multipart/mixed",
      headers: parsed.headers.map((header) => ({ name: stripNul(header.originalKey), value: stripNul(header.value) })),
      parts,
    },
  };
}

export async function readImapPage(
  email: string,
  accessToken: string,
  cursor: { uid_validity: string; before_uid: number } | undefined,
  openMailbox: OpenImapMailbox = openGoogleImapMailbox,
): Promise<ImapPage> {
  const mailbox = await openMailbox(email, accessToken);
  try {
    // @tested-by: tst_src_iso_google_018, tst_src_iso_google_019
    // @invariant: a persisted UID cursor is valid only for its original mailbox.
    if (cursor !== undefined && mailbox.uidValidity !== cursor.uid_validity) {
      throw new Error("Gmail IMAP UIDVALIDITY changed during bootstrap");
    }
    const uids = (await mailbox.searchBelow(cursor?.before_uid)).sort((a, b) => b - a);
    const selected = uids.slice(0, PAGE_SIZE);
    const fetched = new Map<number, GmailMessage>();
    for await (const raw of mailbox.fetch(selected)) {
      fetched.set(raw.uid, await toGmailMessage(raw, mailbox.uidValidity));
    }
    const messages = selected.map((uid) => fetched.get(uid)).filter((message): message is GmailMessage => message !== undefined);
    const hasMore = uids.length > PAGE_SIZE;
    const lastUid = selected.at(-1);
    return {
      messages,
      nextCursor: hasMore && lastUid !== undefined ? { uid_validity: mailbox.uidValidity, before_uid: lastUid } : null,
      hasMore,
    };
  } finally {
    await mailbox.close();
  }
}

export async function downloadImapAttachment(
  email: string,
  accessToken: string,
  messageId: string,
  attachmentId: string,
  openMailbox: OpenImapMailbox = openGoogleImapMailbox,
): Promise<Uint8Array> {
  const match = /^imap:(\d+):([1-9]\d*):(\d+)$/.exec(attachmentId);
  if (match === null) throw new Error("Invalid Gmail IMAP attachment ID");
  const uidValidity = match[1];
  const uid = Number(match[2]);
  const index = Number(match[3]);
  if (uidValidity === undefined || !Number.isSafeInteger(uid) || !Number.isSafeInteger(index)) {
    throw new Error("Invalid Gmail IMAP attachment ID");
  }
  const mailbox = await openMailbox(email, accessToken);
  try {
    // @tested-by: tst_src_iso_google_020
    // @invariant: a historical attachment belongs to one mailbox generation and Gmail message.
    if (mailbox.uidValidity !== uidValidity) throw new Error("Gmail IMAP attachment UIDVALIDITY changed");
    for await (const raw of mailbox.fetch([uid])) {
      if (gmailHexId(raw.emailId) !== messageId) throw new Error("Gmail IMAP attachment message ID mismatch");
      const parsed = await PostalMime.parse(raw.source, { attachmentEncoding: "arraybuffer" });
      const attachment = parsed.attachments[index];
      if (attachment === undefined) throw new Error("Gmail IMAP attachment not found");
      if (typeof attachment.content === "string") throw new Error("Gmail IMAP attachment content is not binary");
      return new Uint8Array(attachment.content);
    }
    throw new Error("Gmail IMAP attachment message not found");
  } finally {
    await mailbox.close();
  }
}
