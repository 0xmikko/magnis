import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function TelegramToolCallRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, selectedChatName, onApprove, onDeny, onEdit, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const chatName =
    tc.chatName ??
    (args.chat_name as string | undefined) ??
    selectedChatName ??
    (args.chat_id != null ? `Chat ${String(args.chat_id)}` : "Telegram");

  return (
    <BaseToolCallCard
      icon="send"
      title={`Telegram to ${chatName}`}
      variant="sky"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Send"
      primaryIcon="send"
      doneLabel="Sent"
      onApprove={onApprove}
      onDeny={onDeny}
      onEdit={onEdit}
      onAllowlistToggle={onAllowlistToggle}
    >
      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-agent-text">
        {args.text != null ? String(args.text) : ""}
      </p>
    </BaseToolCallCard>
  );
}
