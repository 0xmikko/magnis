import { decodeHtmlEntities, initialsFromName } from "@magnis/host/utils";
import { formatEmailDate, formatTimeAgo } from "@magnis/host/utils";
import { pickAvatarColor } from "@magnis/host/utils";
import type {
  EmailDetailData,
  EmailItem,
  EmailThreadItem,
  MessageDetailView,
  MessageListItem,
} from "./types";

// ─── Mapping ─────────────────────────────────────────────────────────

function getMetadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

export function mapEmail(message: MessageListItem): EmailItem {
  const fromName = getMetadataString(message.metadata, "from_name") ?? null;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const sender = fromName || message.sender || "Unknown";
  const sentAt = getMetadataString(message.metadata, "sent_at") ?? message.timestamp;

  return {
    id: message.id,
    sender,
    initials: initialsFromName(sender),
    subject: decodeHtmlEntities(message.subject ?? ""),
    preview: decodeHtmlEntities(message.preview ?? ""),
    time: formatTimeAgo(sentAt),
    color: pickAvatarColor(sender),
  };
}

export function mapEmailDetail(message: MessageListItem): EmailDetailData {
  const fromName = getMetadataString(message.metadata, "from_name") ?? null;
  const fromAddress =
    getMetadataString(message.metadata, "from_address") ?? message.sender ?? null;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const senderName = fromName || fromAddress || "Unknown";
  const fromEmail = fromAddress ?? "Unknown";
  const sentAt = getMetadataString(message.metadata, "sent_at") ?? message.timestamp;
  const toAddresses = getMetadataString(message.metadata, "to_addresses") ?? undefined;
  const replyTo = getMetadataString(message.metadata, "reply_to") ?? undefined;

  return {
    fromEmail,
    senderName,
    sentAt: formatEmailDate(sentAt),
    toAddresses,
    replyTo,
    bodyParagraphs: [
      decodeHtmlEntities(
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        (message.preview || "No message body available yet.").trim(),
      ),
    ],
    actions: [],
  };
}

export function mapEmailDetailFromDetailView(view: MessageDetailView): EmailDetailData {
  const fromName = getMetadataString(view.metadata, "from_name") ?? null;
  const fromAddress =
    getMetadataString(view.metadata, "from_address") ?? view.sender ?? null;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const senderName = fromName || fromAddress || "Unknown";
  const fromEmail = fromAddress ?? "Unknown";
  const sentAt = getMetadataString(view.metadata, "sent_at") ?? view.timestamp;
  const toAddresses = getMetadataString(view.metadata, "to_addresses") ?? undefined;
  const replyTo = getMetadataString(view.metadata, "reply_to") ?? undefined;
  const bodyHtmlRaw = getMetadataString(view.metadata, "body_html") ?? undefined;

  const bodyText = view.body?.trim();
  const bodyParagraphs: string[] = bodyText
    ? bodyText.split(/\n{2,}/).map((p) => decodeHtmlEntities(p.trim())).filter(Boolean)
    : ["No message body available yet."];

  // Map attachments from metadata
  const rawAttachments = view.metadata?.attachments;
  const attachments: {
    readonly filename: string;
    readonly mime_type: string;
    readonly size: number;
    readonly path: string;
  }[] = Array.isArray(rawAttachments)
    ? (rawAttachments as { filename?: string; mime_type?: string; size?: number; path?: string }[])
        .map((att) => ({
          filename: typeof att.filename === "string" ? att.filename : "attachment",
          mime_type: typeof att.mime_type === "string" ? att.mime_type : "application/octet-stream",
          size: typeof att.size === "number" ? att.size : 0,
          path: typeof att.path === "string" ? att.path : "",
        }))
    : [];

  return {
    fromEmail,
    senderName,
    sentAt: formatEmailDate(sentAt),
    toAddresses,
    replyTo,
    bodyParagraphs,
    bodyHtml: bodyHtmlRaw,
    actions: [],
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

// ─── Selectors ───────────────────────────────────────────────────────

export function getEmail(
  emails: readonly EmailItem[],
  id: string,
): EmailItem | undefined {
  if (emails.length === 0) return undefined;
  const emailMap = new Map(emails.map((item) => [item.id, item]));
  return emailMap.get(id) ?? emails[0];
}

export function getThread(
  threads: readonly EmailThreadItem[],
  id: string,
): EmailThreadItem | undefined {
  if (threads.length === 0) return undefined;
  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  return threadMap.get(id) ?? threads[0];
}

export function getDetail(
  detailById: Readonly<Record<string, EmailDetailData>>,
  id: string,
): EmailDetailData | undefined {
  return detailById[id];
}
