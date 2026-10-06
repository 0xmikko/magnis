import { ConnectorError, type DatasetActionHandler } from "@magnis/connector-sdk";
import { buildChat, buildMessage } from "./envelope";

export const emitChat: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const built = buildChat(args.payload);
  if (!built) {
    throw new ConnectorError("invalid emit_chat payload", { kind: "contract" });
  }
  return {
    envelopes: [
      {
        surface: "telegram",
        remote_id: `dataset:${args.invocation_id}:0`,
        kind: "live",
        payload: built.payload,
      },
    ],
  };
});

export const emitMessage: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const built = buildMessage(args.payload);
  if (!built || typeof args.payload.date !== "string" || Number.isNaN(Date.parse(args.payload.date))) {
    throw new ConnectorError("invalid emit_message payload", { kind: "contract" });
  }
  return {
    envelopes: [
      {
        surface: "telegram",
        remote_id: `dataset:${args.invocation_id}:0`,
        kind: "live",
        payload: built.payload,
      },
    ],
  };
});
