// Gmail surface: REST client + canonical conversion + the Sync-Profile fetch
// logic — twin of plugins/sources/google/src/gmail.rs.
//
// The connector serves the `email` surface: each envelope's `payload` is a
// flattened MailMessage (see `flattenMailPayload`) and `remote_id` is the
// Gmail message id.

import type { Envelope } from "@magnis/connector-sdk";
import {
  checkRateLimit,
  fetchWithRetry,
  HistoryExpiredError,
  isFatal,
  type FetchLike,
} from "../../http";
import {
  collectAttachments,
  decodeBase64url,
  extractBodyContent,
  type AttachmentInfo,
  type GmailBody,
  type GmailPart,
  type GmailPayload,
} from "./mime";
import { formatUtc } from "../../helpers";
import { mergeProgress, progressCursor, type Progress } from "../../progress";
import {
  asObject,
  defaultObjectArray,
  defaultStringArray,
  optNumber,
  optObject,
  optObjectArray,
  optString,
  optStringArray,
  reqObject,
  reqString,
} from "../../validate";

/** How many `messages.get` calls to run concurrently when hydrating a page —
 * same fan-out as the Rust GMAIL_FETCH_CONCURRENCY. */
const GMAIL_FETCH_CONCURRENCY = 8;

// ── Raw Gmail API shapes (camelCase, as served) ───────────────

export interface GmailMessage {
  id: string;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  payload?: GmailPayload | null;
  internalDate?: string | null;
}

interface ListMessagesResponse {
  messages?: { id: string }[] | null;
  nextPageToken?: string | null;
}

interface GmailProfile {
  historyId: string;
  messagesTotal?: number | null;
}

export interface HistoryEntry {
  messagesAdded?: { message: { id: string } }[] | null;
  messagesDeleted?: { message: { id: string } }[] | null;
  labelsAdded?: { message: { id: string } }[] | null;
  labelsRemoved?: { message: { id: string } }[] | null;
}

interface HistoryListResponse {
  history?: HistoryEntry[] | null;
  nextPageToken?: string | null;
  historyId: string;
}

// ── Response parsers (serde parity — see validate.ts) ─────────
//
// One parser per Rust response struct, field-for-field. Required fields throw;
// `Option<T>` / `#[serde(default)]` fields stay tolerant. The throw is a plain
// Error (≡ `GoogleSyncError::Other`), so fatality is decided by the caller
// exactly as in Rust: a bad `messages.get` body skips ONE message, everything
// else fails the whole fetch.

/** `GmailHeader` (gmail.rs:63) — `name` and `value` are BOTH required. */
function parseHeaders(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): { name: string; value: string }[] | null {
  const raw = optObjectArray(o, field, ctx);
  if (raw === null) return null;
  return raw.map((h, i) => ({
    name: reqString(h, "name", `${ctx}.${field}[${String(i)}]`),
    value: reqString(h, "value", `${ctx}.${field}[${String(i)}]`),
  }));
}

/** `GmailBody` (gmail.rs:70) — every field optional. */
function parseBody(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): GmailBody | null {
  const b = optObject(o, field, ctx);
  if (b === null) return null;
  const c = `${ctx}.${field}`;
  return {
    attachmentId: optString(b, "attachmentId", c),
    size: optNumber(b, "size", c),
    data: optString(b, "data", c),
  };
}

/** `GmailPart` (gmail.rs:78) — all fields optional, recursive. `headers` is
 * unused downstream but serde still validates it, so we do too. */
function parseParts(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): GmailPart[] | null {
  const raw = optObjectArray(o, field, ctx);
  if (raw === null) return null;
  return raw.map((p, i) => {
    const c = `${ctx}.${field}[${String(i)}]`;
    parseHeaders(p, "headers", c);
    return {
      mimeType: optString(p, "mimeType", c),
      filename: optString(p, "filename", c),
      body: parseBody(p, "body", c),
      parts: parseParts(p, "parts", c),
    };
  });
}

