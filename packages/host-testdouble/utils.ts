/** `@magnis/host/utils` — the host's pure formatting helpers.
 *
 * These are the one part of the host surface a double cannot fake. A plugin
 * that renders `formatMessageTime(msg.at)` and asserts "12:00" is asserting
 * its OWN behaviour; it just needs the same answer the host would give. So
 * these are reimplementations, not stand-ins, and `__tests__/utils.test.ts`
 * pins each one.
 */
import type { AvatarColor } from "@/modules/shared/types";
import type { IconName } from "@/components/ui/Icon";

const AVATAR_COLORS: readonly AvatarColor[] = ["orange", "blue", "green", "red", "purple", "pink"];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

export function toAvatarColor(color: string): AvatarColor {
  return AVATAR_COLORS.includes(color as AvatarColor) ? (color as AvatarColor) : "blue";
}

export function pickAvatarColor(key: string): AvatarColor {
  return AVATAR_COLORS[Math.abs(hashCode(key)) % AVATAR_COLORS.length] ?? "blue";
}

export function initialsFromName(name: string, maxLength = 2): string {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .slice(0, maxLength)
    .toUpperCase();
  return initials || "?";
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

export function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "now";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 0) return "";
  if (diffMins < 60) return `${String(diffMins)}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${String(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${String(diffDays)}d ago`;
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatEmailDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return (
    date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeToIcon(mimeType: string): IconName {
  if (mimeType.startsWith("image/")) return "file-image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "activity";
  if (mimeType === "application/pdf") return "file";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "file";
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "archive";
  return "file";
}

export function renderableMediaUrl(url: string | null): string | null {
  // Synthetic RFC-reserved hosts never become browser requests.
  if (!url) return null;
  try {
    const hostname = new URL(url, "http://magnis.local").hostname.toLowerCase();
    if (hostname === "example" || hostname.endsWith(".example")) return null;
  } catch {
    return url;
  }
  return url;
}
