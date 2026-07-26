import type { JSX } from "react";
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function TelegramToolCallRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, selectedChatName, onApprove, onDeny, onEdit, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const chatIdLabel =
    typeof args.chat_id === "string" || typeof args.chat_id === "number"
      ? `Chat ${String(args.chat_id)}`
      : "Telegram";
  const chatName =
    tc.chatName ??
    (args.chat_name as string | undefined) ??
    selectedChatName ??
    chatIdLabel;

  // `messages.reply` carries the same shape as `messages.send` plus the message
  // it answers, so it shares this card rather than forking a near-duplicate.
  // The wording still has to be honest: "Send" on a reply reads as a new
  // message to the chat, which is not what approving it does.
  const isReply = args.reply_to_message_id !== undefined;

  return (
    <BaseToolCallCard
      icon="send"
      title={isReply ? `Reply in ${chatName}` : `Telegram to ${chatName}`}
      variant="sky"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel={isReply ? "Reply" : "Send"}
      primaryIcon="send"
      doneLabel={isReply ? "Replied" : "Sent"}
      onApprove={onApprove}
      onDeny={onDeny}
      onEdit={onEdit}
      onAllowlistToggle={onAllowlistToggle}
    >
      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-agent-text">
        {typeof args.text === "string" ? args.text : ""}
      </p>
    </BaseToolCallCard>
  );
}