/** `GmailMessage` (gmail.rs:44) — `id` required, everything else optional. */
function parseGmailMessage(v: unknown): GmailMessage {
  const ctx = "GmailMessage";
  const o = asObject(v, ctx);
  const payloadRaw = optObject(o, "payload", ctx);
  let payload: GmailPayload | null = null;
  if (payloadRaw !== null) {
    const c = `${ctx}.payload`;
    payload = {
      mimeType: optString(payloadRaw, "mimeType", c),
      headers: parseHeaders(payloadRaw, "headers", c),
      body: parseBody(payloadRaw, "body", c),
      parts: parseParts(payloadRaw, "parts", c),
    };
  }
  return {
    id: reqString(o, "id", ctx),
    threadId: optString(o, "threadId", ctx),
    labelIds: optStringArray(o, "labelIds", ctx),
    snippet: optString(o, "snippet", ctx),
    payload,
    internalDate: optString(o, "internalDate", ctx),
  };
}

/** `GmailProfile` (gmail.rs:94) — `historyId` required; `messagesTotal` is
 * `#[serde(default)] Option<u64>` (absent → indeterminate total). */
function parseGmailProfile(v: unknown): GmailProfile {
  const ctx = "GmailProfile";
  const o = asObject(v, ctx);
  return {
    historyId: reqString(o, "historyId", ctx),
    messagesTotal: optNumber(o, "messagesTotal", ctx),
  };
}

/** `ListMessagesResponse` (gmail.rs:32) — both fields `Option<_>`, but each
 * `GmailMessageRef.id` (gmail.rs:40) is required. */
function parseListMessagesResponse(v: unknown): ListMessagesResponse {
  const ctx = "ListMessagesResponse";
  const o = asObject(v, ctx);
  const refs = optObjectArray(o, "messages", ctx);
  return {
    messages:
      refs === null
        ? null
        : refs.map((m, i) => ({ id: reqString(m, "id", `${ctx}.messages[${String(i)}]`) })),
    nextPageToken: optString(o, "nextPageToken", ctx),
  };
}

/** `HistoryMessageEvent` (gmail.rs:126) / `HistoryLabelEvent` (gmail.rs:132) —
 * `message` is required, and `HistoryMessageRef.id` (gmail.rs:142) with it.
 *
 * `withLabelIds` mirrors a real asymmetry: only `HistoryLabelEvent` declares
 * `#[serde(default)] label_ids`, so serde VALIDATES it there but treats it as
 * an ignorable unknown field on `messagesAdded`/`messagesDeleted`. Validating
 * it everywhere would reject bodies the Rust accepts. */
function parseHistoryEvents(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
  withLabelIds: boolean,
): { message: { id: string } }[] {
  return defaultObjectArray(o, field, ctx).map((e, i) => {
    const c = `${ctx}.${field}[${String(i)}]`;
    const msg = reqObject(e, "message", c);
    // `label_ids` is unused downstream, but serde still type-checks it.
    if (withLabelIds) defaultStringArray(e, "labelIds", c);
    // `HistoryMessageRef.thread_id: Option<String>` — validated, unused.
    optString(msg, "threadId", `${c}.message`);
    return { message: { id: reqString(msg, "id", `${c}.message`) } };
  });
}

/** `HistoryListResponse` (gmail.rs:105) — `historyId` required; `history` is
 * `#[serde(default)] Vec<_>` (absent → no changes). */
function parseHistoryListResponse(v: unknown): HistoryListResponse {
  const ctx = "HistoryListResponse";
  const o = asObject(v, ctx);
  const entries = defaultObjectArray(o, "history", ctx).map((e, i) => {
    const c = `${ctx}.history[${String(i)}]`;
    return {
      messagesAdded: parseHistoryEvents(e, "messagesAdded", c, false),
      messagesDeleted: parseHistoryEvents(e, "messagesDeleted", c, false),
      labelsAdded: parseHistoryEvents(e, "labelsAdded", c, true),
      labelsRemoved: parseHistoryEvents(e, "labelsRemoved", c, true),
    };
  });
  return {
    history: entries,
    nextPageToken: optString(o, "nextPageToken", ctx),
    historyId: reqString(o, "historyId", ctx),
  };
}

