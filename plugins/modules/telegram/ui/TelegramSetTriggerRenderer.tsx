/**
 * TelegramSetTriggerRenderer — approval card for telegram.set_trigger.
 *
 * Replaces the generic fallback ("Agent wants to: telegram.set trigger / Chat ID:
 * <raw>") with a card that shows what the automation actually does: which chat is
 * watched, the condition (When), and the action (Then) — DEC-7 / INV-7. Colocated
 * with the plugin (mirrors TelegramBatchSendRenderer); registered from
 * plugins/telegram/ui/index.tsx via the `set_trigger` action.
 */

import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function TelegramSetTriggerRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const chatId = args.chat_id != null ? String(args.chat_id) : "?";
  const gate = typeof args.gate_prompt === "string" ? args.gate_prompt : "";
  const action = typeof args.action_prompt === "string" ? args.action_prompt : "";
  const debounce = typeof args.debounce_seconds === "number" ? args.debounce_seconds : 0;

  return (
    <BaseToolCallCard
      icon="bell"
      title={`Watch Telegram chat ${chatId}`}
      variant="amber"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Set trigger"
      primaryIcon="bell"
      doneLabel="Trigger set"
      onApprove={onApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      <div className="flex flex-col gap-2 text-[13px] leading-[1.5]">
        <div>
          <span className="text-amber-400/80">When:</span>{" "}
          <span className="text-agent-text" data-testid="trigger-gate">
            {gate}
          </span>
        </div>
        <div>
          <span className="text-amber-400/80">Then:</span>{" "}
          <span className="text-agent-text" data-testid="trigger-action">
            {action}
          </span>
        </div>
        {debounce > 0 ? (
          <div className="text-[11px] text-agent-text opacity-60">Batched within {String(debounce)}s</div>
        ) : null}
      </div>
    </BaseToolCallCard>
  );
}
