/** tst_fe_tg_theme_001 — the chat pane's own theming, after design polish.
 *
 * Moved here from the host's `frontend/src/__tests__/pluginHostIntegration/`,
 * where it reached into a `plugins-public` submodule checkout to render this
 * component. Everything it asserts is THIS package's: which tg-* tokens the
 * bubbles carry, and — the reason it was written — which backgrounds the
 * plugin gave UP when `DetailPane` took over the frame. A plugin that starts
 * painting `bg-tg-bg` on the pane again double-paints over the host's own
 * surface, and only this test would notice.
 *
 * Its other half stayed in the host: the `--color-tg-*` definitions live in
 * `frontend/src/app.css`, so asserting them is the host's business
 * (`tst_fe_tg_theme_002`, `tst_fe_tg_theme_003` there).
 *
 * @scenario: scn_tg_chat_theme_001
 * @deterministic: yes
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { forwardRef, type ReactNode } from "react";

import type { TelegramConversation } from "../types";

// Virtuoso virtualises; render every row inline so the DOM is inspectable.
vi.mock("react-virtuoso", () => ({
  Virtuoso: forwardRef(function MockVirtuoso(
    {
      data,
      itemContent,
    }: {
      data: readonly unknown[];
      itemContent: (index: number, item: unknown) => ReactNode;
    },
    _ref,
  ) {
    return (
      <div data-testid="virtuoso-scroller">
        {data.map((item, index) => (
          <div key={index}>{itemContent(index, item)}</div>
        ))}
      </div>
    );
  }),
}));

vi.mock("../store", () => ({
  useTelegramStore: (selector?: (s: Record<string, unknown>) => unknown): unknown => {
    const state = {
      pendingMessageId: undefined,
      pendingTelegramMsgId: undefined,
      actions: { setPendingMessageId: vi.fn() },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("../TelegramReplyComposer", () => ({
  TelegramReplyComposer: (): ReactNode => <div data-testid="telegram-reply-composer" />,
}));

vi.mock("../index", () => ({ MESSAGE_MENU_ITEMS: [] }));

const CONVERSATION: TelegramConversation = {
  chatId: "chat-1",
  contactName: "Ops",
  contactInitials: "O",
  contactAvatarColor: "#333",
  messageTotal: 1,
  messages: [
    {
      id: "msg-1",
      direction: "in",
      senderName: "",
      text: "hello",
      time: "12:00",
      date: "2026-04-10",
    },
  ],
};

describe("TelegramChatView theme isolation", () => {
  it("tst_fe_tg_theme_001 keeps the dark chat pane layout as it was before design polish", async () => {
    /**
     * @test-id: tst_fe_tg_theme_001
     * @covers: plugins/modules/telegram/ui/TelegramChatView.tsx::TelegramChatView
     */
    const { TelegramChatView } = await import("../TelegramChatView");

    const { container } = render(
      <TelegramChatView conversation={CONVERSATION} inputPlaceholder="Type a message..." />,
    );

    // The frame, header and content backgrounds belong to the host's
    // DetailPane now. The plugin owns contentClassName, the header node and
    // the footer — and must not paint the surfaces it handed over.
    const paneContent = screen.getByTestId("pane-content");
    expect(paneContent.className).toContain("p-0");
    expect(paneContent.className).not.toContain("bg-tg-bg");
    expect(paneContent.className).not.toContain("telegram-chat-canvas");
    expect(screen.getByTestId("top-bar-header").dataset.titleClass).toBeUndefined();

    const footer = container.querySelector('[data-host="PaneFooterBar"]');
    expect(footer, "the composer sits in a PaneFooterBar").not.toBeNull();
    expect(footer?.className).not.toContain("bg-tg-bg-list");
    expect(footer?.className).not.toContain("bg-white");

    // What the plugin DOES own: the bubbles and their text.
    const incomingText = screen.getByText("hello");
    expect(incomingText.parentElement?.className).toContain("bg-tg-bg-msg-in");
    expect(incomingText.className).toContain("text-tg-text");

    expect(screen.getByText("12:00").className).toContain("text-tg-text-muted");
    expect(screen.getByText("10 April").parentElement?.className).toContain("bg-tg-bg-date");
  });
});
