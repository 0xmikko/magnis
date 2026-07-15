# google (external MCP connector)

Gmail + Google Calendar as a standalone Magnis external source. Ported faithfully
out of the in-backend `backend/src/sources/google` source: it speaks the Magnis
Sync Profile over stdio JSON-RPC and feeds two surfaces, `email` + `meetings`,
with **byte-identical canonical envelopes** to the in-core source — so the
`emails` / `meetings` modules ingest it unchanged. Poll-only (matching the
original).

## What it is

- **Server:** the `magnis-google` binary. Advertises two surfaces
  (`surfaces = ["email","meetings"]`), poll mode, `interval_secs = 30`.
- **Manifest:** [`manifest.toml`](manifest.toml) — `id = "google"`,
  `transport = "stdio"`, credential keys `refresh_token` / `client_id` /
  `client_secret` injected as `_meta`.

## Credential model

The connector does OAuth itself. The host injects credentials per call as
`_meta = { refresh_token, client_id, client_secret }`. On each `magnis.sync.fetch`
/ `magnis.execute` the connector calls Google's token endpoint to mint a
short-lived access token, then calls the Gmail / Calendar REST API. Account
discovery is host-side; the manifest declares no static accounts.

## Surfaces

| Surface | Source | Payload shape | `remote_id` |
|---------|--------|---------------|-------------|
| `email` | Gmail `users.messages` + `users.history` | flattened `MailMessage` (`from_name`, `from_address`, `to_addresses`, `cc_addresses`, `bcc_addresses`, `subject`, `body_text`, `body_html`, `snippet`, `labels`, `is_read`, `is_starred`, `has_attachments`, `attachments`, …) | Gmail message id |
| `meetings` | Calendar `events.list` (primary) | full `CalendarEvent` (`id`, `title`, `description`, `location`, `starts_at`, `ends_at`, `all_day`, `status`, `attendees`, `conference_link`) | `gcal:{event_id}` |

`magnis.sync.fetch` accepts `{ direction, cursor?, surface, _meta }`:
`direction = "backward"` is a Bootstrap page (Gmail head-first `historyId`
watermark via `users.getProfile`); `direction = "forward"` is a CatchUp via the
Gmail History API. Calendar pages a time window (30 days back → 90 days ahead by
default, overridable via `time_min` / `time_max`).

`magnis.execute` forwards outbound actions: `send_message` (builds RFC 2822 MIME
and POSTs to `messages.send`) and `download_file` (fetches an attachment and
writes it to `dest`).

## Fixture / replay mode (isolated e2e — no live Google)

Set `GOOGLE_FIXTURE_FILE` to a JSON file and the connector serves
`magnis.sync.fetch` from it with **no network and no OAuth**, running the same
conversion path as live mode (so fixture envelopes are byte-identical to real
ones). `magnis.execute` records/echoes the action.

```jsonc
{
  "messages": [            // raw Gmail users.messages.get (format=full) shapes
    {
      "id": "m1",
      "labelIds": ["UNREAD", "INBOX"],
      "internalDate": "1700000000000",
      "payload": {
        "mimeType": "text/plain",
        "headers": [
          { "name": "Subject", "value": "Hi" },
          { "name": "From", "value": "Alice <alice@x.com>" },
          { "name": "To", "value": "Bob <bob@y.com>" }
        ],
        "body": { "data": "<base64url>" }
      }
    }
  ],
  "events": [              // raw Google Calendar events.list items
    {
      "id": "e1",
      "summary": "Standup",
      "status": "confirmed",
      "start": { "dateTime": "2026-05-20T10:00:00Z" },
      "end":   { "dateTime": "2026-05-20T10:15:00Z" },
      "attendees": [ { "email": "alice@x.com", "displayName": "Alice" } ]
    }
  ]
}
```

## Tests

`cargo test -p magnis-source-google` runs unit tests (conversion / flatten /
history-action / MIME) plus an isolated e2e (`tests/mcp_server.rs`) that spawns
this crate's binary in fixture mode and drives it over stdio with
`magnis-mcp-testkit`, asserting the `initialize` capabilities, the flattened
email payload, the meeting payload, and `magnis.execute send_message`.
