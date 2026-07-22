# @magnis/connector-sdk

The wire contract a Magnis **source connector** implements, plus the runtime that serves it. A connector is a separate bun process the core spawns; it speaks the **Magnis Sync Profile** — line-delimited JSON-RPC over stdio — and owns its own provider credentials.

What the SDK gives you:

- `runConnector(config)` — the stdio loop: `initialize`, `magnis.sync.fetch` (envelopes + opaque JSON cursors), `magnis.execute` (the connector's action table), the `magnis.auth.*` ceremony (oauth2 / phone_code / api_key), and push (`listen_start`/`listen_stop` + stamped envelope notifications).
- The pure contract types (`Envelope`, `FetchArgs`, `FetchResult`, `ConnectorConfig`) in `./contract/source`, re-exported here.
- Typed failure signalling: `RateLimitError` (surfaces `-32002` with `retry_after`), `CursorExpiredError` (`-32003` — resets sync to bootstrap). A connector never hangs silently on a dropped or throttled response.

Authoring guide: [docs/plugins/source.md](../../docs/plugins/source.md). Rule of the house: the wire is frozen — add capabilities and error paths, never change envelope shapes or cursor semantics.
