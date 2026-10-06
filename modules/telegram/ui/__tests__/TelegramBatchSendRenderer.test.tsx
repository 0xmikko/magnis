/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_003
 *
 * The telegram.batch_send approval is a paginated carousel — one
 * recipient at a time with N/M paging — NOT one long uneditable scroll and NOT the
 * single-chat fallback. Mirrors the email batch card so each message is reviewable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { TelegramBatchSendRenderer } from "../TelegramBatchSendRenderer";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";

function makePayload(messages: { chat_id: number | string; text: string }[]): AgentRendererProps<ToolCallRendererPayload> {
  return {
    payload: {
      toolCall: { id: "tc-1", name: "telegram.batch_send", args: { messages }, status: "pending" },
      isAllowlisted: false,
      onApprove: vi.fn(),
      onDeny: vi.fn(),
      onEdit: vi.fn(),
      onAllowlistToggle: vi.fn(),
    },
    runtime: {} as AgentRendererProps<ToolCallRendererPayload>["runtime"],
    agent: {} as AgentRendererProps<ToolCallRendererPayload>["agent"],
  };
}

describe("tst_fe_agent_003 — TelegramBatchSendRenderer paginates recipients", () => {
  it("shows one recipient at a time and pages through them", () => {
    const messages = [
      { chat_id: 42, text: "Hi 42" },
      { chat_id: 43, text: "Hi 43" },
      { chat_id: 44, text: "Hi 44" },
    ];
    const { getByTestId, getAllByTestId, getByText, queryByText } = render(
      <TelegramBatchSendRenderer {...makePayload(messages)} />,
    );

    // Exactly ONE recipient visible (a carousel, not a stacked list of all 3).
    expect(getAllByTestId("batch-recipient")).toHaveLength(1);
    expect(getByTestId("batch-recipient").textContent).toBe("42");
    expect(getByText("Hi 42")).toBeTruthy();
    expect(queryByText("Hi 43")).toBeNull();
    // Pager shows position 1 of 3.
    expect(getByTestId("telegram-batch-nav").textContent).toContain("1/3");

    // Next → recipient 2.
    const nav = getByTestId("telegram-batch-nav");
    const buttons = within(nav).getAllByRole("button");
    const rightChevron = buttons[buttons.length - 1];
    if (!rightChevron) throw new Error("no nav buttons");
    fireEvent.click(rightChevron);
    expect(getByTestId("batch-recipient").textContent).toBe("43");
    expect(getByText("Hi 43")).toBeTruthy();
    expect(getByTestId("telegram-batch-nav").textContent).toContain("2/3");
  });
});
