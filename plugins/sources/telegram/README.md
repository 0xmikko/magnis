# telegram (external MCP connector)

Telegram as a standalone Magnis external source. Ported faithfully out of the
in-backend `backend/src/sources/telegram` source: it speaks the Magnis Sync
Profile over stdio JSON-RPC and feeds ONE surface, `telegram`, with
**byte-identical canonical envelopes** to the in-core source — so the `telegram`
module ingests it unchanged. PUSH source (matching the original).

## What it is

- **Server:** the `magnis-telegram` binary. Advertises one surface
  (`surfaces = ["telegram"]`), push mode.
- **Manifest:** [`manifest.toml`](manifest.toml) — `id = "telegram"`,
  `transport = "stdio"`, `kind = "plugin"`, credential keys `api_id` / `api_hash`
  / `session` injected as `_meta`.

## Credential model

The connector builds its own grammers MTProto client. The host injects
credentials per call as `_meta = { api_id, api_hash, session }`:

- `api_id` — the Magnis Telegram application's numeric API id.
- `api_hash` — the application's API hash.
- `session` — the user's serialized grammers session (base64 of the session
  blob), the live-auth output. Auth (phone → code → 2FA) is performed elsewhere;
  this connector consumes an already-authorized session.

## Surface

| Surface | Source | Payload shape | `remote_id` |
|---------|--------|---------------|-------------|
| `telegram` | grammers MTProto dialogs + messages + live updates | message payload (`message_id`, `chat_id`, `text`, `date`, `is_outgoing`, optional `chat_title`, `sender_name`, `sender_id`, `reply_to_msg_id`, `media_type`, `source_ref`, `file_name`, `is_pinned`, `sender_info`) and chat payload (`entity_type=telegram_chat`, `chat_id`, `title`, `type`, dialog metadata, …) | `tg:msg:{chat_id}:{message_id}` / `tg:chat:{chat_id}` |

`magnis.sync.fetch` accepts `{ direction, cursor?, surface:"telegram", _meta }`:
`direction = "backward"` is a Bootstrap page (newest dialogs + recent messages);
`direction = "forward"` is a CatchUp (messages newer than the per-chat cursor).
Each message envelope carries `cursor = { chat_id, message_id }`; the result's
`nextCursor` is the per-chat `{ date, chats: { "<chat_id>": { last_msg_id } } }`
watermark, exactly as the in-backend runtime emits.

`magnis.sync.listen` opens a live session: it acks `{ ok: true }` and then emits
`notifications/magnis/envelope` for each incoming update.

`magnis.execute` forwards outbound actions, ported from the in-backend command
handlers: `send_message` (`{ chat_id, text, reply_to_message_id? }`), `reply`
(alias for `send_message` with a reply target), `backfill_chat`
(`{ chat_id, before_message_id?, limit? }`), and `download_file`
(`{ source_ref, dest }`). The result JSON is returned verbatim.

## Fixture / replay mode (isolated e2e — no live Telegram)

Set `TELEGRAM_FIXTURE_FILE` to a JSON file and the connector serves
`magnis.sync.fetch` from it with **no MTProto network**, running the same payload
builders as live mode (so fixture envelopes are byte-identical to real ones).
`magnis.execute` records/echoes the action; `magnis.sync.listen` acks and replays
any `live` messages from the fixture as push notifications.

```jsonc
{
  // Dialog/chat entries — converted via the SAME chat-payload builder as live.
  "chats": [
    {
      "chat_id": 111,
      "title": "Project X",
      "type": "group",            // private | group | supergroup
      "is_pinned": true,
      "pin_order": 0,
      "unread_count": 2,
      "unread_mark": false,
      "read_inbox_max_id": 40,
      "read_outbox_max_id": 39,
      "unread_mentions_count": 0,
      "top_message": 42,
      "member_count": 5,          // optional
      "username": "projectx"      // optional
    }
  ],
  // Message entries — converted via the SAME message-payload builder as live.
  "messages": [
    {
      "message_id": 42,
      "chat_id": 111,
      "text": "Hello world",
      "date": "2026-05-20T10:00:00+00:00",   // RFC3339
      "is_outgoing": false,
      "chat_title": "Project X",             // optional
      "sender_name": "Alice",                // optional
      "sender_id": 222,                      // optional
      "reply_to_msg_id": 41,                 // optional
      "media_type": "photo",                 // optional
      "file_name": "vacation.jpg",           // optional
      "is_pinned": false,                    // optional
      "live": false,                         // when true, replayed by listen
      "sender_info": {                       // optional
        "first_name": "Alice",
        "last_name": "Smith",
        "username": "alice",
        "phone": "+100000000"
      }
    }
  ]
}
```

## Tests

`cargo test -p magnis-source-telegram` runs an isolated e2e
(`tests/mcp_server.rs`) that spawns this crate's binary in fixture mode and drives
it over stdio with `magnis-mcp-testkit`, asserting the `initialize` capabilities
(telegram / push), the canonical message + chat payloads with `tg:msg:` /
`tg:chat:` `remote_id`s, `magnis.sync.listen` push delivery, and that
`magnis.execute send_message` returns a result.
