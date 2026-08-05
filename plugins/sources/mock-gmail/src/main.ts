// mock-gmail — reference dev/eval Magnis MCP source connector.
//
// Dataset actions emit production-shaped live envelopes for the `email`
// surface. Polling remains intentionally empty; no raw injection side-channel
// bypasses the host's dataset action validation or receipts.

import { runConnector } from "@magnis/connector-sdk";
import { emitMessage } from "./dataset";
import { fetchMockGmail } from "./fetch";

await runConnector({
  name: "magnis-mock-gmail",
  version: "0.1.0",
  surfaces: ["email", "meetings"],
  intervalSecs: 5,
  fetch: fetchMockGmail,
  datasetActions: { emit_message: emitMessage },
});

// stdin EOF = the host dropped the connection.
process.exit(0);
