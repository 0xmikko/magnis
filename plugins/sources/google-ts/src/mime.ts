// Gmail MIME parsing — twin of plugins/sources/google/src/mime.rs. Operates on
// the RAW Gmail JSON shapes (camelCase, as served by `users.messages.get`).

export interface GmailBody {
  attachmentId?: string | null;
  size?: number | null;
  data?: string | null;
}

export interface GmailPart {
  mimeType?: string | null;
  filename?: string | null;
  body?: GmailBody | null;
  parts?: GmailPart[] | null;
}

export interface GmailPayload {
  mimeType?: string | null;
  headers?: { name: string; value: string }[] | null;
  body?: GmailBody | null;
  parts?: GmailPart[] | null;
}

export interface ExtractedBodyContent {
  bodyText: string | null;
  bodyHtml: string | null;
}

/** Attachment metadata in the canonical (snake_case) payload shape. */
export interface AttachmentInfo {
  attachment_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

/** base64url decode, tolerating both padded and unpadded input. */
export function decodeBase64url(data: string): Uint8Array | null {
  if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(data)) return null;
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Uint8Array.from(Buffer.from(normalized, "base64"));
  } catch {
    return null;
  }
}

function decodeBody(body: GmailBody | null | undefined): string | null {
  const data = body?.data;
  if (typeof data !== "string") return null;
  const bytes = decodeBase64url(data);
  if (bytes === null) return null;
  // Lossy UTF-8 decode (invalid sequences → U+FFFD), like from_utf8_lossy.
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function findPartContent(parts: GmailPart[], mimeType: string): string | null {
  for (const part of parts) {
    if (part.mimeType === mimeType) {
      const decoded = decodeBody(part.body);
      if (decoded !== null) return decoded;
    }
    if (part.parts) {
      const found = findPartContent(part.parts, mimeType);
      if (found !== null) return found;
    }
  }
  return null;
}

function nonEmpty(value: string | null): string | null {
  return value !== null && value.trim() !== "" ? value : null;
}

/** Extract text/plain + text/html bodies: multipart parts win (recursive,
 * first match); a single-part body is used only when the top-level mimeType
 * matches. Empty/whitespace-only results are dropped. */
export function extractBodyContent(payload: GmailPayload): ExtractedBodyContent {
  const multipartText = payload.parts
    ? findPartContent(payload.parts, "text/plain")
    : null;
  const multipartHtml = payload.parts
    ? findPartContent(payload.parts, "text/html")
    : null;

  const singlePartBody = decodeBody(payload.body);

  const bodyText = nonEmpty(
    multipartText ?? (payload.mimeType === "text/plain" ? singlePartBody : null),
  );
  const bodyHtml = nonEmpty(
    multipartHtml ?? (payload.mimeType === "text/html" ? singlePartBody : null),
  );

  return { bodyText, bodyHtml };
}

/** Collect attachment metadata: parts (recursive) with a non-empty filename
 * AND a body.attachmentId. */
export function collectAttachments(payload: GmailPayload): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  const walk = (parts: GmailPart[]): void => {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachment_id: part.body.attachmentId,
          filename: part.filename,
          mime_type: part.mimeType ?? "",
          size: part.body.size ?? 0,
        });
      }
      if (part.parts) walk(part.parts);
    }
  };
  if (payload.parts) walk(payload.parts);
  return attachments;
}