// ── Canonical (pre-flatten) MailMessage shape ─────────────────

export interface EmailAddress {
  name: string | null;
  address: string;
}

export interface MailMessage {
  id: string;
  thread_id: string | null;
  message_id_header: string | null;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  sent_at: string;
  snippet: string;
  body_text: string | null;
  body_html: string | null;
  labels: string[];
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  attachments: AttachmentInfo[];
}

// ── Datetime helpers (chrono-compatible RFC3339 Z) ────────────
// `formatUtc` is shared with the meetings surface → src/helpers.ts.

/** RFC2822 (or RFC3339) Date header → Date, else null. */
function parseDateHeader(raw: string): Date | null {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Gmail internalDate (epoch millis string) → Date, else null. */
function internalDateToDate(millisStr: string): Date | null {
  const millis = Number(millisStr);
  return Number.isInteger(millis) ? new Date(millis) : null;
}

// ── GmailMessage → MailMessage conversion (ported) ────────────

function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string | null {
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}

export function parseEmailAddress(raw: string): EmailAddress {
  const lt = raw.indexOf("<");
  const gt = raw.indexOf(">");
  if (lt >= 0 && gt >= 0) {
    const name = raw.slice(0, lt).trim().replace(/^"+|"+$/g, "");
    const address = raw.slice(lt + 1, gt).trim();
    return { name: name === "" ? null : name, address };
  }
  return { name: null, address: raw.trim() };
}

export function parseEmailAddresses(raw: string): EmailAddress[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(parseEmailAddress);
}

export function gmailMessageToMailMessage(msg: GmailMessage): MailMessage {
  const payload = msg.payload;
  if (!payload) throw new Error(`message ${msg.id} has no payload`);

  const headers = payload.headers ?? [];

  const subject = getHeader(headers, "Subject") ?? "";
  const fromRaw = getHeader(headers, "From") ?? "";
  const toRaw = getHeader(headers, "To") ?? "";
  const ccRaw = getHeader(headers, "Cc") ?? "";
  const bccRaw = getHeader(headers, "Bcc") ?? "";
  const dateRaw = getHeader(headers, "Date");
  // Case-insensitive header lookup covers both Message-ID and Message-Id.
  const messageIdHeader = getHeader(headers, "Message-ID");

  const sentAt =
    (dateRaw !== null ? parseDateHeader(dateRaw) : null) ??
    (msg.internalDate !== null && msg.internalDate !== undefined ? internalDateToDate(msg.internalDate) : null) ??
    new Date(0);

  const labels = msg.labelIds ?? [];
  const isRead = !labels.includes("UNREAD");
  const isStarred = labels.includes("STARRED");

  const snippet = msg.snippet ?? "";
  const body = extractBodyContent(payload);
  const attachments = collectAttachments(payload);

  const trimmedSnippet = snippet.trim();
  const bodyText =
    body.bodyText !== null && body.bodyText.trim() !== ""
      ? body.bodyText
      : trimmedSnippet !== ""
        ? trimmedSnippet
        : null;

  return {
    id: msg.id,
    thread_id: msg.threadId ?? null,
    message_id_header: messageIdHeader,
    subject,
    from: parseEmailAddress(fromRaw),
    to: parseEmailAddresses(toRaw),
    cc: parseEmailAddresses(ccRaw),
    bcc: parseEmailAddresses(bccRaw),
    sent_at: formatUtc(sentAt),
    snippet,
    body_text: bodyText,
    body_html: body.bodyHtml,
    labels,
    is_read: isRead,
    is_starred: isStarred,
    has_attachments: attachments.length > 0,
    attachments,
  };
}

// ── flattenMailPayload (ported byte-identically) ──────────────

/** Flatten MailMessage payload: `from` → `from_name`/`from_address`, and
 * `to`/`cc`/`bcc` arrays → comma-separated `*_addresses` strings. THE email
 * payload shape the `emails` module ingests. */
export function flattenMailPayload(payload: Record<string, unknown>): void {
  if ("from" in payload) {
    const from = payload.from as Record<string, unknown> | null | undefined;
    payload.from_name = from && typeof from === "object" ? (from.name ?? null) : null;
    payload.from_address =
      from && typeof from === "object" ? (from.address ?? null) : null;
    delete payload.from;
  }
  for (const field of ["to", "cc", "bcc"] as const) {
    const arr = payload[field];
    if (Array.isArray(arr)) {
      const addrs = arr
        .map((v) =>
          v !== null && typeof v === "object"
            ? (v as Record<string, unknown>).address
            : undefined,
        )
        .filter((a): a is string => typeof a === "string");
      payload[`${field}_addresses`] = addrs.join(", ");
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- payload is a local Record being normalized; the raw `field` key must be removed (setting undefined would leave the key), and `field` is a fixed internal set (to/cc/bcc).
      delete payload[field];
    }
  }
}

// ── History action resolution (ported) ────────────────────────

export type HistoryAction = "fetch" | "delete";

/** Resolve the last effective action per message across history entries:
 * within one entry Deleted beats Added; later entries override earlier ones;
 * label changes only apply if the message wasn't also added/deleted. */
export function resolveHistoryActions(
  entries: HistoryEntry[],
): Map<string, HistoryAction> {
  const actions = new Map<string, HistoryAction>();
  for (const entry of entries) {
    const added = new Set((entry.messagesAdded ?? []).map((e) => e.message.id));
    const deleted = new Set(
      (entry.messagesDeleted ?? []).map((e) => e.message.id),
    );
    const labels = new Set([
      ...(entry.labelsAdded ?? []).map((e) => e.message.id),
      ...(entry.labelsRemoved ?? []).map((e) => e.message.id),
    ]);

    for (const id of deleted) actions.set(id, "delete");
    for (const id of added) {
      if (!deleted.has(id)) actions.set(id, "fetch");
    }
    for (const id of labels) {
      if (!deleted.has(id) && !added.has(id) && !actions.has(id)) {
        actions.set(id, "fetch");
      }
    }
  }
  return actions;
}

/** Actions in stable id order — the Rust side uses a BTreeMap, so envelope
 * order is sorted-by-id. Mirrored so the wire is identical. */
export function sortedActions(
  actions: Map<string, HistoryAction>,
): [string, HistoryAction][] {
  return [...actions.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// ── RFC 2822 message builder (ported) ─────────────────────────

/** Wrap in RFC 2047 encoded-word if non-ASCII; ASCII passes through. */
export function mimeEncodeHeader(value: string): string {
  for (let idx = 0; idx < value.length; idx++) {
    if (value.charCodeAt(idx) > 0x7f) {
      return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
    }
  }
  return value;
}

function formatRecipient(name: string | null | undefined, address: string): string {
  return name ? `${mimeEncodeHeader(name)} <${address}>` : address;
}

/** Parsed + validated MailDraft (attachment data decoded to bytes). */
export interface MailDraft {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  body_text: string;
  body_html: string | null;
  in_reply_to: string | null;
  attachments: { filename: string; mime_type: string; data: Uint8Array }[];
}

function parseAddressList(v: unknown, field: string): EmailAddress[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`field \`${field}\` must be an array`);
  return v.map((item, i) => {
    const o = item as Record<string, unknown> | null;
    if (o === null || typeof o !== "object" || typeof o.address !== "string") {
      throw new Error(`field \`${field}[${String(i)}]\` missing string \`address\``);
    }
    return {
      name: typeof o.name === "string" ? o.name : null,
      address: o.address,
    };
  });
}

const BASE64_STANDARD = /^[A-Za-z0-9+/]*={0,2}$/;

/** Validate + decode a wire MailDraft (twin of the Rust serde deserialize:
 * required to/subject/body_text; cc/bcc/attachments default empty; attachment
 * `data` is base64 STANDARD). Throws with the reason on any violation. */
export function parseMailDraft(value: unknown): MailDraft {
  try {
    const raw: unknown = value ?? {};
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("draft must be an object");
    }
    const o = raw as Record<string, unknown>;
    if (!("to" in o)) throw new Error("missing field `to`");
    if (typeof o.subject !== "string") throw new Error("missing field `subject`");
    if (typeof o.body_text !== "string") {
      throw new Error("missing field `body_text`");
    }
    const attachmentsRaw = o.attachments ?? [];
    if (!Array.isArray(attachmentsRaw)) {
      throw new Error("field `attachments` must be an array");
    }
    const attachments = attachmentsRaw.map((raw, i) => {
      const a = raw as Record<string, unknown> | null;
      if (
        a === null ||
        typeof a !== "object" ||
        typeof a.filename !== "string" ||
        typeof a.mime_type !== "string" ||
        typeof a.data !== "string"
      ) {
        throw new Error(
          `field \`attachments[${String(i)}]\` needs string filename/mime_type/data`,
        );
      }
      if (!BASE64_STANDARD.test(a.data) || a.data.length % 4 !== 0) {
        throw new Error(`field \`attachments[${String(i)}].data\` is not valid base64`);
      }
      return {
        filename: a.filename,
        mime_type: a.mime_type,
        data: Uint8Array.from(Buffer.from(a.data, "base64")),
      };
    });
    return {
      to: parseAddressList(o.to, "to"),
      cc: parseAddressList(o.cc, "cc"),
      bcc: parseAddressList(o.bcc, "bcc"),
      subject: o.subject,
      body_text: o.body_text,
      body_html: typeof o.body_html === "string" ? o.body_html : null,
      in_reply_to: typeof o.in_reply_to === "string" ? o.in_reply_to : null,
      attachments,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid MailDraft payload: ${msg}`, { cause: e });
  }
}

/** Build a raw RFC 2822 message from a MailDraft — CRLF line endings, RFC 2047
 * Subject/display names, multipart/mixed when attachments are present. */
export function buildRawMessage(draft: MailDraft): string {
  const toStr = draft.to
    .map((a) => formatRecipient(a.name, a.address))
    .join(", ");
  const ccStr = draft.cc
    .map((a) => formatRecipient(a.name, a.address))
    .join(", ");

  const headers = [
    `To: ${toStr}`,
    `Subject: ${mimeEncodeHeader(draft.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (ccStr !== "") headers.push(`Cc: ${ccStr}`);
  if (draft.in_reply_to) {
    headers.push(`In-Reply-To: ${draft.in_reply_to}`);
    headers.push(`References: ${draft.in_reply_to}`);
  }

  if (draft.attachments.length === 0) {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    return `${headers.join("\r\n")}\r\n\r\n${draft.body_text}`;
  }

  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];
  parts.push(
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${draft.body_text}`,
  );
  for (const att of draft.attachments) {
    const b64 = Buffer.from(att.data).toString("base64");
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${att.mime_type}; name="${att.filename}"\r\n` +
        `Content-Disposition: attachment; filename="${att.filename}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `\r\n` +
        b64,
    );
  }
  parts.push(`--${boundary}--`);

  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

/** base64url-encode WITHOUT padding (Gmail `raw` message body). */
export function encodeBase64UrlNoPad(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

// ── REST client (per-call access token) ───────────────────────

async function getProfile(
  token: string,
  fetchFn: FetchLike,
): Promise<GmailProfile> {
  const resp = await fetchWithRetry(
    fetchFn,
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { authorization: `Bearer ${token}` } },
  );
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail get profile failed: ${await resp.text()}`);
  }
  return parseGmailProfile(await resp.json());
}

async function listMessagesPage(
  token: string,
  pageToken: string | undefined,
  fetchFn: FetchLike,
): Promise<ListMessagesResponse> {
  let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50";
  if (pageToken !== undefined) url += `&pageToken=${pageToken}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail list messages failed: ${await resp.text()}`);
  }
  return parseListMessagesResponse(await resp.json());
}

async function fetchMessage(
  token: string,
  gmailMsgId: string,
  fetchFn: FetchLike,
): Promise<GmailMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMsgId}?format=full`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(
      `GET message ${gmailMsgId} failed (${String(resp.status)}): ${await resp.text()}`,
    );
  }
  return parseGmailMessage(await resp.json());
}

async function listHistory(
  token: string,
  startHistoryId: string,
  pageToken: string | undefined,
  fetchFn: FetchLike,
): Promise<HistoryListResponse> {
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&maxResults=500`;
  if (pageToken !== undefined) url += `&pageToken=${pageToken}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (resp.status === 404) throw new HistoryExpiredError();
  if (!resp.ok) {
    throw new Error(`Gmail list history failed: ${await resp.text()}`);
  }
  return parseHistoryListResponse(await resp.json());
}

/** Send a draft: build RFC 2822 MIME, base64url-nopad encode, POST to
 * /messages/send. Returns `{ message_id, thread_id }`. */
export async function sendMessage(
  token: string,
  draft: MailDraft,
  fetchFn: FetchLike,
): Promise<Record<string, unknown>> {
  const raw = encodeBase64UrlNoPad(buildRawMessage(draft));
  const resp = await fetchWithRetry(
    fetchFn,
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail send failed (${String(resp.status)}): ${await resp.text()}`);
  }
  // `SendResponse` (gmail.rs:347): `id` required, `thread_id` Option.
  const body = asObject(await resp.json(), "SendResponse");
  return {
    message_id: reqString(body, "id", "SendResponse"),
    thread_id: optString(body, "threadId", "SendResponse"),
  };
}

