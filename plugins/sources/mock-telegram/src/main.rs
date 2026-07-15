//! External mock-telegram connector — a *controllable* Magnis MCP source.
//!
//! The Telegram analogue of `mock-gmail`: it lets you drive the `telegram`
//! surface like a real Telegram server — inject chats and messages over HTTP and
//! they flow through `magnis.sync.fetch` as canonical telegram envelopes the
//! in-plugin `telegram` module ingests unchanged. Poll-only.
//!
//! ## How state is shared
//! The host spawns ONE child per (surface, account). All children run this same
//! binary and share state through a JSONL file (`MOCK_INJECT_FILE`): one line per
//! injected item, `{ "surface", "payload", "remote_id", "kind" }`. A
//! `magnis.sync.fetch` returns the surface's items past the request cursor.
//!
//! ## Chat vs message kind
//! Chats are emitted as `snapshot` (no trigger), messages as `live` (so the
//! telegram module's `trigger.check` fires) — byte-identical to the real
//! `telegram` connector. The per-item `kind` is stored on the JSONL line and
//! replayed verbatim by `fetch`.
//!
//! ## Injection (demo / eval parity)
//! When `MOCK_TELEGRAM_PORT` is set, the process that wins the port bind runs the
//! HTTP control server (`POST /inject-chat`, `POST /inject-message`, `GET /health`,
//! `GET /status`) and appends canonical items to the shared file. The other
//! child just serves MCP.
//!
//! Env:
//!   MOCK_INJECT_FILE    shared JSONL path (required)
//!   MOCK_TELEGRAM_PORT  optional HTTP control port (default: no HTTP server)

use std::io::Write as _;
use std::path::PathBuf;

use axum::{routing, Json, Router};
use chrono::Utc;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// The single surface this connector feeds.
const SURFACE: &str = "telegram";

fn inject_file() -> PathBuf {
    PathBuf::from(
        std::env::var("MOCK_INJECT_FILE")
            .expect("magnis-mock-telegram requires MOCK_INJECT_FILE (shared JSONL path)"),
    )
}

/// Read all injected items for `surface`, in append order.
fn read_items(surface: &str) -> Vec<Value> {
    let Ok(raw) = std::fs::read_to_string(inject_file()) else {
        return Vec::new();
    };
    raw.lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|v| v.get("surface").and_then(Value::as_str) == Some(surface))
        .collect()
}

/// Append one canonical item line to the shared file. `kind` is stored per item
/// (chats `snapshot`, messages `live`) so the host fires triggers only for live
/// messages. Returns the new total item count for the surface.
fn append_item(payload: Value, remote_id: &str, kind: &str) -> std::io::Result<usize> {
    let line =
        json!({ "surface": SURFACE, "payload": payload, "remote_id": remote_id, "kind": kind });
    let path = inject_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    let mut bytes = serde_json::to_vec(&line).unwrap_or_default();
    bytes.push(b'\n');
    f.write_all(&bytes)?;
    Ok(read_items(SURFACE).len())
}

// ── canonical envelope shaping ───────────────────────────────────────────────
// Telegram subset of the real connector's `envelope.rs`: the fields a mock needs
// to drive the UI. `remote_id` shapes are byte-identical to the real connector.

fn chat_remote_id(chat_id: i64) -> String {
    format!("tg:chat:{}", chat_id)
}

fn message_remote_id(chat_id: i64, message_id: i64) -> String {
    format!("tg:msg:{}:{}", chat_id, message_id)
}

/// Build a canonical chat payload + `remote_id` from inject-chat request fields.
/// Returns `None` when `chat_id` is missing/non-integer.
fn build_chat(req: &Value) -> Option<(Value, String)> {
    let chat_id = req.get("chat_id").and_then(Value::as_i64)?;
    let raw_title = req
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let title = if raw_title.is_empty() {
        format!("Chat {}", chat_id)
    } else {
        raw_title
    };
    let chat_type = req
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("private")
        .to_string();
    let mut payload = json!({
        "entity_type": "telegram_chat",
        "chat_id": chat_id,
        "title": title,
        "type": chat_type,
        "is_pinned": req.get("is_pinned").and_then(Value::as_bool).unwrap_or(false),
        "pin_order": req.get("pin_order").and_then(Value::as_u64).unwrap_or(0),
        "unread_count": req.get("unread_count").and_then(Value::as_i64).unwrap_or(0),
        "unread_mark": req.get("unread_mark").and_then(Value::as_bool).unwrap_or(false),
        "read_inbox_max_id": req.get("read_inbox_max_id").and_then(Value::as_i64).unwrap_or(0),
        "read_outbox_max_id": req.get("read_outbox_max_id").and_then(Value::as_i64).unwrap_or(0),
        "unread_mentions_count": req.get("unread_mentions_count").and_then(Value::as_i64).unwrap_or(0),
        "top_message": req.get("top_message").and_then(Value::as_i64).unwrap_or(0),
    });
    if let Some(mc) = req.get("member_count").and_then(Value::as_i64) {
        payload["member_count"] = json!(mc);
    }
    if let Some(u) = req.get("username").and_then(Value::as_str) {
        payload["username"] = json!(u);
    }
    if let Some(a) = req.get("avatar_url").and_then(Value::as_str) {
        payload["avatar_url"] = json!(a);
    }
    Some((payload, chat_remote_id(chat_id)))
}

