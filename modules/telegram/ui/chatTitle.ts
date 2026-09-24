import { NEW_CHAT_TITLE } from "./index.tsx";

/**
 * Some chats can arrive with blank or placeholder titles from upstream data.
 * Normalize those to a stable UI label.
 */
export function normalizeTelegramChatTitle(
  title: string | null | undefined,
): string {
  const trimmed = (title ?? "").trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "—") {
    return NEW_CHAT_TITLE;
  }
  return trimmed;
}

