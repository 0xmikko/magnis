/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_004
 *
 * INV-7 [DEC-7]: the telegram.set_trigger approval renders a proper card —
 * the watched chat + the condition (When) + the action (Then) — instead of the
 * generic fallback ("Agent wants to: telegram.set trigger / Chat ID: <raw>").
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TelegramSetTriggerRenderer } from "../TelegramSetTriggerRenderer";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";

function makePayload(args: Record<string, unknown>): AgentRendererProps<ToolCallRendererPayload> {
  return {
    payload: {
      toolCall: { id: "tc-1", name: "telegram.set_trigger", args, status: "pending" },
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

describe("tst_fe_agent_004 — TelegramSetTriggerRenderer shows the automation", () => {
  it("renders the watched chat, the condition (When) and the action (Then)", () => {
    const { getByText, getByTestId } = render(
      <TelegramSetTriggerRenderer
        {...makePayload({
          chat_id: 746662963,
          gate_prompt: "a meeting is proposed",
          action_prompt: "suggest three time slots",
        })}
      />,
    );

    // The chat is named in the title (not a bare "Chat ID" fallback line).
    expect(getByText(/Watch Telegram chat 746662963/)).toBeTruthy();
    // The condition and action are shown — the meaning of the trigger.
    expect(getByTestId("trigger-gate").textContent).toBe("a meeting is proposed");
    expect(getByTestId("trigger-action").textContent).toBe("suggest three time slots");
  });
});
