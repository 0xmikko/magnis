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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { forwardRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setHostRuntime } from "../../../../packages/host-testdouble/runtime";

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

vi.mock("../index", () => ({ MESSAGE_MENU_ITEMS: [], INPUT_PLACEHOLDER: "Write a message", TELEGRAM_AVATAR_COLORS: ["#333"] }));
vi.mock("../hooks/useTelegramMessages", () => ({ useTelegramMessages: () => ({ conversation: CONVERSATION, canSend: false }) }));
vi.mock("../hooks/useTelegramSync", () => ({ useTelegramSync: () => undefined }));

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
  it.each(["denied", "saveFailed", "applyFailed"])("reports %s without confusing a saved choice with an applied choice", async (failure) => {
    let syncEnabled = true;
    const rpc = vi.fn(async (method: string) => {
      if (method === "telegram.chats.get") return { entity_id: "chat-1", chat_id: "42", account_id: "account", chat_title: "Ops", indexed: false, syncEnabled };
      if (method !== "telegram.chat.setSyncEnabled") throw new Error(`Unexpected operation ${method}`);
      if (failure === "denied") throw new Error("Approval denied");
      if (failure === "saveFailed") return { results: [{ identityId: "chat-1", targetId: "chat-1", kind: "failed", message: "Save refused" }] };
      syncEnabled = false;
      return { results: [{ identityId: "chat-1", targetId: "chat-1", kind: "saved", syncEnabled, syncRevision: "1", application: { kind: "failed", message: "Worker unavailable" } }] };
    });
    setHostRuntime({ transport: { baseUrl: "", rpc } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { TelegramDetailWrapper } = await import("../TelegramDetailWrapper");
    const view = render(<QueryClientProvider client={client}><TelegramDetailWrapper entityId="chat-1" /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Chat settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop synchronization" }));
    if (failure === "applyFailed") {
      expect((await screen.findByRole("status")).textContent).toContain("saved, but could not be applied: Worker unavailable");
    } else {
      expect((await screen.findByRole("alert")).textContent).toContain(failure === "denied" ? "Approval denied" : "Save refused");
      expect(screen.queryByRole("status")).toBeNull();
    }
    await waitFor(() => { expect(syncEnabled).toBe(failure !== "applyFailed"); });
    fireEvent.click(screen.getByRole("button", { name: "Chat settings" }));
    expect(await screen.findByRole("button", { name: failure === "applyFailed" ? "Start synchronization" : "Stop synchronization" })).not.toBeNull();
    expect(screen.getByText("hello")).not.toBeNull();
    view.unmount();
    client.clear();
  });

  it("persists synchronization independently from indexed through the owning module and reloads the choice", async () => {
    let syncEnabled = true;
    let indexed = false;
    const rpc = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "telegram.chats.get") return { entity_id: "chat-1", chat_id: "42", account_id: "account", chat_title: "Ops", indexed, syncEnabled };
      if (method === "telegram.chat.setSyncEnabled") {
        syncEnabled = params.syncEnabled === true;
        return { results: [{ identityId: "chat-1", targetId: "chat-1", kind: "saved", syncEnabled, syncRevision: "1", application: { kind: "pending" } }] };
      }
      if (method === "graph.entity.update") { indexed = params.indexed === true; return { ok: true }; }
      throw new Error(`Unexpected operation ${method}`);
    });
    setHostRuntime({ transport: { baseUrl: "", rpc } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { TelegramDetailWrapper } = await import("../TelegramDetailWrapper");
    const tree = <QueryClientProvider client={client}><TelegramDetailWrapper entityId="chat-1" /></QueryClientProvider>;
    const view = render(tree);
    await waitFor(() => { expect(rpc).toHaveBeenCalledWith("telegram.chats.get", { entity_id: "chat-1" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Chat settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop synchronization" }));
    await waitFor(() => { expect(rpc).toHaveBeenCalledWith("telegram.chat.setSyncEnabled", { id: "chat-1", syncEnabled: false }); });
    expect(indexed).toBe(false);
    expect((await screen.findByRole("status")).textContent).toContain("saved");
    expect(screen.getByText("hello")).not.toBeNull();
    view.unmount();
    client.clear();
    render(tree);
    fireEvent.click(await screen.findByRole("button", { name: "Chat settings" }));
    expect(await screen.findByRole("button", { name: "Start synchronization" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enable indexing" }));
    await waitFor(() => { expect(rpc).toHaveBeenCalledWith("graph.entity.update", { entity_id: "chat-1", indexed: true }); });
    expect(syncEnabled).toBe(false);
    client.clear();
  });

  it("tst_fe_tg_theme_001 keeps the dark chat pane layout as it was before design polish", async () => {
    /**
     * @test-id: tst_fe_tg_theme_001
     * @covers: modules/telegram/ui/TelegramChatView.tsx::TelegramChatView
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
