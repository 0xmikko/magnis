// External `telegram` connector — Telegram as a Magnis MCP source.
// TypeScript (gramjs) twin of the Rust plugins/sources/telegram connector: it
// speaks the Magnis Sync Profile over stdio JSON-RPC and feeds ONE PUSH surface
// (`telegram`) with canonical envelopes byte-identical to the Rust twin's, so the
// `telegram` module ingests it unchanged.
//
// ## Credential model
// The connector builds its own gramjs MTProto client. The host injects
// credentials per call as `_meta = { api_id, api_hash, session }` (+ the required
// `account_id`).
//
// !! SESSION FORMAT BREAK vs the Rust connector: `session` here is a gramjs
// `StringSession` string; Rust mints `base64(grammers Session::save())`. The two
// formats are NOT interchangeable — cutting over between the connectors requires
// the user to RE-AUTHENTICATE. See client.ts / auth.ts.
//
// ## Fixture / replay mode (isolated e2e, no live Telegram)
// If `TELEGRAM_FIXTURE_FILE` is set, `magnis.sync.fetch` is served from that JSON
// file (NO MTProto network), the listener replays the file's `live` messages as
// push notifications, and `magnis.execute` records/echoes the action. The fixture
// check runs BEFORE any credential parsing. See fixture.ts.
//
// ## Deliberately not advertised (host never calls them)
// Opinionated direct-use tools — `list_chats`, `list_messages`, `send_message` —
// are not exposed: the host sync pipeline only calls magnis.sync.fetch /
// magnis.execute / magnis.auth.* / listen_start / listen_stop, so tools/list
// answers an empty list. The `magnis.test.sleep` concurrency seam is likewise
// not part of this connector.

import { runMcpStdio } from "./dispatch";
import { SubscriptionRegistry } from "./subscriptions";

await runMcpStdio(process.stdin, {
  authMode: process.argv.includes("--auth-mode"),
  registry: new SubscriptionRegistry(),
  write: (line): void => { process.stdout.write(line + "\n"); },
});
