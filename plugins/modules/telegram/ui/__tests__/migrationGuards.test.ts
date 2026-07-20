/**
 * Migration guards for the telegram plugin UI.
 *
 * Relocated from the host-side guards when the telegram domain module moved
 * out of frontend/src/modules/telegram into this plugin:
 *   - src/modules/__tests__/queryMigration.test.ts           (react-query migration)
 *   - src/modules/__tests__/storeAndTransportMigration.test.ts (runtime transport)
 *   - src/modules/_base/__tests__/BaseToolCallCard.test.ts    (shared card)
 *
 * They assert the same invariants those host guards enforced — no useWebSocket,
 * react-query for initial data + cache invalidation, runtime transport for sync,
 * and the shared BaseToolCallCard — now reading from the plugin's own source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const UI_ROOT = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(UI_ROOT, relativePath), "utf-8");
}

describe("Query migration: Telegram", () => {
  it("useTelegramChatList does NOT import useWebSocket", () => {
    expect(readSource("hooks/useTelegramChatList.ts")).not.toContain("useWebSocket");
  });

  it("useTelegramChatList uses query hook for initial data", () => {
    expect(readSource("hooks/useTelegramChatList.ts")).toContain("useTelegramChatsQuery");
  });

  it("useTelegramMessages does NOT import useWebSocket", () => {
    expect(readSource("hooks/useTelegramMessages.ts")).not.toContain("useWebSocket");
  });

  it("useTelegramMessages uses query hook for initial data", () => {
    expect(readSource("hooks/useTelegramMessages.ts")).toContain("useTelegramMessagesQuery");
  });

  it("queries.ts exports useTelegramMessagesQuery", () => {
    expect(readSource("queries.ts")).toContain("useTelegramMessagesQuery");
  });

  it("fetchChats(0, false) invalidates query cache for refresh", () => {
    const src = readSource("hooks/useTelegramChatList.ts");
    expect(src).toContain("invalidateQueries");
    expect(src).toContain("telegramKeys.chats()");
  });

  it("fetchMessages(chatId, 0, false) invalidates query cache for refresh", () => {
    expect(readSource("hooks/useTelegramMessages.ts")).toContain("telegramKeys.messages(chatId)");
  });
});

describe("W3: useTelegramSync uses runtime transport", () => {
  it("does NOT import useWebSocket", () => {
    expect(readSource("hooks/useTelegramSync.ts")).not.toContain("useWebSocket");
  });

  it("uses useAppRuntime", () => {
    expect(readSource("hooks/useTelegramSync.ts")).toContain("useAppRuntime");
  });
});

describe("INV-7: telegram tool-call renderer reuses BaseToolCallCard", () => {
  it("imports BaseToolCallCard", () => {
    expect(readSource("TelegramToolCallRenderer.tsx")).toContain("BaseToolCallCard");
  });

  it("does not define its own badge calculation", () => {
    const src = readSource("TelegramToolCallRenderer.tsx");
    expect(src).not.toContain("bg-emerald");
    expect(src).not.toContain("bg-red-500/20");
  });
});
