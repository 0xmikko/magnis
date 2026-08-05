import { createHash } from "node:crypto";

import { ConnectorError } from "@magnis/connector-sdk";

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConnectorError(`invalid send_message ${label}`, { kind: "validation" });
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConnectorError(`invalid send_message ${label}`, { kind: "validation" });
  }
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Deterministic local delivery receipt used only by the eval/dev connector. */
export async function sendMessage(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const draft = record(args.draft, "draft");
  const recipients = draft.to;
  if (!Array.isArray(recipients) || recipients.length !== 1) {
    throw new ConnectorError("invalid send_message recipient", { kind: "validation" });
  }
  const recipient = requiredString(record(recipients[0], "recipient").address, "recipient");
  const subject = requiredString(draft.subject, "subject");
  const body = requiredString(draft.body_text, "body_text");
  const inReplyTo = typeof draft.in_reply_to === "string" ? draft.in_reply_to : "";
  const messageKey = digest(`${recipient.toLowerCase()}\0${subject}\0${body}\0${inReplyTo}`);
  const threadKey = digest(inReplyTo === "" ? subject.toLowerCase() : inReplyTo);
  return {
    message_id: `mock-gmail-${messageKey}`,
    thread_id: `mock-gmail-thread-${threadKey}`,
  };
}
