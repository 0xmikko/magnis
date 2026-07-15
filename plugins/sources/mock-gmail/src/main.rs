//! External mock-gmail connector — the reference Magnis MCP source (Stage 7).
//!
//! This is the first in-backend source migrated to the external-MCP format. It
//! speaks the Magnis Sync Profile over stdio JSON-RPC and feeds two surfaces
//! (`email` + `meetings`) with byte-identical canonical envelopes to the old
//! in-core `mock-gmail`, so the `emails` / `meetings` modules ingest it
//! unchanged. Poll-only (matching the original).
//!
//! ## How the two surface processes coordinate
//! The host spawns ONE child per (surface, account). Both children run this same
//! binary and share state through a JSONL file (`MOCK_INJECT_FILE`): one line
//! per injected item, `{ "surface", "payload", "remote_id" }`. A `magnis.sync.fetch`
//! for a surface returns that surface's items past the request cursor (an index).
//!
//! ## Injection (demo / eval parity)
//! When `MOCK_EMAIL_PORT` is set, the process that wins the port bind runs the
//! HTTP injection server (`POST /inject`, `POST /inject-event`, `GET /health`,
//! `GET /status`) and appends canonical items to the shared file — preserving the
//! `curl localhost:4020/inject` workflow. The other child just serves MCP.
//!
//! Env:
//!   MOCK_INJECT_FILE  shared JSONL path (required)
//!   MOCK_EMAIL_PORT   optional HTTP injection port (default: no HTTP server)

use std::io::Write as _;
use std::path::PathBuf;

use axum::{routing, Json, Router};
use chrono::Utc;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use uuid::Uuid;

fn inject_file() -> PathBuf {
    PathBuf::from(
        std::env::var("MOCK_INJECT_FILE")
            .expect("magnis-mock-gmail requires MOCK_INJECT_FILE (shared JSONL path)"),
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

/// Append one canonical item line to the shared file.
fn append_item(surface: &str, payload: Value, remote_id: &str) -> std::io::Result<usize> {
    let line = json!({ "surface": surface, "payload": payload, "remote_id": remote_id });
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
    Ok(read_items(surface).len())
}

// ── MCP stdio server ─────────────────────────────────────────────────────────

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": ["email", "meetings"],
            "mode": "poll",
            "interval_secs": 5
        } } }
    })
}

/// Build the `magnis.sync.fetch` result for `surface` from cursor onward.
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
                // Injected items are fresh arrivals (matching the old in-core
                // mock, which stamped Live) so the modules' trigger.check fires.
                "kind": "live",
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
                        "serverInfo": { "name": "magnis-mock-gmail", "version": env!("CARGO_PKG_VERSION") }
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
                        .unwrap_or("email");
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

// ── HTTP injection server (demo / eval parity) ───────────────────────────────

async fn inject_email(Json(req): Json<Value>) -> Json<Value> {
    let message_id = req
        .get("message_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("mock-{}", Uuid::new_v4()));
    let attachments: Vec<Value> = req
        .get("attachments")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|a| {
                    json!({
                        "attachment_id": a.get("attachment_id").and_then(Value::as_str)
                            .map(str::to_string).unwrap_or_else(|| format!("att-{}", Uuid::new_v4())),
                        "filename": a.get("filename").cloned().unwrap_or(Value::Null),
                        "mime_type": a.get("mime_type").cloned().unwrap_or(Value::Null),
                        "size": a.get("size").cloned().unwrap_or(json!(0)),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let mut payload = json!({
        "message_id": message_id,
        "from_address": req.get("from_address").cloned().unwrap_or(Value::Null),
        "from_name": req.get("from_name").and_then(Value::as_str).unwrap_or_default(),
        "subject": req.get("subject").cloned().unwrap_or(Value::Null),
        "body_text": req.get("body_text").cloned().unwrap_or(Value::Null),
        "sent_at": Utc::now().to_rfc3339(),
        "has_attachments": !attachments.is_empty(),
        "attachments": attachments,
    });
    if let Some(tid) = req.get("thread_id").and_then(Value::as_str) {
        payload["thread_id"] = Value::String(tid.to_string());
    }
    let total = append_item("email", payload, &message_id).unwrap_or(0);
    Json(json!({ "queued": true, "total": total }))
}

async fn inject_event(Json(req): Json<Value>) -> Json<Value> {
    let id = req
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("mock-{}", Uuid::new_v4()));
    let remote_id = format!("gcal:{id}");
    let attendees: Vec<Value> = req
        .get("attendees")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|a| json!({ "name": a.get("name").cloned().unwrap_or(Value::Null), "email": a.get("email").cloned().unwrap_or(Value::Null) }))
                .collect()
        })
        .unwrap_or_default();
    let mut payload = json!({
        "id": id,
        "title": req.get("title").cloned().unwrap_or(Value::Null),
        "starts_at": req.get("starts_at").cloned().unwrap_or(Value::Null),
        "ends_at": req.get("ends_at").cloned().unwrap_or(Value::Null),
        "attendees": attendees,
    });
    if let Some(desc) = req.get("description").and_then(Value::as_str) {
        payload["description"] = Value::String(desc.to_string());
    }
    if let Some(loc) = req.get("location").and_then(Value::as_str) {
        payload["location"] = Value::String(loc.to_string());
    }
    let total = append_item("meetings", payload, &remote_id).unwrap_or(0);
    Json(json!({ "queued": true, "total": total }))
}

async fn maybe_run_http() {
    let Some(port) = std::env::var("MOCK_EMAIL_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
    else {
        return;
    };
    let app = Router::new()
        .route("/inject", routing::post(inject_email))
        .route("/inject-event", routing::post(inject_event))
        .route("/health", routing::get(|| async { "ok" }))
        .route(
            "/status",
            routing::get(|| async {
                Json(json!({
                    "email": read_items("email").len(),
                    "meetings": read_items("meetings").len()
                }))
            }),
        );
    // Best-effort bind: only one of the per-surface child processes wins the
    // port; the loser just serves MCP (both read the same shared file).
    match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => {
            eprintln!("magnis-mock-gmail: injection server on :{port}");
            let _ = axum::serve(listener, app).await;
        }
        Err(e) => eprintln!("magnis-mock-gmail: injection port {port} unavailable ({e}); MCP-only"),
    }
}

#[tokio::main]
async fn main() {
    // HTTP injection runs in the background; the MCP stdio loop drives the
    // process lifetime (exits on stdin EOF when the host drops the connection).
    tokio::spawn(maybe_run_http());
    run_mcp_stdio().await;
}
