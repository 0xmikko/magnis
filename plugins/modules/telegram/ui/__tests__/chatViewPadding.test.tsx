/**
 * Bug: Outgoing message bubbles extend to the right edge of the chat pane
 * with no padding gap. The root cause is that `px-4` padding is applied to
 * the Virtuoso scroller element, but Virtuoso's virtualised items don't
 * inherit scroller padding for their width calculation. Padding must be on
 * each item wrapper instead.
 *
 * This test renders TelegramChatView with outgoing messages and asserts that
 * individual message items carry horizontal padding.
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramConversation } from "../types";

// ── Mocks ────────────────────────────────────────────────────────

// Mock react-virtuoso: render items inline so we can inspect DOM
vi.mock("react-virtuoso", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  Virtuoso: ({
    data,
    itemContent,
    className,
  }: {
    data: readonly unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="virtuoso-scroller" className={className}>
      {data.map((item, i) => (
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        <div key={i} data-testid={`virtuoso-item-${i}`}>
          {itemContent(i, item)}
        </div>
      ))}
    </div>
  ),
}));

// Mock telegram store
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

// Mock UI components used by TelegramChatView
vi.mock("@magnis/host/ui", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  IconButton: ({ children, ...props }: Record<string, unknown>) => (
    <button {...props}>{children as React.ReactNode}</button>
  ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  TopBarHeader: () => <div data-testid="top-bar-header" />,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  ContextMenu: () => null,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useContextMenu: () => ({
    state: { isOpen: false, data: null, position: { x: 0, y: 0 } },
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@magnis/host/layout", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  DetailPane: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneFooterBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneHeaderBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("..", () => ({
  MESSAGE_MENU_ITEMS: [],
}));

// ── Fixture ──────────────────────────────────────────────────────

const CONVERSATION: TelegramConversation = {
  chatId: "chat-1",
  contactName: "Test User",
  contactInitials: "TU",
  contactAvatarColor: "#333",
  messageTotal: 3,
  messages: [
    {
      id: "msg-1",
      direction: "out",
      text: "Hello world!",
      time: "12:00",
      date: "2026-04-10",
    },
    {
      id: "msg-2",
      direction: "in",
      senderName: "",
      text: "Hi there!",
      time: "12:01",
      date: "2026-04-10",
    },
    {
      id: "msg-3",
      direction: "out",
      text: "How are you?",
      time: "12:02",
      date: "2026-04-10",
    },
  ],
};

// ── Test ─────────────────────────────────────────────────────────

describe("TelegramChatView message padding", () => {
  it("applies horizontal padding to each message item, not the scroller", async () => {
    // Dynamic import to ensure mocks are in place
    const { TelegramChatView } = await import("../TelegramChatView");

    const { getByTestId, getAllByTestId } = render(
      <TelegramChatView
        conversation={CONVERSATION}
        inputPlaceholder="Message..."
      />,
    );

    // 1. The Virtuoso scroller must NOT carry horizontal padding
    //    (padding on scroller doesn't constrain virtualised items)
    const scroller = getByTestId("virtuoso-scroller");
    const scrollerClasses = scroller.className;
    expect(scrollerClasses).not.toMatch(/\bpx-\d/);

    // 2. Each message item wrapper MUST have horizontal padding (px-4)
    const items = getAllByTestId(/^virtuoso-item-/);
    expect(items.length).toBeGreaterThanOrEqual(2);

    for (const item of items) {
      // The direct child of the virtuoso item is the message wrapper div
      const messageWrapper = item.firstElementChild as HTMLElement;
      expect(messageWrapper).toBeTruthy();
      expect(messageWrapper.className).toMatch(/\bpx-4\b/);
    }
  });
});
