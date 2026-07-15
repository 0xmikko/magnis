//! Opinionated MCP tools advertised via `tools/list` for direct
//! Claude / agent use (vs the internal `magnis.sync.fetch` /
//! `magnis.execute` dispatchers the host backend uses for its own
//! sync pipeline). Mirrors `plugins/sources/google/src/tools.rs`.
//!
//! For each opinionated tool the connector:
//!   - Connects a `TgClient` from `_meta` (api_id/api_hash/session)
//!   - Calls the underlying live operation
//!   - Returns a Claude-friendly trimmed shape
//!
//! Internal dispatchers stay reachable via `tools/call` but are NOT
//! advertised here — the host's SyncScheduler / live-router know them
//! by name; Claude sees only the curated set.
//!
//! Future direction: these tools become the natural implementation of
//! a module-declared `ChatSource` interface once modules move to TS.
//! See `docs/plans/module-driven-mcp-sources.md`.

use serde_json::{json, Value};

use crate::client::{account_id_from_meta, creds_from_meta, TgClient};
use crate::{commands, fixture, sessions};

/// MCP `tools/list` result — what Claude sees.
pub fn tools_list() -> Value {
    json!({
        "tools": [
            {
                "name": "list_chats",
                "description":
                    "List Telegram chats (dialogs), pinned + recent. \
                     Returns trimmed metadata (chat_id, title, type, \
                     unread_count, member_count). Use `list_messages` \
                     to read messages from a chat.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 }
                    },
                    "additionalProperties": false
                }
            },
            {
                "name": "list_messages",
                "description":
                    "List messages in a Telegram chat, newest first. \
                     `before_message_id` pages backwards from that id. \
                     Returns trimmed shape (message_id, sender, text, \
                     date, reply_to).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "chat_id":            { "type": "integer", "description": "Telegram chat id" },
                        "limit":              { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 },
                        "before_message_id":  { "type": "integer", "description": "Page backwards from this id (0 = newest)" }
                    },
                    "required": ["chat_id"],
                    "additionalProperties": false
                }
            },
            {
                "name": "send_message",
                "description":
                    "Send a Telegram message to a chat. `reply_to_message_id` \
                     is optional and threads the new message under an existing one.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "chat_id":              { "type": "integer", "description": "Telegram chat id" },
                        "text":                 { "type": "string",  "description": "Message body" },
                        "reply_to_message_id":  { "type": "integer", "description": "Optional message id to reply to" }
                    },
                    "required": ["chat_id", "text"],
                    "additionalProperties": false
                }
            }
        ]
    })
}

/// Dispatch an opinionated tool call. Returns `Some(result)` if the
/// tool name matched; `None` if the caller should fall through to
/// internal-dispatcher arms (`magnis.sync.fetch`, `magnis.execute`,
/// `magnis.sync.listen`).
pub async fn dispatch(name: &str, args: &Value) -> Option<Result<Value, String>> {
    match name {
        "list_chats" => Some(list_chats(args).await),
        "list_messages" => Some(list_messages(args).await),
        "send_message" => Some(send_message(args).await),
        _ => None,
    }
}

// ── helpers ──────────────────────────────────────────────────

/// Get-or-create the shared `TgClient` for this call's `account_id`
/// via the global `SessionPool` (Stage 6). One MTProto session per
/// account, shared with `fetch` / `execute` / `listen_start`.
///
/// NO FALLBACKS: account_id is required (TelegramCredentialProvider
/// always injects it). Missing → error so caller surfaces a real
/// problem instead of silently collapsing all sessions to "".
async fn connect(args: &Value) -> Result<TgClient, String> {
    let creds = creds_from_meta(args)?;
    let account_id = account_id_from_meta(args)?;
    sessions::pool().get_or_create(&account_id, &creds).await
}

fn trim_chat(payload: &Value) -> Value {
    json!({
        "chat_id": payload.get("chat_id"),
        "title": payload.get("title"),
        "type": payload.get("type"),
        "unread_count": payload.get("unread_count"),
        "member_count": payload.get("member_count"),
        "is_pinned": payload.get("is_pinned"),
        "username": payload.get("username"),
    })
}

fn trim_message(payload: &Value) -> Value {
    json!({
        "message_id": payload.get("message_id"),
        "chat_id": payload.get("chat_id"),
        "sender": payload.get("sender"),
        "text": payload.get("text"),
        "date": payload.get("date"),
        "reply_to_message_id": payload.get("reply_to_message_id"),
        "has_media": payload.get("media_type").is_some(),
    })
}

// ── list_chats ───────────────────────────────────────────────

