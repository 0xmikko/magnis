# magnis-mock-telegram

A **controllable** external Magnis MCP source connector for the `telegram`
surface — the Telegram analogue of `mock-gmail`. It lets you drive the telegram
plugin end-to-end with no real Telegram account: inject chats and messages over
HTTP and they appear in the UI exactly as real synced data would.

## How it works

- Speaks the Magnis Sync Profile over **stdio JSON-RPC** (poll mode, 2 s
  interval). The host spawns it per the `manifest.toml` `[spawn] command`.
- Reads/writes a shared **JSONL** file (`MOCK_INJECT_FILE`), one line per item:
  `{ "surface": "telegram", "payload": …, "remote_id": …, "kind": … }`.
- A `magnis.sync.fetch` for the `telegram` surface returns every item past the
  request cursor as a canonical envelope. The per-item `kind` is preserved —
  **chats are `snapshot`** (no trigger), **messages are `live`** (trigger fires)
  — matching the real `telegram` connector exactly.

## HTTP control surface

Enabled when `MOCK_TELEGRAM_PORT` is set (one child wins the bind; the rest
serve MCP only — all share the same JSONL).

| Method | Path              | Body                                                                                  |
|--------|-------------------|---------------------------------------------------------------------------------------|
| POST   | `/inject-chat`    | `{ chat_id, title, type?, is_pinned?, unread_count?, member_count?, username?, top_message? }` |
| POST   | `/inject-message` | `{ chat_id, message_id?, text, is_outgoing?, sender_name?, sender_id?, chat_title?, date? }`   |
| GET    | `/health`         | —                                                                                     |
| GET    | `/status`         | — → `{ chats, messages, total }`                                                       |

`message_id` auto-assigns (monotonic) when omitted. `date` defaults to now.

### Example

```bash
export MOCK_INJECT_FILE=/tmp/mock-telegram.jsonl
export MOCK_TELEGRAM_PORT=4030

curl localhost:4030/inject-chat \
  -d '{"chat_id":777,"title":"Acme Team","type":"group","member_count":3}'

curl localhost:4030/inject-message \
  -d '{"chat_id":777,"text":"ship it 🚀","sender_name":"Alice","sender_id":99}'
```

The chat appears in the telegram plugin's chat list within one poll; the message
lands in the conversation and fires any matching trigger.

## Env

| Var                  | Required | Meaning                                  |
|----------------------|----------|------------------------------------------|
| `MOCK_INJECT_FILE`   | yes      | Shared JSONL path                        |
| `MOCK_TELEGRAM_PORT` | no       | HTTP control port (no server if unset)   |
