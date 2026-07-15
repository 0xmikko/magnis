//! External `local` connector — local-filesystem notes as a Magnis MCP source.
//!
//! Migrated out of the backend (was `backend/src/sources/local`). Read-only sync:
//! it scans a notes directory for `*.md` files and serves them on the `notes`
//! surface via `magnis.sync.fetch`, with the same canonical payload the in-core
//! source emitted. Note *writes* are unchanged — the notes module writes the
//! same directory directly — so this connector only ingests.
//!
//! Env:
//!   NOTES_DIR    notes directory (defaults to `$STORAGE_DIR/notes`)
//!
//! Fetch model: `direction = "backward"` (bootstrap) returns all notes;
//! `direction = "forward"` (catch-up) returns notes with `mtime` past the
//! cursor's `last_mtime`. `next_cursor = { "last_mtime": <newest mtime> }`.

use std::path::PathBuf;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn notes_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("NOTES_DIR") {
        return PathBuf::from(dir);
    }
    if let Ok(storage) = std::env::var("STORAGE_DIR") {
        return PathBuf::from(storage).join("notes");
    }
    panic!("magnis-local requires NOTES_DIR or STORAGE_DIR");
}

struct Entry {
    path: String,
    filename: String,
    body: String,
    size: u64,
    mtime: i64,
}

/// Scan the notes dir for `*.md` files (recursive), newest `mtime` first.
fn scan(base: &PathBuf) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut stack = vec![base.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
                let Ok(meta) = std::fs::metadata(&p) else {
                    continue;
                };
                let Ok(bytes) = std::fs::read(&p) else {
                    continue;
                };
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                out.push(Entry {
                    path: p
                        .strip_prefix(base)
                        .unwrap_or(&p)
                        .to_string_lossy()
                        .to_string(),
                    filename: p
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    body: String::from_utf8_lossy(&bytes).to_string(),
                    size: meta.len(),
                    mtime,
                });
            }
        }
    }
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime).then(a.path.cmp(&b.path)));
    out
}

fn fetch_result(direction: &str, cursor: Option<&Value>) -> Value {
    let base = notes_dir();
    let entries = scan(&base);
    let cursor_mtime = cursor
        .and_then(|c| c.get("last_mtime"))
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let newest = entries.first().map(|e| e.mtime);
    let envelopes: Vec<Value> = entries
        .iter()
        .filter(|e| direction != "forward" || e.mtime > cursor_mtime)
        .map(|e| {
            let mut hasher = Sha256::new();
            hasher.update(e.body.as_bytes());
            let content_hash = format!("{:x}", hasher.finalize());
            json!({
                "surface": "notes",
                "payload": {
                    "path": e.path,
                    "filename": e.filename,
                    "body": e.body,
                    "size": e.size,
                    "mtime": e.mtime,
                    "content_hash": content_hash,
                },
                "remote_id": e.path,
            })
        })
        .collect();

    json!({
        "envelopes": envelopes,
        "nextCursor": newest.map(|m| json!({ "last_mtime": m })),
        "hasMore": false,
    })
}

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": ["notes"], "mode": "poll", "interval_secs": 60
        } } }
    })
}

#[tokio::main]
async fn main() {
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
                json!({ "jsonrpc": "2.0", "id": id, "result": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": capabilities(),
                    "serverInfo": { "name": "magnis-local", "version": env!("CARGO_PKG_VERSION") }
                }})
            }),
            "tools/call" => id.map(|id| {
                let args = msg.get("params").and_then(|p| p.get("arguments"));
                let name = msg
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if name == "magnis.sync.fetch" {
                    let direction = args
                        .and_then(|a| a.get("direction"))
                        .and_then(Value::as_str)
                        .unwrap_or("backward");
                    let cursor = args.and_then(|a| a.get("cursor"));
                    json!({ "jsonrpc": "2.0", "id": id, "result": fetch_result(direction, cursor) })
                } else {
                    json!({ "jsonrpc": "2.0", "id": id,
                            "error": { "code": -32601, "message": format!("unknown tool {name}") } })
                }
            }),
            _ => None,
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
