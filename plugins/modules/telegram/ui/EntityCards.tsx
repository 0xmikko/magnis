import { useContext, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { formatMessageTime } from "./utils/time";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";
import { useEntityDetail, hasMessageData, hasChatData } from "./hooks/useEntityDetail";

/**
 * SINGLE canonical telegram cards. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): both `TelegramMessageCard` and
 * `TelegramChatCard` read `expanded` from `ExpansionContext` and switch
 * between compact and expanded layouts from the same payload (lazily
 * hydrated via the shared `useEntityDetail` hook).
 */

const MESSAGE_CLAMP_CHARS = 140;

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function memberNames(data: Readonly<Record<string, unknown>>): string[] {
  const raw = data.members ?? data.participants;
  if (!Array.isArray(raw)) return toStringList(data.members);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) out.push(item);
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const name =
        (typeof rec.name === "string" && rec.name.length > 0 ? rec.name : undefined) ??
        (typeof rec.display_name === "string" && rec.display_name.length > 0
          ? rec.display_name
          : undefined) ??
        (typeof rec.username === "string" && rec.username.length > 0
          ? `@${rec.username}`
          : undefined);
      if (name) out.push(name);
    }
  }
  return out;
}

/**
 * Show chevron when the message text looks long enough to be clamped by the
 * collapsed 2-line body. We use a char threshold as a deterministic,
 * synchronously-evaluable proxy for the DOM line clamp.
 */
export function telegramMessageHasMore(data: Readonly<Record<string, unknown>>): boolean {
  const text =
    (typeof data.preview === "string" ? data.preview : "") ||
    (typeof data.subject === "string" ? data.subject : "") ||
    (typeof data.text === "string" ? data.text : "");
  return text.length > MESSAGE_CLAMP_CHARS || text.includes("\n");
}

/** Chevron shows when chat has members, a chat type, or a created timestamp. */
export function telegramChatHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return (
    memberNames(data).length > 0 ||
    (typeof data.chat_type === "string" && data.chat_type.length > 0) ||
    (typeof data.created_at === "string" && data.created_at.length > 0)
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-content">{value}</span>
    </div>
  );
}

export function TelegramMessageCard(props: EntityRendererProps): JSX.Element {
  const resolved = useEntityDetail(props.data, props.runtime, "telegram.messages.get", hasMessageData);
  const { expanded } = useContext(ExpansionContext);
  const { action } = props;

  const metadata = resolved.metadata as Record<string, unknown> | undefined;
  const senderName = metadata?.sender_name as string | undefined;
  const displaySender = senderName ?? (resolved.sender as string | undefined) ?? "Unknown";
  const displayText =
    (resolved.preview as string | undefined) ?? (resolved.subject as string | undefined) ?? "";
  const fullText =
    (resolved.preview as string | undefined) ??
    (resolved.subject as string | undefined) ??
    (resolved.text as string | undefined);
  const rawTime = (resolved.timestamp as string | undefined) ?? "";
  const timeStr = rawTime
    ? (rawTime.includes("T") || rawTime.length > 10 ? formatMessageTime(rawTime) : rawTime)
    : "";

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-content">
            <ActionPrefix action={action} />
            {displaySender}
          </span>
          {timeStr && (
            <span className="shrink-0 text-[11px] text-content-tertiary">{timeStr}</span>
          )}
        </div>
        {!expanded && displayText && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-content-tertiary">
            {displayText}
          </p>
        )}
        {expanded && fullText && fullText.length > 0 && (
          <div className="mt-2 whitespace-pre-wrap break-words text-[12px] text-content">
            {fullText}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}

export function TelegramChatCard(props: EntityRendererProps): JSX.Element {
  const resolved = useEntityDetail(props.data, props.runtime, "telegram.chats.get", hasChatData);
  const { expanded } = useContext(ExpansionContext);
  const { action } = props;

  const chatTitle = (resolved.chat_title as string | undefined) ?? (resolved.name as string | undefined);
  const lastMessage = resolved.last_message as string | undefined;
  const lastMessageSender = resolved.last_message_sender as string | undefined;
  const messageCount = resolved.message_count as number | undefined;

  const chatType = typeof resolved.chat_type === "string" ? resolved.chat_type : undefined;
  const createdAt = typeof resolved.created_at === "string" ? resolved.created_at : undefined;
  const members = memberNames(resolved);
  const memberPreview =
    members.length > 5 ? `${members.slice(0, 5).join(", ")} …` : members.join(", ");

  const rows: { label: string; value: string }[] = [];
  if (chatType) rows.push({ label: "Type", value: chatType });
  if (memberPreview) rows.push({ label: "Members", value: memberPreview });
  if (createdAt) rows.push({ label: "Created", value: createdAt });
  if (lastMessage) rows.push({ label: "Last msg", value: lastMessage });

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-content">
            <ActionPrefix action={action} />
            {chatTitle ?? "Chat"}
          </span>
          {messageCount !== undefined && messageCount > 0 && (
            <span className="shrink-0 text-[11px] text-content-tertiary">
              {messageCount} msgs
            </span>
          )}
        </div>
        {!expanded && lastMessage && (
          <p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.4] text-content-tertiary">
            {lastMessageSender && (
              <span className="font-medium text-content-secondary">{lastMessageSender}: </span>
            )}
            {lastMessage}
          </p>
        )}
        {expanded && rows.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {rows.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
