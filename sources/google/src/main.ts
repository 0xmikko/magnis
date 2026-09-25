// External `google` connector — Gmail + Calendar + Contacts as a Magnis MCP
// source. It speaks the Magnis Sync Profile over stdio JSON-RPC and feeds three
// surfaces (email, meetings, contacts) with canonical envelopes the
// corresponding modules ingest unchanged. Poll-only; credentials arrive per
// call as `_meta = { refresh_token, client_id, client_secret }`.
//
// Fixture / replay mode: set GOOGLE_FIXTURE_FILE for isolated e2e with NO
// network and NO OAuth (see fixture.ts).
//
// Scope note: opinionated direct-use tools (list_emails, get_email, send_email,
// list_meetings, list_contacts) are deliberately not advertised — the HOST sync
// pipeline only calls magnis.sync.fetch / magnis.execute / magnis.auth.*, so
// tools/list advertises magnis.sync.fetch only.
// Scope note: auth-mode spawn gating (an auth-only mode exposing ONLY
// magnis.auth.*) is enforced by the host's per-mode spawn discipline, not
// inside the SDK.

import { runConnector } from "@magnis/connector-sdk";
import { buildConnectorConfig } from "./connector";

await runConnector(buildConnectorConfig());