/** Download one attachment's bytes ({data} is base64url). */
export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  fetchFn: FetchLike,
): Promise<Uint8Array> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (!resp.ok) throw new Error(`Attachment download failed: ${String(resp.status)}`);
  // `AttachmentResponse` (gmail.rs:88): `data: Option<String>` — absent is the
  // "No attachment data" error, a non-string is a shape error.
  const body = asObject(await resp.json(), "AttachmentResponse");
  const data = optString(body, "data", "AttachmentResponse");
  if (data === null) throw new Error("No attachment data");
  const bytes = decodeBase64url(data);
  if (bytes === null) throw new Error("Base64 decode failed");
  return bytes;
}

// ── Concurrent hydration (order preserved) ────────────────────

interface Fetched { id: string; msg?: GmailMessage; err?: unknown }

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        const item = items[i];
        if (item === undefined) throw new Error("mapLimit: item index out of range");
        results[i] = await fn(item);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** Turn (id, fetch-result) pairs into `snapshot` envelopes IN ORDER. A
 * non-fatal fetch error or a conversion failure SKIPS that message (logged);
 * a fatal error (rate-limit / auth / history-expired) aborts the batch. */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function snapshotEnvelopesFromFetched(fetched: Fetched[]): Envelope[] {
  const envelopes: Envelope[] = [];
  for (const { id, msg, err } of fetched) {
    if (err !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrow the original caught value (unknown) to abort the batch; isFatal already classified it and wrapping would lose the original error identity.
      if (isFatal(err)) throw err;
      console.error(
        `magnis-google: skipping message ${id} (fetch failed: ${errText(err)})`,
      );
      continue;
    }
    if (msg === undefined) continue;
    try {
      const mail = gmailMessageToMailMessage(msg);
      const payload = { ...mail } as unknown as Record<string, unknown>;
      flattenMailPayload(payload);
      envelopes.push({ surface: "email", payload, remote_id: id, kind: "snapshot" });
    } catch (e) {
      console.error(
        `magnis-google: skipping message ${id} (convert failed: ${errText(e)})`,
      );
    }
  }
  return envelopes;
}

