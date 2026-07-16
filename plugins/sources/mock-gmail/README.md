# mock-gmail (external MCP connector)

The reference Magnis external source — the first connector migrated out of the
backend (Stage 7 of the external-MCP-sources work). It demonstrates the whole
loop: a standalone MCP server, installed via a manifest, syncing into the graph
through the in-core `emails` / `meetings` modules.

## What it is

- **Server:** `src/main.ts` on `@magnis/connector-sdk`, run by `bun` (the only
  connector runtime — sources-typescript-port INV-TS-4). Speaks the Magnis Sync
  Profile over stdio JSON-RPC and advertises two surfaces, `email` + `meetings`,
  poll mode.
- **Manifest:** [`manifest.toml`](manifest.toml) — `source_id = "mock-gmail"`,
  `surfaces = ["email","meetings"]`, account `eval`.

## How data flows

1. An item is **injected** — either by `curl`-ing the HTTP server, or by
   appending a line to the shared JSONL file directly.
2. The host polls `magnis.sync.fetch { surface, cursor }`; the connector returns
   that surface's items past the cursor as canonical envelopes (identical shapes
   to the old in-core mock).
3. The `emails` / `meetings` modules ingest them into the graph.

The host spawns one child per surface; both run the same connector and share
state through the JSONL file, so injection (one process) and fetch (the other)
agree.

## Configuration (env on the spawned process)

| Env | Meaning |
|-----|---------|
| `MOCK_INJECT_FILE` | **required** — shared JSONL path both surface processes read/append |
| `MOCK_EMAIL_PORT`  | optional — HTTP injection server port (e.g. `4020`); only one child binds it |

## Injecting (demo / eval)

```bash
curl -X POST localhost:4020/inject \
  -H 'content-type: application/json' \
  -d '{"from_address":"a@x","subject":"Hi","body_text":"hello"}'

curl -X POST localhost:4020/inject-event \
  -H 'content-type: application/json' \
  -d '{"title":"Standup","starts_at":"2026-05-20T10:00:00Z","ends_at":"2026-05-20T10:15:00Z","attendees":[{"email":"a@x"}]}'
```

Or append a line to `$MOCK_INJECT_FILE` directly:
`{"surface":"email","payload":{…},"remote_id":"…"}`.