async fn list_chats(args: &Value) -> Result<Value, String> {
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .map(|n| n.clamp(1, 100) as usize)
        .unwrap_or(50);

    // Reuse fetch{direction:backward} which returns dialogs + recent
    // messages mixed; filter to chat payloads only.
    let fetch_result = if fixture::fixture_path().is_some() {
        fixture::fetch_result("backward", None)
    } else {
        let client = connect(args).await?;
        let account_id = account_id_from_meta(args)?;
        commands::fetch(&client, &account_id, "backward", None)
            .await
            .map_err(|e| e.to_string())?
    };

    let envelopes = fetch_result
        .get("envelopes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let chats: Vec<Value> = envelopes
        .iter()
        .filter_map(|e| {
            let payload = e.get("payload")?;
            if payload.get("entity_type").and_then(Value::as_str)? == "telegram_chat" {
                Some(trim_chat(payload))
            } else {
                None
            }
        })
        .take(limit)
        .collect();
    Ok(json!({ "chats": chats }))
}

// ── list_messages ────────────────────────────────────────────

async fn list_messages(args: &Value) -> Result<Value, String> {
    let chat_id = args
        .get("chat_id")
        .and_then(Value::as_i64)
        .ok_or_else(|| "missing required arg 'chat_id' (integer)".to_string())?;
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .map(|n| n.clamp(1, 100) as usize)
        .unwrap_or(50);
    let before_message_id = args.get("before_message_id").and_then(Value::as_i64);

    // Build an execute payload for backfill_chat — the same path the
    // host uses for backfill.
    let mut exec_args = json!({
        "action": "backfill_chat",
        "chat_id": chat_id,
        "limit": limit,
    });
    if let Some(b) = before_message_id {
        exec_args["before_message_id"] = json!(b);
    }
    // Carry the caller's _meta through to the underlying execute path.
    if let Some(meta) = args.get("_meta") {
        exec_args["_meta"] = meta.clone();
    }

    let result = if fixture::fixture_path().is_some() {
        fixture::execute_result(&exec_args)
    } else {
        let client = connect(args).await?;
        let account_id = account_id_from_meta(args)?;
        commands::execute(&client, &account_id, &exec_args)
            .await
            .map_err(|e| e.to_string())?
    };

    let envelopes = result
        .get("envelopes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let messages: Vec<Value> = envelopes
        .iter()
        .filter_map(|e| e.get("payload").map(trim_message))
        .collect();
    Ok(json!({ "messages": messages }))
}

// ── send_message ─────────────────────────────────────────────

async fn send_message(args: &Value) -> Result<Value, String> {
    let chat_id = args
        .get("chat_id")
        .and_then(Value::as_i64)
        .ok_or_else(|| "missing required arg 'chat_id' (integer)".to_string())?;
    let text = args
        .get("text")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing required arg 'text' (string)".to_string())?
        .to_string();
    let reply_to = args.get("reply_to_message_id").and_then(Value::as_i64);

    let mut exec_args = json!({
        "action": "send_message",
        "chat_id": chat_id,
        "text": text,
    });
    if let Some(r) = reply_to {
        exec_args["reply_to_message_id"] = json!(r);
    }
    if let Some(meta) = args.get("_meta") {
        exec_args["_meta"] = meta.clone();
    }

    if fixture::fixture_path().is_some() {
        Ok(fixture::execute_result(&exec_args))
    } else {
        let client = connect(args).await?;
        let account_id = account_id_from_meta(args)?;
        commands::execute(&client, &account_id, &exec_args)
            .await
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tools_list_advertises_all_opinionated_tools() {
        let result = tools_list();
        let tools = result["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"list_chats"));
        assert!(names.contains(&"list_messages"));
        assert!(names.contains(&"send_message"));
        // Internal dispatchers MUST NOT leak.
        assert!(!names.contains(&"magnis.sync.fetch"));
        assert!(!names.contains(&"magnis.execute"));
        assert!(!names.contains(&"magnis.sync.listen"));
    }

    #[test]
    fn trim_chat_keeps_canonical_fields() {
        let payload = json!({
            "entity_type": "telegram_chat",
            "chat_id": 42,
            "title": "Magnis team",
            "type": "channel",
            "unread_count": 7,
            "member_count": 12,
            "is_pinned": true,
            "username": "magnis_team",
            "noise_field": "drop me"
        });
        let trimmed = trim_chat(&payload);
        assert_eq!(trimmed["chat_id"], 42);
        assert_eq!(trimmed["title"], "Magnis team");
        assert_eq!(trimmed["type"], "channel");
        assert_eq!(trimmed["unread_count"], 7);
        assert_eq!(trimmed["member_count"], 12);
        assert_eq!(trimmed["is_pinned"], true);
        assert_eq!(trimmed["username"], "magnis_team");
        assert!(trimmed.get("noise_field").is_none());
    }

    #[test]
    fn trim_message_flags_media() {
        let with_media = json!({
            "message_id": 1, "chat_id": 42, "sender": "alice", "text": "hi",
            "date": "2026-05-20T10:00:00Z", "media_type": "photo",
            "reply_to_message_id": null,
        });
        let trimmed = trim_message(&with_media);
        assert_eq!(trimmed["has_media"], true);
        assert_eq!(trimmed["text"], "hi");

        let no_media = json!({
            "message_id": 2, "chat_id": 42, "sender": "bob", "text": "no media",
            "date": "2026-05-20T10:01:00Z",
        });
        let trimmed = trim_message(&no_media);
        assert_eq!(trimmed["has_media"], false);
    }

    #[tokio::test]
    async fn list_messages_rejects_missing_chat_id() {
        let err = list_messages(&json!({})).await.unwrap_err();
        assert!(err.contains("chat_id"));
    }

    #[tokio::test]
    async fn send_message_rejects_missing_args() {
        let no_chat = send_message(&json!({ "text": "hi" })).await.unwrap_err();
        assert!(no_chat.contains("chat_id"));
        let no_text = send_message(&json!({ "chat_id": 1 })).await.unwrap_err();
        assert!(no_text.contains("text"));
    }
}
