// mock-telegram — dataset/eval Magnis MCP source connector.
//
// Dataset actions emit production-shaped live envelopes for the `telegram`
// surface. Polling remains intentionally empty; no raw injection side-channel
// bypasses the host's dataset action validation or receipts.

import { runConnector } from "@magnis/connector-sdk";
import { emitChat, emitMessage } from "./dataset";
import { sendMessage } from "./execute";
import { fetchMockTelegram } from "./fetch";

await runConnector({
  name: "magnis-mock-telegram",
  version: "0.1.0",
  surfaces: ["telegram"],
  intervalSecs: 2,
  fetch: fetchMockTelegram,
  execute: { send_message: sendMessage },
  datasetActions: { emit_chat: emitChat, emit_message: emitMessage },
});

// stdin EOF = the host dropped the connection.
process.exit(0);
