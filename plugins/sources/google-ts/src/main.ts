// External `google-ts` connector — Gmail + Calendar + Contacts as a Magnis MCP
// source. TypeScript twin of the Rust plugins/sources/google connector: it
// speaks the Magnis Sync Profile over stdio JSON-RPC and feeds three surfaces
// (email, meetings, contacts) with canonical envelopes the corresponding
// modules ingest unchanged. Poll-only; credentials arrive per call as
// `_meta = { refresh_token, client_id, client_secret }`.
//
// Fixture / replay mode: set GOOGLE_FIXTURE_FILE for isolated e2e with NO
// network and NO OAuth (see fixture.ts).
//
// TODO(google-ts follow-up): the Rust connector also advertises 5 opinionated
// tools via tools/list for direct Claude/agent use (list_emails, get_email,
// send_email, list_meetings, list_contacts). The HOST sync pipeline only calls
// magnis.sync.fetch / magnis.execute / magnis.auth.*, so those tools are
// SKIPPED here — the SDK's tools/list advertises magnis.sync.fetch only.
// TODO(google-ts follow-up): the Rust binary gates auth-mode spawns
// (--auth-mode exposes ONLY magnis.auth.*); the SDK has no such gate, so the
// host's per-mode spawn discipline is the only guard.

import { runConnector } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "./connector";

await runConnector(buildConnectorConfig());
