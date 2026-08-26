import { createHash } from "node:crypto";

import { ConnectorError } from "@magnis/connector-sdk";

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConnectorError(`invalid send_message ${label}`, { kind: "validation" });
  }
  return value;
}

function requiredChatId(value: unknown): string | number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    String(value).trim() === ""
  ) {
    throw new ConnectorError("invalid send_message chat_id", { kind: "validation" });
  }
  return value;
}

function messageId(chatId: string | number, text: string): number {
  const bytes = createHash("sha256").update(`${String(chatId)}\0${text}`).digest();
  return -(bytes.readUInt32BE(0) % 2_147_483_646) - 1;
}

/** Deterministic local delivery receipt used only by the eval/dev connector. */
export function sendMessage(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return Promise.resolve().then(() => {
    const chatId = requiredChatId(args.chat_id);
    const text = requiredText(args.text, "text");
    return {
      action: "send_message",
      chat_id: chatId,
      message_id: messageId(chatId, text),
      recorded: true,
      text,
    };
  });
}
