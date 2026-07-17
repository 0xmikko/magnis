/**
 * @test-id: tst_plg_tgui_header_total_001..002
 * @scenario: scn_telegram_chat_header_total
 * @covers: plugins/modules/telegram/ui/hooks/useTelegramMessages.ts,
 *          plugins/modules/telegram/ui/TelegramChatView.tsx
 * @deterministic: yes
 *
 * Bug (live-verified, stack A): the chat header said "50 messages" while the
 * chat held far more in the graph. `messages.list` returns the chat's REAL
 * graph total (`page.total` via list_entities_window filter_eq chat_id), but
 * the conversation model froze the total of the FIRST cached page and never
 * advanced it as later pages / backfills reported a larger one — so the header
 * number degenerated to the loaded-page length.
 *
 * Contract under test: TelegramConversation carries a typed `messageTotal`
 * (the newest RPC total for this chat, in message units); the header renders
 * it and NEVER `messages.length`.
 *
 * Test environment: happy-dom (closed-frontend vitest lane)
 * Clients: renderHook / render (testing-library)
 * Mocks: @magnis/host/runtime transport, react-virtuoso, host ui/layout shims
 * Data: inline paginated responses (PAGE_SIZE = 50)
 */

import { render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramConversation } from "../types";
import type { TelegramMessageListItem } from "../types";

// ── Mocks ────────────────────────────────────────────────────────

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@magnis/host/runtime", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  const queryClientForRuntime = new QC({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    useAppRuntime: () => ({
      transport: {
        baseUrl: "http://test",
        rpc: rpcMock,
        onEventType: (): (() => void) => (): void => undefined,
      },
      queryClient: queryClientForRuntime,
      agent: { setReplyTo: (): void => undefined },
    }),
  };
});

// PAGE_SIZE lives in the module barrel; mock it so the test does not pull the
// whole plugin UI (and its host deps) in.
const indexMock = vi.hoisted(() => ({
  PAGE_SIZE: 50,
  MESSAGE_MENU_ITEMS: [],
  TELEGRAM_SENDER_COLORS: ["#8774e1"],
  TELEGRAM_AVATAR_COLORS: ["#8774e1"],
  MEDIA_LABELS: {},
  CHAT_CACHE_KEY: "tg-chat-cache-test",
  CHAT_CACHE_TTL: 60_000,
}));
vi.mock("../index.tsx", () => indexMock);
vi.mock("..", () => indexMock);

vi.mock("react-virtuoso", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: readonly unknown[];
    itemContent: (index: number, item: unknown) => ReactNode;
  }) => (
    <div data-testid="virtuoso-scroller">
      {data.map((item, i) => (
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        <div key={i}>{itemContent(i, item)}</div>
      ))}
    </div>
  ),
}));

vi.mock("../store", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useTelegramStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      pendingMessageId: undefined,
      pendingTelegramMsgId: undefined,
      actions: { setPendingMessageId: (): void => undefined },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@magnis/host/ui", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  IconButton: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  // The real TopBarHeader renders `subtitle` as text — expose it verbatim.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  TopBarHeader: ({ subtitle }: { subtitle?: ReactNode }) => (
    <div data-testid="top-bar-header">{subtitle}</div>
  ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  ContextMenu: () => null,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useContextMenu: () => ({
    state: { isOpen: false, data: null, position: { x: 0, y: 0 } },
    open: (): void => undefined,
    close: (): void => undefined,
  }),
}));

vi.mock("@magnis/host/layout", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  DetailPane: ({ children, headerNode }: { children?: ReactNode; headerNode?: ReactNode }) => (
    <div>
      {headerNode}
      {children}
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneFooterBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneFrame: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  PaneHeaderBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────

function msgItem(i: number): TelegramMessageListItem {
  return {
    id: `msg-${String(i)}`,
    schema_id: "telegram.message",
    sender: "Someone",
    subject: null,
    preview: `text ${String(i)}`,
    channel: "telegram",
    timestamp: `2026-07-16T10:${String(i % 60).padStart(2, "0")}:00Z`,
    created_at: `2026-07-16T10:${String(i % 60).padStart(2, "0")}:00Z`,
    metadata: { message_id: i, chat_title: "Gearbox SC devs" },
  } as unknown as TelegramMessageListItem;
}

function page(count: number, total: number, offset: number): {
  items: TelegramMessageListItem[];
  total: number;
  limit: number;
  offset: number;
} {
  return {
    items: Array.from({ length: count }, (_, i) => msgItem(offset + i)),
    total,
    limit: 50,
    offset,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("telegram chat header total (graph total, never page length)", () => {
  // The conversation model must report the chat's REAL graph total from the
  // NEWEST list response — after a backfill lands more history and a later
  // page reports total=250, the model must say 250, not the first page's 50
  // and not the loaded length (100).
  it("tst_plg_tgui_header_total_001 messageTotal follows the newest RPC total, not page length", async () => {
    rpcMock.mockImplementation((method: string, params: Record<string, unknown>) => {
      if (method !== "telegram.messages.list") {
        return Promise.reject(new Error(`unexpected rpc ${method}`));
      }
      const offset = (params.offset as number | undefined) ?? 0;
      // Initial open: the graph holds 50 messages for this chat.
      if (offset === 0) return Promise.resolve(page(50, 50, 0));
      // After a backfill ingested more, a later page reports the grown total.
      return Promise.resolve(page(50, 250, offset));
    });

    const { useTelegramMessages } = await import("../hooks/useTelegramMessages");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): React.ReactElement => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTelegramMessages("chat-entity-1", []), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.conversation).toBeDefined();
    });
    expect(result.current.conversation?.messageTotal).toBe(50);

    // A later page (the post-backfill reload path) reports total = 250.
    await act(async () => {
      await result.current.fetchMessages("chat-entity-1", 50, true);
    });

    expect(result.current.conversation?.messages.length).toBe(100);
    expect(result.current.conversation?.messageTotal).toBe(250);
  });

  // The header subtitle is a function of messageTotal — with 3 loaded
  // messages and a graph total of 250 it must read "250 messages".
  it("tst_plg_tgui_header_total_002 header renders messageTotal, never messages.length", async () => {
    const { TelegramChatView } = await import("../TelegramChatView");

    const conversation: TelegramConversation = {
      chatId: "chat-1",
      contactName: "Gearbox SC devs",
      contactInitials: "GS",
      contactAvatarColor: "#333",
      messageTotal: 250,
      messages: [
        { id: "m1", direction: "in", senderName: "A", text: "hi", time: "12:00", date: "2026-07-16" },
        { id: "m2", direction: "out", text: "hey", time: "12:01", date: "2026-07-16" },
        { id: "m3", direction: "in", senderName: "A", text: "yo", time: "12:02", date: "2026-07-16" },
      ],
    };

    render(<TelegramChatView conversation={conversation} inputPlaceholder="Message..." />);

    expect(screen.getByTestId("top-bar-header").textContent).toBe("250 messages");
    expect(screen.queryByText("3 messages")).toBeNull();
  });
});