async function fetchSnapshotEnvelopes(
  token: string,
  ids: string[],
  fetchFn: FetchLike,
): Promise<Envelope[]> {
  const fetched = await mapConcurrent(
    ids,
    GMAIL_FETCH_CONCURRENCY,
    async (id): Promise<Fetched> => {
      try {
        return { id, msg: await fetchMessage(token, id, fetchFn) };
      } catch (err) {
        return { id, err };
      }
    },
  );
  return snapshotEnvelopesFromFetched(fetched);
}

// ── Sync-Profile fetch logic ──────────────────────────────────

export interface EmailFetchResult {
  envelopes: Envelope[];
  nextCursor: Record<string, unknown>;
  hasMore: boolean;
  total: number | null;
  discovered: number;
}

function cursorObj(cursor: unknown): Record<string, unknown> | undefined {
  return cursor !== null && typeof cursor === "object"
    ? (cursor as Record<string, unknown>)
    : undefined;
}

/** Bootstrap/backward page fetch. Page 1 (no cursor.page_token) captures the
 * catchup watermark `historyId` + the bootstrap `total` (messagesTotal) via
 * the profile BEFORE pagination; pages 2+ thread both forward in the cursor.
 * The next cursor is ALWAYS an object (even on the last page). */
export async function fetchMessagePage(
  token: string,
  cursor: unknown,
  fetchFn: FetchLike,
): Promise<EmailFetchResult> {
  const c = cursorObj(cursor);
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;

  let historyId: string | undefined;
  let freshTotal: number | undefined;
  if (pageToken === undefined) {
    const profile = await getProfile(token, fetchFn);
    historyId = profile.historyId;
    freshTotal = typeof profile.messagesTotal === "number" ? profile.messagesTotal : undefined;
  } else {
    historyId = typeof c?.history_id === "string" ? c.history_id : undefined;
  }

  const page = await listMessagesPage(token, pageToken, fetchFn);
  const ids = (page.messages ?? []).map((m) => m.id);
  const envelopes = await fetchSnapshotEnvelopes(token, ids, fetchFn);

  const progress: Progress = progressCursor(cursor, ids.length, freshTotal);

  const hasMore = typeof page.nextPageToken === "string";
  const nextCursor: Record<string, unknown> = {};
  if (hasMore) nextCursor.page_token = page.nextPageToken;
  if (historyId !== undefined) nextCursor.history_id = historyId;
  mergeProgress(nextCursor, progress);

  return {
    envelopes,
    nextCursor,
    hasMore,
    total: progress.total ?? null,
    discovered: progress.discovered,
  };
}

