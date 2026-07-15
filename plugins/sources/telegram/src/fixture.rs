//! Fixture / replay mode — env-gated isolated e2e with NO MTProto network.
//!
//! When `TELEGRAM_FIXTURE_FILE` is set, the connector reads canned chats +
//! messages from that JSON file instead of connecting to Telegram. Crucially it
//! runs the SAME payload builders as live mode (`envelope::chat_payload` /
//! `envelope::message_payload`), so fixture-mode envelopes are byte-identical to
//! real-mode ones — which is exactly what the host-side ingest test verifies.
//!
//! ## Fixture file format (single JSON object)
//!
//! ```jsonc
//! {
//!   "chats":    [ { "chat_id": 111, "title": "Project X", "type": "group", … } ],
//!   "messages": [ { "message_id": 42, "chat_id": 111, "text": "Hi", "date": "…", … } ]
//! }
//! ```
//!
//! `magnis.sync.fetch` returns, in chat order, each chat's snapshot envelope
//! followed by that chat's message snapshot envelopes (mirroring the in-backend
//! bootstrap interleaving). The cursor is the per-chat `last_msg_id` watermark.
//! Messages flagged `"live": true` are NOT served by fetch — they are replayed
//! by `magnis.sync.listen` as push notifications.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::envelope::{
    chat_envelope, message_envelope, message_payload, message_remote_id, TgChat, TgMessage,
};

/// Path of the active fixture file, or `None` for live mode.
pub fn fixture_path() -> Option<String> {
    std::env::var("TELEGRAM_FIXTURE_FILE").ok()
}

/// Parsed fixture contents. Missing arrays are empty.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Fixture {
    #[serde(default)]
    pub chats: Vec<TgChat>,
    #[serde(default)]
    pub messages: Vec<TgMessage>,
}

/// Load + parse the fixture file. A missing/malformed file yields an empty
/// fixture (logged to stderr), matching the google connector's tolerance.
pub fn load() -> Fixture {
    let Some(path) = fixture_path() else {
        return Fixture::default();
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("magnis-telegram: cannot read TELEGRAM_FIXTURE_FILE {path}: {e}");
            return Fixture::default();
        }
    };
    match serde_json::from_str::<Fixture>(&raw) {
        Ok(fx) => fx,
        Err(e) => {
            eprintln!("magnis-telegram: malformed TELEGRAM_FIXTURE_FILE {path}: {e}");
            Fixture::default()
        }
    }
}

/// Build the `magnis.sync.fetch` result from the fixture. Returns the
/// Sync-Profile shape `{ envelopes, nextCursor, hasMore }`.
///
/// `direction = "forward"` (CatchUp) drops messages at/below the per-chat cursor
/// `last_msg_id`, mirroring the in-backend catch-up offset logic. `"backward"`
/// (or absent) is a Bootstrap page returning everything.
pub fn fetch_result(direction: &str, cursor: Option<&Value>) -> Value {
    let fx = load();

    // Per-chat catch-up watermark from the inbound cursor (forward only).
    let cursor_chats = cursor
        .and_then(|c| c.get("chats"))
        .and_then(Value::as_object);
    let offset_for = |chat_id: i64| -> i64 {
        cursor_chats
            .and_then(|m| m.get(&chat_id.to_string()))
            .and_then(|v| v.get("last_msg_id"))
            .and_then(Value::as_i64)
            .unwrap_or(0)
    };

    let mut envelopes: Vec<Value> = Vec::new();
    let mut next_chats: serde_json::Map<String, Value> = serde_json::Map::new();

    // Interleave: each chat's envelope, then its (filtered) messages — the same
    // ordering the in-backend bootstrap/catch-up emit.
    for chat in &fx.chats {
        envelopes.push(chat_envelope(chat));

        let offset = if direction == "forward" {
            offset_for(chat.chat_id)
        } else {
            0
        };

        let mut highest: i64 = offset;
        for m in fx.messages.iter().filter(|m| m.chat_id == chat.chat_id) {
            if m.live {
                continue; // live arrivals are pushed via listen, not fetched
            }
            if direction == "forward" && offset > 0 && m.message_id <= offset {
                continue;
            }
            envelopes.push(message_envelope(m, "snapshot"));
            if m.message_id > highest {
                highest = m.message_id;
            }
        }

        if highest > 0 {
            next_chats.insert(chat.chat_id.to_string(), json!({ "last_msg_id": highest }));
        }
    }

    // Messages whose chat has no fixture entry: still serve them (cursor too) so a
    // minimal fixture (messages only) works.
    let chat_ids: std::collections::HashSet<i64> = fx.chats.iter().map(|c| c.chat_id).collect();
    let mut orphan_high: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for m in fx
        .messages
        .iter()
        .filter(|m| !chat_ids.contains(&m.chat_id))
    {
        if m.live {
            continue;
        }
        let offset = if direction == "forward" {
            offset_for(m.chat_id)
        } else {
            0
        };
        if direction == "forward" && offset > 0 && m.message_id <= offset {
            continue;
        }
        envelopes.push(message_envelope(m, "snapshot"));
        let entry = orphan_high.entry(m.chat_id).or_insert(offset);
        if m.message_id > *entry {
            *entry = m.message_id;
        }
    }
    for (chat_id, high) in orphan_high {
        if high > 0 {
            next_chats.insert(chat_id.to_string(), json!({ "last_msg_id": high }));
        }
    }

    let next_cursor = if next_chats.is_empty() {
        Value::Null
    } else {
        json!({
            "date": chrono::Utc::now().to_rfc3339(),
            "chats": Value::Object(next_chats),
        })
    };

    json!({
        "envelopes": envelopes,
        "nextCursor": next_cursor,
        "hasMore": false,
    })
}

