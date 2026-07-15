/**
 * tst_fe_telegram_expand_001 — telegramMessageHasMore false for short text, true past 140 chars or newline.
 * tst_fe_telegram_expand_002 — TelegramMessageCard expanded layout renders full text.
 * tst_fe_telegram_expand_003 — telegramChatHasMore true for members / chat_type / created_at.
 * tst_fe_telegram_expand_004 — TelegramChatCard expanded layout renders type/members/created/last-msg.
 * tst_fe_telegram_expand_005 — Chevron flips TelegramMessageCard via context.
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import {
  TelegramMessageCard,
  TelegramChatCard,
  telegramMessageHasMore,
  telegramChatHasMore,
} from "../EntityCards";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { ExpansionContext } from "@magnis/host/agent";
import type { AppRuntime } from "@magnis/host/runtime";
import type { EntityRendererRegistration } from "@magnis/host/runtime";

function mockRuntime(registration: EntityRendererRegistration | null): AppRuntime {
  return {
    agent: { resolveEntityRenderer: () => registration },
    transport: { rpc: vi.fn().mockResolvedValue({}) },
    modules: { get: () => undefined },
  } as unknown as AppRuntime;
}

describe("tst_fe_telegram_expand_001 — telegramMessageHasMore", () => {
  it("false for short text", () => {
    expect(telegramMessageHasMore({ preview: "Short message" })).toBe(false);
  });
  it("true past 140 chars", () => {
    expect(telegramMessageHasMore({ preview: "x".repeat(200) })).toBe(true);
  });
  it("true when text contains newline", () => {
    expect(telegramMessageHasMore({ preview: "line1\nline2" })).toBe(true);
  });
});

describe("tst_fe_telegram_expand_002 — TelegramMessageCard expanded layout", () => {
  it("renders full text when ExpansionContext.expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <TelegramMessageCard
          schemaId="telegram.message"
          data={{ preview: "Full message text", sender: "Anna" }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("Full message text")).toBeTruthy();
  });
});

describe("tst_fe_telegram_expand_003 — telegramChatHasMore", () => {
  it.each([
    { members: [{ name: "Anna" }] },
    { chat_type: "group" },
    { created_at: "2026-04-18T10:00:00Z" },
  ])("true for %o", (d) => {
    expect(telegramChatHasMore(d)).toBe(true);
  });
  it("false without any of those", () => {
    expect(telegramChatHasMore({ chat_title: "Chat", last_message: "hi" })).toBe(false);
  });
});

describe("tst_fe_telegram_expand_004 — TelegramChatCard expanded layout", () => {
  it("renders type/members/created/last msg when expanded=true", () => {
    const runtime = mockRuntime(null);
    const { getByText } = render(
      <ExpansionContext.Provider value={{ bare: false, expanded: true }}>
        <TelegramChatCard
          schemaId="telegram.chat"
          data={{
            chat_title: "Launch team",
            chat_type: "group",
            created_at: "2026-04-18T10:00:00Z",
            last_message: "see you soon",
            members: [{ name: "Anna" }, { username: "bob" }, { display_name: "Clara" }],
          }}
          runtime={runtime}
        />
      </ExpansionContext.Provider>,
    );
    expect(getByText("group")).toBeTruthy();
    expect(getByText(/Anna, @bob, Clara/)).toBeTruthy();
    expect(getByText("2026-04-18T10:00:00Z")).toBeTruthy();
    expect(getByText("see you soon")).toBeTruthy();
  });
});

describe("tst_fe_telegram_expand_005 — chevron flips TelegramMessageCard via context", () => {
  it("renders the full body only after clicking the chevron", () => {
    const longText = "x".repeat(200);
    const registration: EntityRendererRegistration = {
      id: "telegram-message",
      moduleId: "telegram",
      schemaMatch: "telegram.message",
      Render: TelegramMessageCard,
      hasMore: (d) => telegramMessageHasMore(d),
    };
    const runtime = mockRuntime(registration);
    const { getByTestId, queryAllByText, container } = render(
      <ExpandableEntityCard
        schemaId="telegram.message"
        data={{ preview: longText, sender: "Anna" }}
        runtime={runtime}
      />,
    );
    // Compact body is a <p> with line-clamp-2 (no whitespace-pre-wrap).
    // Expanded body is a <div> with whitespace-pre-wrap.
    const expandedBefore = container.querySelector("div.whitespace-pre-wrap");
    expect(expandedBefore).toBeNull();
    act(() => { fireEvent.click(getByTestId("expand-chevron")); });
    const expandedAfter = container.querySelector("div.whitespace-pre-wrap");
    expect(expandedAfter).toBeTruthy();
    expect(queryAllByText(longText).length).toBeGreaterThan(0);
  });
});
