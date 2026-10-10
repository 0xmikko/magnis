import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";
import type { Envelope, FetchArgs } from "@magnis/connector-sdk";
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
  fetchHeaders(uids: number[]): AsyncIterable<ImapHeaderMessage>;
  fetch(uids: number[]): AsyncIterable<ImapRawMessage>;
  close(): Promise<void>;
}

export interface ImapHeaderMessage extends Pick<ImapRawMessage, "uid" | "emailId"> {
  headers: Buffer;
}

export type OpenImapMailbox = (email: string, accessToken: string) => Promise<ImapMailbox>;

export interface ImapPage {
  messages: GmailMessage[];
  discoveries: Envelope[];
  remaining: number;
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
      fetchHeaders: async function* (uids): AsyncGenerator<ImapHeaderMessage> {
        if (uids.length === 0) return;
        for await (const message of client.fetch(uids.join(","), { uid: true, threadId: true, headers: ["From"] }, { uid: true })) {
          if (message.emailId === undefined || message.headers === undefined) throw new Error(`Gmail IMAP message ${String(message.uid)} lacks ID or From headers`);
          yield { uid: message.uid, emailId: message.emailId, headers: message.headers };
        }
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

// PostgreSQL JSONB requires Unicode scalar text without U+0000.
function jsonbText(value: string): string {
  return value.replaceAll("\u0000", "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

async function toGmailMessage(raw: ImapRawMessage, uidValidity: string, expectedSender: string): Promise<GmailMessage> {
  const parsed = await PostalMime.parse(raw.source);
  if (parsed.from?.address?.trim().toLowerCase() !== expectedSender) throw new Error("Gmail IMAP sender changed during hydration");
  const text = jsonbText(parsed.text ?? "");
  const html = jsonbText(parsed.html ?? "");
  let snippet = "";
  let snippetCharacters = 0;
  for (const character of text) {
    if (snippetCharacters === 120) break;
    snippet += character;
    snippetCharacters++;
  }
  const parts = [
    ...(text ? [{ mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } }] : []),
    ...(html ? [{ mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } }] : []),
    ...parsed.attachments.map((attachment, index) => ({
      mimeType: jsonbText(attachment.mimeType),
      filename: jsonbText(attachment.filename ?? ""),
      body: {
        attachmentId: `imap:${uidValidity}:${String(raw.uid)}:${String(index)}`,
        size: typeof attachment.content === "string" ? Buffer.byteLength(attachment.content) : attachment.content.byteLength,
      },
    })),
  ];
  const labels = [...raw.labels].map((label) => {
    switch (label) {
      case "\\Inbox": return "INBOX";
      case "\\Sent": return "SENT";
      case "\\Drafts": return "DRAFT";
      default: return jsonbText(label);
    }
  });
  if (!raw.flags.has("\\Seen")) labels.push("UNREAD");
  if (raw.flags.has("\\Flagged")) labels.push("STARRED");
  return {
    id: gmailHexId(raw.emailId),
    threadId: gmailHexId(raw.threadId),
    labelIds: labels,
    snippet,
    internalDate: String(raw.internalDate.getTime()),
    payload: {
      mimeType: "multipart/mixed",
      headers: parsed.headers.map((header) => ({ name: jsonbText(header.originalKey), value: jsonbText(header.value) })),
      parts,
    },
  };
}

export async function readImapPage(
  email: string,
  accessToken: string,
  cursor: { uid_validity: string; before_uid: number } | undefined,
  senderSync: NonNullable<FetchArgs["senderSync"]>,
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
    const selectedSet = new Set(selected);
    const seen = new Set<number>();
    const enabled = new Map<number, { address: string; emailId: string }>();
    const discoveries: Envelope[] = [];
    for await (const header of mailbox.fetchHeaders(selected)) {
      if (!selectedSet.has(header.uid) || seen.has(header.uid)) throw new Error("Gmail IMAP returned an unexpected or duplicate header UID");
      seen.add(header.uid);
      const parsed = await PostalMime.parse(header.headers);
      const address = parsed.from?.address?.trim().toLowerCase();
      if (address === undefined || !/^[^\s<>@]+@[^\s<>@]+$/.test(address)) throw new Error("Gmail IMAP message has no exact From address");
      const known = Object.hasOwn(senderSync.choices, address);
      const syncEnabled = known ? senderSync.choices[address] : senderSync.unknownSenderEnabled;
      if (typeof syncEnabled !== "boolean") throw new Error("Gmail IMAP sender selection is invalid");
      if (syncEnabled) enabled.set(header.uid, { address, emailId: header.emailId });
      else if (!known) discoveries.push({ surface: "email", kind: "snapshot", remote_id: gmailHexId(header.emailId),
        payload: { entity_type: "sender", from_address: address, from_name: parsed.from?.name ?? null } });
    }
    if (seen.size !== selected.length) throw new Error("Gmail IMAP header response is incomplete");
    const bodyUids = selected.filter((uid) => enabled.has(uid));
    const fetched = new Map<number, GmailMessage>();
    for await (const raw of mailbox.fetch(bodyUids)) {
      const header = enabled.get(raw.uid);
      if (header === undefined || fetched.has(raw.uid)) throw new Error("Gmail IMAP returned an unexpected or duplicate body UID");
      if (raw.emailId !== header.emailId) throw new Error("Gmail IMAP message ID changed during hydration");
      fetched.set(raw.uid, await toGmailMessage(raw, mailbox.uidValidity, header.address));
    }
    const messages = bodyUids.map((uid) => {
      const message = fetched.get(uid);
      if (message === undefined) throw new Error("Gmail IMAP body response is incomplete");
      return message;
    });
    const hasMore = uids.length > PAGE_SIZE;
    const lastUid = selected.at(-1);
    return {
      messages,
      discoveries,
      remaining: uids.length,
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
