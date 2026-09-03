import { createHash } from "node:crypto";

import { ConnectorError } from "@magnis/connector-sdk";

function chatId(value: unknown): number | string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value !== 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && value.trim() !== "0") {
    return value.trim();
  }
  throw new ConnectorError("invalid send_message chat_id", { kind: "validation" });
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConnectorError("invalid send_message text", { kind: "validation" });
  }
  return value;
}

/** Deterministic local delivery receipt used only by the eval/dev connector. */
export function sendMessage(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return Promise.resolve().then(() => {
    const target = chatId(args.chat_id);
    const text = requiredText(args.text);
    const replyTo = args.reply_to_message_id;
    if (
      replyTo !== undefined
      && replyTo !== null
      && (typeof replyTo !== "number" || !Number.isSafeInteger(replyTo) || replyTo === 0)
    ) {
      throw new ConnectorError("invalid send_message reply_to_message_id", { kind: "validation" });
    }

    // @tested-by: tst_source_mock_telegram_execute_001
    // Stable fixture inputs produce one replay-safe synthetic Telegram message id.
    const digest = createHash("sha256")
      .update(`${String(target)}\0${text}\0${String(replyTo ?? "")}`)
      .digest("hex");
    const messageId = Number.parseInt(digest.slice(0, 12), 16) || 1;
    return { message_id: messageId, recorded: true };
  });
}
