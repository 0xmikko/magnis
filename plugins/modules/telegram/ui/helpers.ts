import type { TelegramChat } from "./types";
import { hashCode } from "./utils/hash";
import {
  MEDIA_LABELS,
  TELEGRAM_AVATAR_COLORS,
  TELEGRAM_SENDER_COLORS,
  CHAT_CACHE_KEY,
  CHAT_CACHE_TTL,
} from "./index.tsx";

export function mediaLabel(mediaType: string | undefined): string {
  if (!mediaType) return "";
  return MEDIA_LABELS[mediaType] ?? "Media";
}

export function formatChatListTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Yesterday";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function pickAvatarColor(key: string): string {
  return TELEGRAM_AVATAR_COLORS[Math.abs(hashCode(key)) % TELEGRAM_AVATAR_COLORS.length] ?? "#4A90D9";
}

export function resolveAvatarUrl(baseUrl: string, rawUrl: string | null): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${baseUrl}${rawUrl}`;
}

export function loadCachedChats(): { chats: TelegramChat[]; total: number } | null {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const cached = JSON.parse(raw);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (Date.now() - cached.ts > CHAT_CACHE_TTL) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return cached;
  } catch {
    return null;
  }
}

export function senderColor(name: string): string {
   
  return TELEGRAM_SENDER_COLORS[Math.abs(hashCode(name)) % TELEGRAM_SENDER_COLORS.length];
}

export function saveChatCache(chats: TelegramChat[], total: number): void {
  try {
    localStorage.setItem(
      CHAT_CACHE_KEY,
      JSON.stringify({ chats, total, ts: Date.now() }),
    );
  } catch {
    /* quota exceeded — ignore */
  }
}