/** CatchUp/forward incremental fetch via the History API. A missing
 * `history_id` in the cursor is a HistoryExpired error, never a silent
 * re-bootstrap. Carries bootstrap `discovered`/`total` FORWARD. */
export async function fetchHistoryChanges(
  token: string,
  cursor: unknown,
  fetchFn: FetchLike,
): Promise<EmailFetchResult> {
  const c = cursorObj(cursor);
  const historyId = typeof c?.history_id === "string" ? c.history_id : undefined;
  if (historyId === undefined) throw new HistoryExpiredError();
  const historyPageToken =
    typeof c?.history_page_token === "string" ? c.history_page_token : undefined;

  const resp = await listHistory(token, historyId, historyPageToken, fetchFn);
  const actions = sortedActions(resolveHistoryActions(resp.history ?? []));

  const envelopes: Envelope[] = actions
    .filter(([, action]) => action === "delete")
    .map(([msgId]) => ({
      surface: "email",
      payload: {},
      remote_id: msgId,
      kind: "delete",
    }));
  const fetchIds = actions
    .filter(([, action]) => action === "fetch")
    .map(([msgId]) => msgId);
  envelopes.push(...(await fetchSnapshotEnvelopes(token, fetchIds, fetchFn)));

  // Carry bootstrap progress FORWARD (page_len 0 → no increment).
  const progress = progressCursor(cursor, 0, undefined);

  const hasMore = typeof resp.nextPageToken === "string";
  const nextCursor: Record<string, unknown> = hasMore
    ? { history_id: historyId, history_page_token: resp.nextPageToken }
    : { history_id: resp.historyId };
  mergeProgress(nextCursor, progress);

  return {
    envelopes,
    nextCursor,
    hasMore,
    total: progress.total ?? null,
    discovered: progress.discovered,
  };
}
