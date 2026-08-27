// mock-gmail — reference dev/eval Magnis MCP source connector.
//
// Dataset actions emit production-shaped live envelopes for the `email`
// surface. Polling remains intentionally empty; no raw injection side-channel
// bypasses the host's dataset action validation or receipts.

import { runConnector } from "@magnis/connector-sdk";
import { emitMeeting, emitMessage, rateLimitNextFetch } from "./dataset";
import { sendMessage } from "./execute";
import { fetchMockGmail } from "./fetch";

await runConnector({
  name: "magnis-mock-gmail",
  version: "0.1.0",
  surfaces: ["email", "meetings"],
  intervalSecs: 5,
  fetch: fetchMockGmail,
  execute: { send_message: sendMessage },
  datasetActions: {
    emit_meeting: emitMeeting,
    emit_message: emitMessage,
    rate_limit_next_fetch: rateLimitNextFetch,
  },
});

// stdin EOF = the host dropped the connection.
process.exit(0);
