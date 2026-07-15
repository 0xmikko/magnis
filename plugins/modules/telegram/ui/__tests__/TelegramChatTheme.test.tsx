import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { forwardRef, type ReactNode } from "react";
import type { TelegramConversation } from "../types";

// Telegram message tokens still live in the host stylesheet (frontend/src/app.css)
// until the Stage-6e CSS extraction; this guard reaches across the plugin
// boundary to assert the host hasn't dropped them during design changes.
const APP_CSS = resolve(import.meta.dirname, "../../../../../frontend/src/app.css");

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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useTelegramStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      pendingMessageId: undefined,
      pendingTelegramMsgId: undefined,
      actions: { setPendingMessageId: vi.fn() },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@magnis/host/ui", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  Icon: ({ name, className }: { name: string; className?: string }) => <span data-icon={name} className={className} />,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  IconButton: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  TopBarHeader: ({
    titleClassName,
    subtitleClassName,
  }: {
    readonly titleClassName?: string;
    readonly subtitleClassName?: string;
  }) => (
    <div
      data-testid="top-bar-header"
      data-title-class={titleClassName}
      data-subtitle-class={subtitleClassName}
    />
  ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  ContextMenu: () => null,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useContextMenu: () => ({
    state: { isOpen: false, data: null, position: { x: 0, y: 0 } },
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

// Host DetailPane is opaque behind @magnis/host/layout — its internal frame/
// header/content theming is the host's concern, not the plugin's. The mock
// reproduces only DetailPane's structural contract the plugin depends on:
// it renders the supplied headerNode + footer and applies contentClassName to
// the content region, so the plugin-owned theming choices stay observable.
vi.mock("@magnis/host/layout", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  DetailPane: ({
    children,
    headerNode,
    footer,
    contentClassName,
  }: {
    children: ReactNode;
    headerNode?: ReactNode;
    footer?: ReactNode;
    contentClassName?: string;
  }) => (
    <div data-testid="detail-pane">
      {headerNode}
      <div data-testid="pane-content" className={contentClassName}>{children}</div>
      {footer}
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneFooterBar: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="telegram-footer" className={className}>{children}</div>
  ),
}));

vi.mock("../TelegramReplyComposer", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  TelegramReplyComposer: () => <div data-testid="telegram-reply-composer" />,
}));

vi.mock("..", () => ({
  MESSAGE_MENU_ITEMS: [],
}));

const CONVERSATION: TelegramConversation = {
  chatId: "chat-1",
  contactName: "Ops",
  contactInitials: "O",
  contactAvatarColor: "#333",
  status: "online",
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
     * @scenario: scn_tg_chat_theme_001
     * @covers: frontend/src/modules/telegram/TelegramChatView.tsx::TelegramChatView
     * @deterministic: yes
     */
    const { TelegramChatView } = await import("../TelegramChatView");

    render(
      <TelegramChatView
        conversation={CONVERSATION}
        inputPlaceholder="Type a message..."
      />,
    );

    // DetailPane's frame/header backgrounds are owned by the host primitive now;
    // the plugin only controls contentClassName, the header node, and the footer.
    expect(screen.getByTestId("pane-content").className).toContain("p-0");
    expect(screen.getByTestId("pane-content").className).not.toContain("bg-tg-bg");
    expect(screen.getByTestId("pane-content").className).not.toContain("telegram-chat-canvas");
    expect(screen.getByTestId("top-bar-header").dataset.titleClass).toBeUndefined();
    expect(screen.getByTestId("telegram-footer").className).not.toContain("bg-tg-bg-list");
    expect(screen.getByTestId("telegram-footer").className).not.toContain("bg-white");

    const incomingText = screen.getByText("hello");
    const incomingBubble = incomingText.parentElement;
    expect(incomingBubble?.className).toContain("bg-tg-bg-msg-in");
    expect(incomingText.className).toContain("text-tg-text");

    expect(screen.getByText("12:00").className).toContain("text-tg-text-muted");
    expect(screen.getByText("10 April").parentElement?.className).toContain("bg-tg-bg-date");
  });

  it("tst_fe_tg_theme_002 overrides telegram tokens only inside light appearance", () => {
    /**
     * @test-id: tst_fe_tg_theme_002
     * @scenario: scn_tg_chat_theme_001
     * @covers: frontend/src/app.css::[data-theme="light"]
     * @deterministic: yes
     */
    const css = readFileSync(APP_CSS, "utf8");
    const lightBlockMatch = /\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/.exec(css);
    if (!lightBlockMatch?.[1]) {
      throw new Error("light theme block not found in app.css");
    }

    const lightBlock = lightBlockMatch[1];
    expect(lightBlock).toContain("--color-tg-bg: #ffffff;");
    expect(lightBlock).toContain("--color-tg-bg-msg-in: #f1f1f1;");
    expect(lightBlock).toContain("--color-tg-bg-msg-out: #4f9bd8;");
    expect(lightBlock).toContain("--color-tg-bg-date: transparent;");
    expect(lightBlock).toContain("--color-tg-text: #111111;");
  });

  it("tst_fe_tg_theme_003 keeps the dark telegram message tokens from before design polish", () => {
    /**
     * @test-id: tst_fe_tg_theme_003
     * @scenario: scn_tg_chat_theme_001
     * @covers: frontend/src/app.css::@theme
     * @deterministic: yes
     */
    const css = readFileSync(APP_CSS, "utf8");
    const themeBlockMatch = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
    if (!themeBlockMatch?.[1]) {
      throw new Error("@theme block not found in app.css");
    }

    const themeBlock = themeBlockMatch[1];
    expect(themeBlock).toContain("--color-tg-bg: #0e1621;");
    expect(themeBlock).toContain("--color-tg-bg-list: #17212b;");
    expect(themeBlock).toContain("--color-tg-bg-msg-in: #182533;");
    expect(themeBlock).toContain("--color-tg-bg-msg-out: #2b5278;");
    expect(themeBlock).toContain("--color-tg-bg-date: #182533cc;");
  });
});