/// Build a canonical message payload + `remote_id` from inject-message request
/// fields. `message_id` auto-assigns (monotonic across the shared file) when
/// omitted; `date` defaults to now. Returns `None` when `chat_id` is missing.
fn build_message(req: &Value) -> Option<(Value, String)> {
    let chat_id = req.get("chat_id").and_then(Value::as_i64)?;
    let message_id = req
        .get("message_id")
        .and_then(Value::as_i64)
        .unwrap_or_else(|| read_items(SURFACE).len() as i64 + 1);
    let text = req
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let date = req
        .get("date")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let mut payload = json!({
        "message_id": message_id,
        "chat_id": chat_id,
        "text": text,
        "date": date,
        "is_outgoing": req.get("is_outgoing").and_then(Value::as_bool).unwrap_or(false),
    });
    if let Some(t) = req.get("chat_title").and_then(Value::as_str) {
        payload["chat_title"] = json!(t);
    }
    if let Some(n) = req.get("sender_name").and_then(Value::as_str) {
        payload["sender_name"] = json!(n);
    }
    if let Some(s) = req.get("sender_id").and_then(Value::as_i64) {
        payload["sender_id"] = json!(s);
    }
    if let Some(r) = req.get("reply_to_msg_id").and_then(Value::as_i64) {
        payload["reply_to_msg_id"] = json!(r);
    }
    Some((payload, message_remote_id(chat_id, message_id)))
}

// ── MCP stdio server ─────────────────────────────────────────────────────────

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": [SURFACE],
            "mode": "poll",
            "interval_secs": 2
        } } }
    })
}

/// Build the `magnis.sync.fetch` result for `surface` from cursor onward. The
/// per-item `kind` (snapshot for chats, live for messages) is replayed verbatim.
fn fetch_result(surface: &str, cursor: usize) -> Value {
    let items = read_items(surface);
    let envelopes: Vec<Value> = items
        .iter()
        .skip(cursor)
        .map(|item| {
            json!({
                "surface": surface,
                "payload": item.get("payload").cloned().unwrap_or(json!({})),
                "remote_id": item.get("remote_id").cloned().unwrap_or(Value::Null),
                "kind": item.get("kind").and_then(Value::as_str).unwrap_or("live"),
            })
        })
        .collect();
    json!({
        "envelopes": envelopes,
        "nextCursor": items.len(),
        "hasMore": false
    })
}

async fn run_mcp_stdio() {
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut lines = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let id = msg.get("id").cloned();

        let reply = match method {
            "initialize" => id.map(|id| {
                json!({
                    "jsonrpc": "2.0", "id": id,
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": capabilities(),
                        "serverInfo": { "name": "magnis-mock-telegram", "version": env!("CARGO_PKG_VERSION") }
                    }
                })
            }),
            "tools/call" => id.map(|id| {
                let args = msg.get("params").and_then(|p| p.get("arguments"));
                let name = msg
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if name == "magnis.sync.fetch" {
                    let surface = args
                        .and_then(|a| a.get("surface"))
                        .and_then(Value::as_str)
                        .unwrap_or(SURFACE);
                    let cursor = args
                        .and_then(|a| a.get("cursor"))
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize;
                    json!({ "jsonrpc": "2.0", "id": id, "result": fetch_result(surface, cursor) })
                } else {
                    json!({ "jsonrpc": "2.0", "id": id,
                            "error": { "code": -32601, "message": format!("unknown tool {name}") } })
                }
            }),
            _ => None, // notifications/initialized etc.
        };

        if let Some(reply) = reply {
            let mut bytes = serde_json::to_vec(&reply).unwrap_or_default();
            bytes.push(b'\n');
            if stdout.write_all(&bytes).await.is_err() || stdout.flush().await.is_err() {
                break;
            }
        }
    }
}

// ── HTTP control server (demo / eval parity) ─────────────────────────────────

async fn inject_chat(Json(req): Json<Value>) -> Json<Value> {
    let Some((payload, remote_id)) = build_chat(&req) else {
        return Json(json!({ "queued": false, "error": "chat_id (integer) required" }));
    };
    let total = append_item(payload, &remote_id, "snapshot").unwrap_or(0);
    Json(json!({ "queued": true, "total": total, "remote_id": remote_id }))
}

async fn inject_message(Json(req): Json<Value>) -> Json<Value> {
    let Some((payload, remote_id)) = build_message(&req) else {
        return Json(json!({ "queued": false, "error": "chat_id (integer) required" }));
    };
    let total = append_item(payload, &remote_id, "live").unwrap_or(0);
    Json(json!({ "queued": true, "total": total, "remote_id": remote_id }))
}

async fn status() -> Json<Value> {
    let items = read_items(SURFACE);
    let chats = items
        .iter()
        .filter(|i| i.get("kind").and_then(Value::as_str) == Some("snapshot"))
        .count();
    Json(json!({ "chats": chats, "messages": items.len() - chats, "total": items.len() }))
}

async fn maybe_run_http() {
    let Some(port) = std::env::var("MOCK_TELEGRAM_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
    else {
        return;
    };
    let app = Router::new()
        .route("/inject-chat", routing::post(inject_chat))
        .route("/inject-message", routing::post(inject_message))
        .route("/health", routing::get(|| async { "ok" }))
        .route("/status", routing::get(status));
    // Best-effort bind: only one of the per-surface child processes wins the
    // port; the loser just serves MCP (both read the same shared file).
    match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => {
            eprintln!("magnis-mock-telegram: control server on :{port}");
            let _ = axum::serve(listener, app).await;
        }
        Err(e) => {
            eprintln!("magnis-mock-telegram: control port {port} unavailable ({e}); MCP-only")
        }
    }
}

#[tokio::main]
async fn main() {
    // HTTP control runs in the background; the MCP stdio loop drives the process
    // lifetime (exits on stdin EOF when the host drops the connection).
    tokio::spawn(maybe_run_http());
    run_mcp_stdio().await;
}
