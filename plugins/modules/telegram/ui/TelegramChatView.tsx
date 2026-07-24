/**
 * Telegram Chat View — right column showing messages + input.
 * Telegram dark theme with proper message grouping, date separators,
 * mention highlighting, and URL detection.
 *
 * Supports infinite scroll: fires onLoadMore when scrolling near the top.
 */

import { useRef, useEffect, useLayoutEffect, useCallback, useMemo, type ReactNode } from "react";
import type { JSX } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Icon, IconButton, TopBarHeader, ContextMenu, useContextMenu, type ContextMenuEntry } from "@magnis/host/ui";
import { DetailPane } from "@magnis/host/layout";
import { PaneFooterBar } from "@magnis/host/layout";
import { TelegramReplyComposer } from "./TelegramReplyComposer";
import type { TelegramConversation, TelegramMessage } from "./types";
import { normalizeTelegramChatTitle } from "./chatTitle";
import { initialsFromName } from "./utils/text";
import { senderColor } from "./helpers";
import { MESSAGE_MENU_ITEMS } from "./index.tsx";
import { useTelegramStore } from "./store";

export interface TelegramChatViewProps {
  readonly conversation: TelegramConversation | undefined;
  readonly inputPlaceholder: string;
  readonly loading?: boolean;
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
  /** True while fetching older history from Telegram server */
  readonly backfilling?: boolean;
  /** True if there may be older messages on the Telegram server not yet synced */
  readonly hasMoreOnServer?: boolean;
  /** Trigger server-side backfill to fetch older history */
  readonly onBackfill?: () => void;
  readonly onSendMessage?: (text: string) => void;
  /** Called when user selects "Reply by Agent" from the context menu */
  readonly onReplyByAgent?: (message: TelegramMessage) => void;
  /** Whether the current chat is indexed for contact creation */
  readonly isIndexed?: boolean;
  /** Toggle indexing for the current chat */
  readonly onToggleIndexing?: () => void;
}

/**
 * Parse message text into segments: plain text, URLs, markdown links, and @mentions.
 * Returns React nodes with appropriate styling.
 *
 * Supported patterns:
 * - `[label](url)` — markdown links rendered as clickable label
 * - `https://...` — bare URLs rendered as clickable links
 * - `@username` — mentions highlighted in accent color
 * - `**bold**` — bold text
 */
