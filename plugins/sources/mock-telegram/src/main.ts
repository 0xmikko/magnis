// mock-telegram — a *controllable* dev/eval Magnis MCP source connector.
//
// TS port of the `magnis-mock-telegram` Rust binary (wire-identical): drive the
// `telegram` surface like a real server — inject chats and messages over HTTP
// (MOCK_TELEGRAM_PORT) and they flow through magnis.sync.fetch as canonical
// telegram envelopes the `telegram` module ingests unchanged. Poll-only.

import { runConnector } from "@magnis/connector-sdk";
import { fetchMockTelegram } from "./fetch";
import { maybeRunHttp } from "./http";
import { SURFACE } from "./store";

// HTTP control runs in the background; the MCP stdio loop drives the process
// lifetime (exits on stdin EOF when the host drops the connection).
maybeRunHttp();

await runConnector({
  name: "magnis-mock-telegram",
  version: "0.1.0",
  surfaces: [SURFACE],
  intervalSecs: 2,
  fetch: fetchMockTelegram,
});

// stdin EOF = the host dropped the connection. Exit explicitly: a bound
// Bun.serve keeps the event loop alive forever, whereas the Rust twin's runtime
// (and its background HTTP task) died with `main`.
process.exit(0);