/// Live messages (`"live": true`) to replay as `notifications/magnis/envelope`
/// after a `magnis.sync.listen` ack. Each is returned as `(payload, remote_id)`,
/// the exact shape the host's `parse_push_params` reads.
pub fn live_pushes() -> Vec<(Value, String)> {
    load()
        .messages
        .iter()
        .filter(|m| m.live)
        .map(|m| {
            (
                message_payload(m),
                message_remote_id(m.chat_id, m.message_id),
            )
        })
        .collect()
}

/// Fixture-mode `magnis.execute`: no live send — echo the action back so a caller
/// can assert the connector accepted and routed it. `send_message` / `reply`
/// report a synthetic message id; other actions just record.
pub fn execute_result(args: &Value) -> Value {
    let action = args.get("action").and_then(Value::as_str).unwrap_or("");
    match action {
        "send_message" | "reply" => {
            let chat_id = args.get("chat_id").cloned().unwrap_or(Value::Null);
            let text = args.get("text").cloned().unwrap_or(Value::Null);
            json!({
                "message_id": fixture_message_id(),
                "chat_id": chat_id,
                "text": text,
                "schema_id": "telegram.message",
                "recorded": true,
                "action": action,
            })
        }
        "backfill_chat" => json!({
            "envelopes": [],
            "recorded": true,
            "action": "backfill_chat",
        }),
        "download_file" => json!({
            "local_path": args.get("dest").cloned().unwrap_or(Value::Null),
            "size_bytes": 0,
            "recorded": true,
            "action": "download_file",
        }),
        other => json!({ "recorded": true, "action": other }),
    }
}

/// Test seam (Stage 1, DEC-1): a controllable slow tool so the connector
/// concurrency tests have a REAL slow handler (fixture `fetch`/`execute` are
/// immediate). Sleeps for `sleep_ms` (clamped) then echoes a marker. The
/// `marker` arg lets a test correlate which call replied. Only reachable via
/// the internal `magnis.test.sleep` tool name — never advertised in
/// `tools/list`, so production callers never see it.
pub async fn sleep_result(args: &Value) -> Value {
    let sleep_ms = args
        .get("sleep_ms")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(60_000);
    let marker = args.get("marker").cloned().unwrap_or(Value::Null);
    tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;
    json!({ "slept_ms": sleep_ms, "marker": marker })
}

/// A deterministic-enough synthetic message id for fixture sends. Negative so it
/// never collides with real Telegram ids.
fn fixture_message_id() -> i64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0);
    -(nanos.abs() % 1_000_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_fixture(tag: &str, body: &Value) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "magnis-tg-fixture-{tag}-{}-{nanos}.json",
            std::process::id()
        ));
        std::fs::write(&path, serde_json::to_string(body).unwrap()).unwrap();
        path
    }

    // scn_conn_telegram_fix_001 — execute_result echoes send_message with a
    // synthetic id (no live send in fixture mode).
    #[test]
    fn tst_conn_telegram_fix_001_execute_echoes_send() {
        let out = execute_result(&json!({
            "action": "send_message",
            "chat_id": 111,
            "text": "hi"
        }));
        assert_eq!(out["action"], "send_message");
        assert_eq!(out["recorded"], true);
        assert_eq!(out["chat_id"], 111);
        assert_eq!(out["schema_id"], "telegram.message");
        assert!(out["message_id"].is_i64());
    }

    // scn_conn_telegram_fix_002 — forward (catch-up) fetch drops messages at/below
    // the per-chat cursor; backward returns everything. Uses an env-isolated file.
    #[test]
    fn tst_conn_telegram_fix_002_forward_filters_by_cursor() {
        let body = json!({
            "chats": [ { "chat_id": 5, "title": "C", "type": "private" } ],
            "messages": [
                { "message_id": 10, "chat_id": 5, "text": "old", "date": "2026-01-01T00:00:00+00:00" },
                { "message_id": 20, "chat_id": 5, "text": "new", "date": "2026-01-02T00:00:00+00:00" }
            ]
        });
        let path = write_fixture("fwd", &body);
        std::env::set_var("TELEGRAM_FIXTURE_FILE", &path);

        let back = fetch_result("backward", None);
        // chat + 2 messages
        assert_eq!(back["envelopes"].as_array().unwrap().len(), 3);

        let cursor = json!({ "chats": { "5": { "last_msg_id": 10 } } });
        let fwd = fetch_result("forward", Some(&cursor));
        // chat + only message 20
        let envs = fwd["envelopes"].as_array().unwrap();
        assert_eq!(envs.len(), 2);
        assert_eq!(envs[1]["payload"]["message_id"], 20);

        std::env::remove_var("TELEGRAM_FIXTURE_FILE");
        let _ = std::fs::remove_file(&path);
    }
}