function renderMessageText(text: string): ReactNode[] {
  // Order matters: markdown links first (so [text](url) isn't partially matched as a bare URL)
  const combined =
    /(\[([^\]]+)\]\((https?:\/\/[^)]+)\))|(https?:\/\/[^\s<>"{}|\\^`[\]]+)|(@[\w]+)|(\*\*([^*]+)\*\*)/g;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    // Plain text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Markdown link: [label](url)
      const label = match.at(2) ?? "";
      const url = match.at(3) ?? "";
      parts.push(
        <a
          key={`mdlink-${String(match.index)}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-tg-accent hover:underline"
        >
          {label}
        </a>,
      );
    } else if (match[4]) {
      // Bare URL
      parts.push(
        <a
          key={`url-${String(match.index)}`}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-tg-accent hover:underline"
        >
          {match[4]}
        </a>,
      );
    } else if (match[5]) {
      // @mention
      parts.push(
        <span
          key={`mention-${String(match.index)}`}
          className="cursor-pointer font-medium text-tg-accent hover:underline"
        >
          {match[5]}
        </span>,
      );
    } else if (match[6]) {
      // **bold**
      parts.push(
        <strong key={`bold-${String(match.index)}`}>{match[7]}</strong>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/* ── Grouping logic ── */

type GroupPosition = "single" | "first" | "middle" | "last";

interface GroupedMessage {
  msg: TelegramMessage;
  position: GroupPosition;
  showDate: boolean; // whether a date separator should appear before this message
  showSender: boolean; // whether to show sender name (first in group for incoming in groups)
  showAvatar: boolean; // whether to show avatar (last in group or single)
}

function groupMessages(messages: readonly TelegramMessage[], isGroup: boolean): GroupedMessage[] {
  const result: GroupedMessage[] = [];
  let prevDate: string | undefined;

  for (let i = 0; i < messages.length; i++) {
     
    const msg = messages[i];
    if (!msg) continue;
    const prev = i > 0 ? messages[i - 1] : undefined;
    const next = i < messages.length - 1 ? messages[i + 1] : undefined;

    // Skip date chip markers
    if (msg.senderName === "__date__") {
      result.push({
        msg,
        position: "single",
        showDate: false,
        showSender: false,
        showAvatar: false,
      });
      continue;
    }

    // Date separator: when ISO date changes
    const msgDate = msg.date ?? "";
    const showDate = msgDate !== "" && msgDate !== prevDate;
    if (msgDate) prevDate = msgDate;

    // Same-sender grouping: consecutive messages same direction + same sender
    const sameAsPrev =
      prev &&
      prev.senderName !== "__date__" &&
      prev.direction === msg.direction &&
      prev.senderName === msg.senderName &&
      !showDate; // break group at date boundary
    const sameAsNext =
      next &&
      next.senderName !== "__date__" &&
      next.direction === msg.direction &&
      next.senderName === msg.senderName &&
      (next.date ?? "") === msgDate; // don't group across dates

    let position: GroupPosition;
    if (!sameAsPrev && !sameAsNext) position = "single";
    else if (!sameAsPrev && sameAsNext) position = "first";
    else if (sameAsPrev && sameAsNext) position = "middle";
    else position = "last";

    const showSender =
      isGroup &&
      msg.direction === "in" &&
      (position === "single" || position === "first");

    const showAvatar =
      isGroup &&
      msg.direction === "in" &&
      (position === "single" || position === "last");

    result.push({ msg, position, showDate, showSender, showAvatar });
  }
  return result;
}

/** Detect if a conversation is a group chat (has named incoming senders). */
function detectIsGroup(messages: readonly TelegramMessage[]): boolean {
  // Any incoming message with a non-empty sender name indicates a group chat.
  // In 1-on-1 chats, incoming messages don't carry sender names.
  for (const m of messages) {
    if (m.direction === "in" && m.senderName && m.senderName.trim() !== "") {
      return true;
    }
  }
  return false;
}

/* ── Date formatting ── */

function formatDateSeparator(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

  // Same year — show "13 November"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  }
  // Different year — show "13 November 2024"
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ── Bubble corner styles ── */

function incomingCorners(pos: GroupPosition): string {
  switch (pos) {
    case "single":
      return "rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl";
    case "first":
      return "rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-md";
    case "middle":
      return "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-md";
    case "last":
      return "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-2xl";
  }
}

function outgoingCorners(pos: GroupPosition): string {
  switch (pos) {
    case "single":
      return "rounded-tl-2xl rounded-tr-[4px] rounded-br-2xl rounded-bl-2xl";
    case "first":
      return "rounded-tl-2xl rounded-tr-[4px] rounded-br-md rounded-bl-2xl";
    case "middle":
      return "rounded-tl-2xl rounded-tr-md rounded-br-md rounded-bl-2xl";
    case "last":
      return "rounded-tl-2xl rounded-tr-md rounded-br-2xl rounded-bl-2xl";
  }
}

/* ── Reply quote ── */

function ReplyQuote({
  replyTo,
  outgoing,
}: {
  readonly replyTo: TelegramMessage;
  readonly outgoing?: boolean;
}): JSX.Element {
  const color = replyTo.senderName
    ? senderColor(replyTo.senderName)
    : outgoing ? "#7EB8E0" : "#4FC3F7";

  return (
    <div
      className="flex gap-2 mb-1 rounded-[4px] px-2 py-[5px] cursor-pointer min-w-0"
      style={{
        borderLeft: `2px solid ${color}`,
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex flex-col min-w-0 gap-[1px]">
        {replyTo.senderName && (
          <span className="text-[12px] font-semibold truncate leading-tight" style={{ color }}>
            {replyTo.senderName}
          </span>
        )}
        <span className={`text-[12px] truncate leading-tight ${outgoing ? "text-white/60" : "text-tg-text-date"}`}>
          {replyTo.text
            ? (replyTo.text.length > 100 ? replyTo.text.slice(0, 100) + "..." : replyTo.text)
            : (replyTo.mediaType ?? "Message")}
        </span>
      </div>
    </div>
  );
}

/* ── Sender avatar ── */

function SenderAvatar({
  name,
  visible,
  avatarUrl,
}: {
  readonly name: string;
  readonly visible: boolean;
  readonly avatarUrl?: string;
}): JSX.Element {
  if (!visible) {
    // Invisible spacer to maintain alignment
    return <div className="w-[35px] shrink-0" />;
  }

  return (
    <div
      className="w-[35px] h-[35px] rounded-full flex items-center justify-center shrink-0 self-end overflow-hidden"
      style={{ backgroundColor: senderColor(name) }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-semibold text-[13px] leading-none">
          {initialsFromName(name)}
        </span>
      )}
    </div>
  );
}

/* ── Inline time (Telegram-style, floats at bottom-right of last text line) ── */

function InlineTime({
  time,
  outgoing,
  sendStatus,
}: {
  readonly time: string;
  readonly outgoing?: boolean;
  readonly sendStatus?: "sending" | "sent" | "failed";
}): JSX.Element {
  if (outgoing) {
    let statusIcon: JSX.Element | null;

    if (sendStatus === "sending") {
      // Clock icon (gray)
      statusIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline-block">
          <circle cx="7" cy="7" r="5.5" stroke="#8e9ba7" strokeWidth="1.2" />
          <path d="M7 4V7.5L9 9" stroke="#8e9ba7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    } else if (sendStatus === "sent") {
      // Single checkmark (gray)
      statusIcon = (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
          <path d="M2 5L5.5 8.5L12 2" stroke="#8e9ba7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    } else if (sendStatus === "failed") {
      // Red error icon
      statusIcon = (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline-block">
          <circle cx="7" cy="7" r="5.5" stroke="#E53935" strokeWidth="1.2" />
          <path d="M7 4.5V7.5" stroke="#E53935" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="7" cy="9.5" r="0.7" fill="#E53935" />
        </svg>
      );
    } else {
      // Double green checkmarks (delivered — default)
      statusIcon = (
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="inline-block">
          <path d="M1.5 5.5L4.5 8.5L11 2" stroke="#5DB97E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 5.5L8.5 8.5L15 2" stroke="#5DB97E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }

    return (
      <span className="text-white/40 text-[11px] whitespace-nowrap inline-flex items-center gap-1 float-right relative ml-2 mt-[4px] mb-[-2px]">
        {time}
        {statusIcon}
      </span>
    );
  }

  return (
    <span className="float-right relative ml-2 mt-[4px] mb-[-2px] whitespace-nowrap text-[11px] text-tg-text-muted">
      {time}
    </span>
  );
}

/* ── Components ── */

function DateChip({ label }: { readonly label: string }): JSX.Element {
  return (
    <div className="flex justify-center w-full py-2 sticky top-0 z-10">
      <div className="rounded-xl bg-tg-bg-date px-3 py-[3px] backdrop-blur-sm">
        <span className="text-[12px] font-medium text-tg-text-date">
          {label}
        </span>
      </div>
    </div>
  );
}

function MediaContent({
  message,
  outgoing,
}: {
  readonly message: TelegramMessage;
  readonly outgoing?: boolean;
}): JSX.Element | null {
  if (!message.mediaUrl) return null;

  const type = message.mediaType ?? "";

  if (type === "photo" || type === "animation") {
    return (
      <img
        src={message.mediaUrl}
        alt=""
        loading="lazy"
        className="max-w-[300px] max-h-[400px] rounded-lg object-cover mb-1"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (type === "sticker") {
    return (
      <img
        src={message.mediaUrl}
        alt="Sticker"
        loading="lazy"
        className="w-[180px] h-[180px] object-contain mb-1"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (type === "video" || type === "video_note") {
    return (
      <video
        src={message.mediaUrl}
        controls
        preload="metadata"
        className="max-w-[300px] max-h-[300px] rounded-lg mb-1"
      />
    );
  }

  if (type === "voice" || type === "audio") {
    return (
      <div>
        <audio src={message.mediaUrl} controls preload="metadata" className="max-w-[260px] mb-1" />
        {type === "voice" && message.text && (
          <p className={`text-xs mt-1 italic ${outgoing ? "text-white/70" : "text-content-secondary"}`}>
            {message.text}
          </p>
        )}
      </div>
    );
  }

  if (type === "document") {
    const filename = message.mediaUrl.split("/").pop() ?? "Document";
    return (
      <a
        href={message.mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`mb-1 flex items-center gap-2 text-[13px] hover:underline ${outgoing ? "text-white/80" : "text-tg-accent"}`}
      >
        <Icon name="file" size={16} className="shrink-0" />
        <span className="truncate">{filename}</span>
      </a>
    );
  }

  // Fallback for unknown media types with a URL
  return (
    <a
      href={message.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`mb-1 text-[13px] italic hover:underline ${outgoing ? "text-white/80" : "text-tg-accent"}`}
    >
      {type || "Media"}
    </a>
  );
}

function IncomingBubble({
  message,
  showSender,
  showAvatar,
  position,
  replyTo,
  isGroup,
}: {
  readonly message: TelegramMessage;
  readonly showSender: boolean;
  readonly showAvatar: boolean;
  readonly position: GroupPosition;
  readonly replyTo?: TelegramMessage;
  readonly isGroup: boolean;
}): JSX.Element {
  const gap =
    position === "first" || position === "single" ? "mt-1" : "mt-[2px]";

  return (
    <div className={`flex items-end gap-[6px] max-w-[75%] ${gap}`}>
      {/* Avatar column (only in group chats) */}
      {isGroup && (
        <SenderAvatar
          name={message.senderName ?? "?"}
          visible={showAvatar}
          avatarUrl={message.senderAvatarUrl}
        />
      )}

      <div
        className={`flex min-w-0 flex-col overflow-hidden bg-tg-bg-msg-in px-[10px] pt-[6px] pb-[5px] ${incomingCorners(position)}`}
      >
        {showSender && message.senderName && (
          <span
            className="text-[13px] font-semibold mb-[2px] leading-tight"
            style={{ color: senderColor(message.senderName) }}
          >
            {message.senderName}
          </span>
        )}
        {replyTo && <ReplyQuote replyTo={replyTo} />}
        {message.mediaUrl && <MediaContent message={message} />}
        {message.text ? (
          <div className="text-tg-text text-[14px] leading-[1.4] whitespace-pre-wrap break-words">
            {renderMessageText(message.text)}
            <InlineTime time={message.time} />
          </div>
        ) : (
          <InlineTime time={message.time} />
        )}
      </div>
    </div>
  );
}

function OutgoingBubble({
  message,
  position,
  replyTo,
}: {
  readonly message: TelegramMessage;
  readonly position: GroupPosition;
  readonly replyTo?: TelegramMessage;
}): JSX.Element {
  const gap =
    position === "first" || position === "single" ? "mt-1" : "mt-[2px]";

  return (
    <div className={`flex justify-end w-full ${gap}`}>
      <div
        className={`flex max-w-[75%] min-w-0 flex-col overflow-hidden bg-tg-bg-msg-out px-[10px] pt-[6px] pb-[5px] ${outgoingCorners(position)}`}
      >
        {replyTo && <ReplyQuote replyTo={replyTo} outgoing />}
        {message.mediaUrl && <MediaContent message={message} outgoing />}
        {message.text ? (
          <div className="text-white text-[14px] leading-[1.4] whitespace-pre-wrap break-words">
            {renderMessageText(message.text)}
            <InlineTime time={message.time} outgoing sendStatus={message.sendStatus} />
          </div>
        ) : (
          <InlineTime time={message.time} outgoing sendStatus={message.sendStatus} />
        )}
      </div>
    </div>
  );
}


export function TelegramChatView({
  conversation,
  inputPlaceholder,
  loading,
  hasMore,
  onLoadMore,
  backfilling,
  hasMoreOnServer,
  onBackfill,
  onSendMessage,
  onReplyByAgent,
  isIndexed,
  onToggleIndexing,
}: TelegramChatViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // True when we should scroll to bottom on the next layout pass
  const scrollToBottomRef = useRef(true);
  // scrollHeight saved just before a prepend; useLayoutEffect uses it to restore position
  const prependScrollHeight = useRef<number | null>(null);
  // Whether the user is currently near the bottom (to auto-scroll on new messages)
  const isAtBottomRef = useRef(true);
  const contextMenu = useContextMenu<TelegramMessage>();
  const headerMenu = useContextMenu<null>();
  const pendingMessageId = useTelegramStore((s) => s.pendingMessageId);

  const headerBtnRef = useRef<HTMLDivElement>(null);
  const headerMenuItems: readonly ContextMenuEntry[] = useMemo(() => [
    {
      id: "toggle_indexing",
      label: isIndexed === false ? "Enable indexing" : "Disable indexing",
      icon: isIndexed === false ? "circle-check" : "circle-alert",
    },
  ], [isIndexed]);

  const handleOpenHeaderMenu = useCallback(() => {
    const rect = headerBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Synthesize a position below the button
    headerMenu.open(
      { clientX: rect.right, clientY: rect.bottom, preventDefault: () => { /* noop */ } } as React.MouseEvent,
      null,
    );
  }, [headerMenu]);

  const handleHeaderMenuSelect = useCallback((itemId: string) => {
    headerMenu.close();
    if (itemId === "toggle_indexing") {
      onToggleIndexing?.();
    }
  }, [headerMenu, onToggleIndexing]);

  const handleMenuSelect = useCallback((itemId: string) => {
    const msg = contextMenu.state.data;
    contextMenu.close();
    if (!msg) return;
    switch (itemId) {
      case "reply-agent":
        onReplyByAgent?.(msg);
        break;
      case "copy":
        if (msg.text) void navigator.clipboard.writeText(msg.text);
        break;
    }
  }, [contextMenu, onReplyByAgent]);

  // Scroll to bottom when chat changes
  useEffect(() => {
    scrollToBottomRef.current = true;
    isAtBottomRef.current = true;
    prependScrollHeight.current = null;
  }, [conversation?.chatId]);

  // Auto-scroll to bottom when new messages arrive at the end (live sync / send)
  const prevMsgCountRef = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/immutability -- `grouped` (a useMemo below) is only read here inside a layout effect that runs after render, so it is always initialized at call time; the source-order flag is a false positive.
    const count = grouped.length;
    const hasPending = !!pendingMessageId;

    if (scrollToBottomRef.current && !hasPending) {
      el.scrollTop = el.scrollHeight;
      scrollToBottomRef.current = false;
      prependScrollHeight.current = null;
    } else if (scrollToBottomRef.current && hasPending) {
      // Skip scroll-to-bottom — we'll scroll to target message instead
      scrollToBottomRef.current = false;
      prependScrollHeight.current = null;
    } else if (prependScrollHeight.current !== null) {
      // Only restore once the DOM has actually grown (messages prepended)
      const diff = el.scrollHeight - prependScrollHeight.current;
      if (diff > 0) {
        el.scrollTop += diff;
        prependScrollHeight.current = null;
      }
      // else: messages not yet in DOM, wait for next render
    } else if (count > prevMsgCountRef.current && isAtBottomRef.current && !hasPending) {
      // New messages appended at the bottom — follow if already at bottom
      el.scrollTop = el.scrollHeight;
    }

    prevMsgCountRef.current = count;
  });

  // After a load or backfill completes, re-check if we should continue loading
  // (user may still be near the top, or backfill just made hasMore true).
  // Skip if scroll-to-bottom hasn't executed yet (initial render / chat switch).
  useEffect(() => {
    if (loading || backfilling) return;
    if (scrollToBottomRef.current) return; // initial render not yet scrolled
    const el = scrollRef.current;
    if (!el || el.scrollTop >= 200) return;
    if (hasMore && onLoadMore) {
      prependScrollHeight.current = el.scrollHeight;
      onLoadMore();
    } else if (!hasMore && hasMoreOnServer && onBackfill) {
      onBackfill();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, backfilling]);

  // Infinite scroll: load more DB messages when near the top,
  // then backfill from Telegram server when DB is exhausted.

  // Scroll to pending message when navigating from agent chat.
  // If the message isn't loaded yet, auto-load more pages until found.
  const clearPendingMessage = useTelegramStore((s) => s.actions.setPendingMessageId);
  const pendingTelegramMsgId = useTelegramStore((s) => s.pendingTelegramMsgId);

  const messageCount = conversation?.messages.length ?? 0;
  useEffect(() => {
    if (!pendingMessageId) return;
    // Try to find by entity UUID first
    let el = document.getElementById(`tg-msg-${pendingMessageId}`);

    // Fallback: find by Telegram native message_id (entity UUID may differ between queries)
    if (!el && pendingTelegramMsgId !== undefined && conversation?.messages) {
      const match = conversation.messages.find((m) => m.telegramMsgId === pendingTelegramMsgId);
      if (match) {
        el = document.getElementById(`tg-msg-${match.id}`);
      }
    }

    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-white/5");
      setTimeout(() => { el.classList.remove("bg-white/5"); }, 2000);
      clearPendingMessage(undefined);
      return;
    }

    // Message not in DOM — load more if possible
    if (!loading && !backfilling) {
      if (hasMore && onLoadMore) {
        onLoadMore();
      } else if (!hasMore && hasMoreOnServer && onBackfill) {
        onBackfill();
      } else {
        // No more messages to load — give up
        clearPendingMessage(undefined);
      }
    }
  }, [pendingMessageId, pendingTelegramMsgId, clearPendingMessage, messageCount, loading, backfilling, hasMore, onLoadMore, hasMoreOnServer, onBackfill, conversation?.messages]);

  // Deduplicate messages by id
  const dedupedMessages = useMemo(() => {
    if (!conversation) return [];
    const seen = new Set<string>();
    return conversation.messages.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.messages]);

  // Detect group chat (multiple distinct senders)
  const isGroup = useMemo(
    () => detectIsGroup(dedupedMessages),
    [dedupedMessages],
  );

  // Group messages for rendering
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the React Compiler bails on this large component (see the layout-effect ordering above); this useMemo's deps are exhaustive and correct, so the manual memoization is kept intentionally.
  const grouped = useMemo(
    () => groupMessages(dedupedMessages, isGroup),
    [dedupedMessages, isGroup],
  );

  // Build a lookup map: telegramMsgId -> TelegramMessage (for reply resolution)
  const msgLookup = useMemo(() => {
    const map = new Map<number, TelegramMessage>();
    for (const m of dedupedMessages) {
      if (m.telegramMsgId !== undefined) {
        map.set(m.telegramMsgId, m);
      }
    }
    return map;
  }, [dedupedMessages]);
  const chatTitle = normalizeTelegramChatTitle(conversation?.contactName);

  if (!conversation) {
    return (
      <DetailPane>
        <div className="flex items-center justify-center h-full text-content-tertiary text-base">
          Select an item to view details
        </div>
      </DetailPane>
    );
  }

  return (
    <DetailPane
      scrollY={false}
      contentClassName="p-0"
      headerNode={
        <TopBarHeader
          leading={null}
          title={chatTitle}
          subtitle={`${String(conversation.messageTotal)} messages`}
          actions={(
            <div ref={headerBtnRef}>
              <IconButton variant="ghost" onClick={handleOpenHeaderMenu}>
                <Icon name="ellipsis-vertical" size={18} />
              </IconButton>
            </div>
          )}
        />
      }
      footer={
        <PaneFooterBar tone="surface-tertiary" inset="md" withTopBorder={false} className="!pt-4 !pb-6">
          <div className="flex-1 flex justify-center">
            <div className="w-[92%]">
          <TelegramReplyComposer
            chatId={conversation.chatId}
            onSendMessage={onSendMessage}
            placeholder={inputPlaceholder}
            disabled={!onSendMessage}
          />
            </div>
          </div>
        </PaneFooterBar>
      }
    >
      {headerMenu.state.isOpen && (
        <ContextMenu
          items={headerMenuItems}
          position={headerMenu.state.position}
          onSelect={handleHeaderMenuSelect}
          onClose={headerMenu.close}
        />
      )}

      <div className="flex h-full flex-1 flex-col">
        {(loading === true || backfilling === true) && (
          <div className="flex justify-center py-2">
            <span className="text-content-tertiary text-xs animate-pulse">
              {backfilling ? "Loading from Telegram..." : "Loading..."}
            </span>
          </div>
        )}

        <Virtuoso
          ref={virtuosoRef}
          data={grouped}
          initialTopMostItemIndex={grouped.length > 0 ? grouped.length - 1 : 0}
          followOutput="smooth"
          className="flex-1 py-2 overflow-x-hidden"
          increaseViewportBy={{ top: 400, bottom: 200 }}
          atTopStateChange={(atTop) => {
            if (!atTop) return;
            // Page through DB history first; once the local DB is exhausted,
            // backfill older history from the Telegram server.
            if (hasMore && onLoadMore) onLoadMore();
            else if (hasMoreOnServer && onBackfill) onBackfill();
          }}
          itemContent={(_index, { msg, position, showDate, showSender, showAvatar }) => {
            if (msg.senderName === "__date__") {
              return <DateChip label={msg.time} />;
            }

            const replyTo = msg.replyToMsgId !== undefined
              ? msgLookup.get(msg.replyToMsgId)
              : undefined;

            return (
              <div id={`tg-msg-${msg.id}`} className="px-4" onContextMenu={(e) => { contextMenu.open(e, msg); }}>
                {showDate && msg.date && (
                  <DateChip label={formatDateSeparator(msg.date)} />
                )}
                {msg.direction === "out" ? (
                  <OutgoingBubble message={msg} position={position} replyTo={replyTo} />
                ) : (
                  <IncomingBubble
                    message={msg}
                    showSender={showSender}
                    showAvatar={showAvatar}
                    position={position}
                    replyTo={replyTo}
                    isGroup={isGroup}
                  />
                )}
              </div>
            );
          }}
        />
      </div>

      {contextMenu.state.isOpen && (
        <ContextMenu
          items={MESSAGE_MENU_ITEMS}
          position={contextMenu.state.position}
          onSelect={handleMenuSelect}
          onClose={contextMenu.close}
        />
      )}
    </DetailPane>
  );
}
