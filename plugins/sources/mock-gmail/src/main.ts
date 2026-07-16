// mock-gmail — reference dev/eval Magnis MCP source connector.
//
// TS port of the `magnis-mock-gmail` Rust binary (wire-identical): feeds the
// `email` + `meetings` surfaces from a shared JSONL file (MOCK_INJECT_FILE),
// poll-only, plus the optional HTTP injection side-channel (MOCK_EMAIL_PORT).

import { runConnector } from "@magnis/connector-sdk";
import { fetchMockGmail } from "./fetch";
import { maybeRunHttp } from "./http";

// HTTP injection runs in the background; the MCP stdio loop drives the process
// lifetime (exits on stdin EOF when the host drops the connection).
maybeRunHttp();

await runConnector({
  name: "magnis-mock-gmail",
  version: "0.1.0",
  surfaces: ["email", "meetings"],
  intervalSecs: 5,
  fetch: fetchMockGmail,
});

// stdin EOF = the host dropped the connection. Exit explicitly: a bound
// injection server keeps bun's event loop alive forever, whereas the Rust
// twin's runtime (and its background HTTP task) died with `main`.
process.exit(0);
