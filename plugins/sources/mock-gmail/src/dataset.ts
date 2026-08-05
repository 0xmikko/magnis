import { ConnectorError, type DatasetActionHandler, type Envelope } from "@magnis/connector-sdk";

type Json = Record<string, unknown>;

function requiredString(payload: Json, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConnectorError(`invalid emit_message payload: ${key}`, {
      kind: "contract",
      field: key,
    });
  }
  return value;
}

export const emitMessage: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const payload = args.payload;
  const messageId = requiredString(payload, "message_id");
  const sentAt = requiredString(payload, "sent_at");
  if (Number.isNaN(Date.parse(sentAt))) {
    throw new ConnectorError("invalid emit_message payload: sent_at", {
      kind: "contract",
      field: "sent_at",
    });
  }
  requiredString(payload, "from_address");
  if (typeof payload.subject !== "string" || typeof payload.body_text !== "string") {
    throw new ConnectorError("invalid emit_message payload: subject/body_text", {
      kind: "contract",
    });
  }
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const envelope: Envelope = {
    surface: "email",
    remote_id: `dataset:${args.invocation_id}:0`,
    kind: "live",
    payload: {
      message_id: messageId,
      ...(typeof payload.thread_id === "string" ? { thread_id: payload.thread_id } : {}),
      from_address: payload.from_address,
      from_name: typeof payload.from_name === "string" ? payload.from_name : "",
      subject: payload.subject,
      body_text: payload.body_text,
      sent_at: sentAt,
      has_attachments: attachments.length > 0,
      attachments,
    },
  };
  return { envelopes: [envelope] };
});
