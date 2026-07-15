//! StateMock — the ONE programmable mock connector (plan §11.1).
//!
//! Tests drive it into ANY contract-expressible outcome. The single source
//! of truth is FILE-BASED (`--state-dir <dir>`): the connector child only
//! exists while the host talks to it, so programming must survive process
//! boundaries:
//!   <dir>/program.json  — { "<surface>": [MockStep, ...] } (queue; re-read
//!                          and rewritten on every consuming call)
//!   <dir>/calls.jsonl   — append-only log of every tool call
//! Without `--state-dir` every fetch is a clean empty page and probes
//! answer the default identity — the zero-config archetypes stay usable.
//!
//! MockStep (mirrors the plan verbatim):
//!   { "op": "fetch_ok", "envelopes": N, "next_cursor": {...}|null,
//!     "total": N|null, "total_exact": bool }
//!   { "op": "fetch_ok_no_cursor" }                 — contract violation: has_more, no cursor
//!   { "op": "fetch_error", "error": { "kind": "auth"|"rate_limited"|"network"|..., ... } }
//!   { "op": "fetch_hang", "ms": N }                — heartbeat stall
//!   { "op": "probe_ok", "subject": "..." }         — ProbeAuth success (S2)
//!   { "op": "probe_reject", "message": "..." }     — ProbeAuth 401 (S2)
//! An EMPTY queue answers a clean empty fetch (envelopes: [], hasMore: false).
//!
//! One binary, three archetype manifests (mock-statemachine-{oauth,phone,key}).

use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn arg(name: &str) -> Option<String> {
    let flag = format!("--{name}");
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == &flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn state_dir() -> Option<std::path::PathBuf> {
    arg("state-dir").map(std::path::PathBuf::from)
}

/// Pop the next programmed step for `surface` from the file-backed queue.
/// `Value::Null` = nothing programmed (clean default behavior).
fn next_step(surface: &str) -> Value {
    let Some(dir) = state_dir() else {
        return Value::Null;
    };
    let path = dir.join("program.json");
    let mut programs: HashMap<String, Vec<Value>> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let q = programs.entry(surface.to_string()).or_default();
    if q.is_empty() {
        return Value::Null;
    }
    let step = q.remove(0);
    let _ = std::fs::write(&path, serde_json::to_string(&programs).unwrap_or_default());
    step
}

fn log_call(entry: &Value) {
    if let Some(dir) = state_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let line = format!("{entry}\n");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("calls.jsonl"))
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    }
}

fn surfaces() -> Vec<String> {
    arg("surfaces")
        .unwrap_or_else(|| "mock".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .collect()
}

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": surfaces(),
            "mode": arg("mode").unwrap_or_else(|| "poll".to_string()),
            "interval_secs": 300
        } } }
    })
}

/// Execute the next programmed step for `surface` (or a clean empty fetch).
async fn fetch_result(surface: &str, cursor: Value) -> Value {
    log_call(&json!({ "surface": surface, "tool": "magnis.sync.fetch", "cursor": cursor }));
    let step = next_step(surface);
    let op = step.get("op").and_then(Value::as_str).unwrap_or("");
    match op {
        "" => json!({ "envelopes": [], "nextCursor": null, "hasMore": false }),
        "fetch_ok" => {
            let n = step.get("envelopes").and_then(Value::as_u64).unwrap_or(0);
            let envelopes: Vec<Value> = (0..n)
                .map(|i| {
                    json!({
                        "surface": surface,
                        "payload": { "n": i },
                        "remote_id": format!("sm-{surface}-{i}"),
                        "kind": "snapshot"
                    })
                })
                .collect();
            let next_cursor = step.get("next_cursor").cloned().unwrap_or(Value::Null);
            let has_more = !next_cursor.is_null();
            let mut out = json!({
                "envelopes": envelopes,
                "nextCursor": next_cursor,
                "hasMore": has_more
            });
            if let Some(total) = step.get("total").filter(|t| !t.is_null()) {
                out["total"] = total.clone();
            }
            if let Some(exact) = step.get("total_exact").filter(|t| !t.is_null()) {
                out["total_exact"] = exact.clone();
            }
            out
        }
        "fetch_ok_no_cursor" => json!({ "envelopes": [], "nextCursor": null, "hasMore": true }),
        "fetch_hang" => {
            let ms = step.get("ms").and_then(Value::as_u64).unwrap_or(1000);
            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            json!({ "envelopes": [], "nextCursor": null, "hasMore": false })
        }
        "fetch_error" => {
            // Typed error surface: mirrored to the MCP error data contract.
            let err = step
                .get("error")
                .cloned()
                .unwrap_or(json!({ "kind": "internal" }));
            json!({ "__error": err })
        }
        other => {
            json!({ "__error": { "kind": "contract", "message": format!("unprogrammed op {other}") } })
        }
    }
}

#[tokio::main(flavor = "current_thread")]
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
                json!({
                    "jsonrpc": "2.0", "id": id,
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": capabilities(),
                        "serverInfo": { "name": "magnis-mock-statemachine", "version": env!("CARGO_PKG_VERSION") }
                    }
                })
            }),
            "tools/call" => {
                let args = msg.get("params").and_then(|p| p.get("arguments"));
                let name = msg
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if name == "magnis.auth.probe" {
                    log_call(&json!({ "surface": "__auth__", "tool": "magnis.auth.probe" }));
                    let step = next_step("__auth__");
                    let op = step.get("op").and_then(Value::as_str).unwrap_or("");
                    id.map(|id| match op {
                        "probe_reject" => {
                            let msg = step
                                .get("message")
                                .and_then(Value::as_str)
                                .unwrap_or("rejected");
                            json!({ "jsonrpc": "2.0", "id": id,
                                    "error": { "code": -32000, "message": msg,
                                               "data": { "kind": "auth", "message": msg } } })
                        }
                        _ => {
                            // probe_ok or unprogrammed: the mock's default
                            // identity keeps zero-config archetypes usable.
                            let subject = step
                                .get("subject")
                                .and_then(Value::as_str)
                                .unwrap_or("statemock");
                            json!({ "jsonrpc": "2.0", "id": id,
                                    "result": { "subject": subject } })
                        }
                    })
                } else if name == "magnis.sync.fetch" {
                    let surface = args
                        .and_then(|a| a.get("surface"))
                        .and_then(Value::as_str)
                        .unwrap_or("mock")
                        .to_string();
                    let cursor = args
                        .and_then(|a| a.get("cursor"))
                        .cloned()
                        .unwrap_or(Value::Null);
                    let result = fetch_result(&surface, cursor).await;
                    id.map(|id| {
                        if let Some(err) = result.get("__error") {
                            json!({ "jsonrpc": "2.0", "id": id,
                                    "error": { "code": -32000,
                                               "message": err.get("message").and_then(Value::as_str).unwrap_or("programmed error"),
                                               "data": err } })
                        } else {
                            json!({ "jsonrpc": "2.0", "id": id, "result": result })
                        }
                    })
                } else {
                    id.map(|id| {
                        json!({ "jsonrpc": "2.0", "id": id,
                                "error": { "code": -32601, "message": format!("unknown tool {name}") } })
                    })
                }
            }
            "notifications/initialized" => None,
            _ => id.map(|id| {
                json!({ "jsonrpc": "2.0", "id": id,
                        "error": { "code": -32601, "message": format!("unknown method {method}") } })
            }),
        };

        if let Some(reply) = reply {
            let mut buf = serde_json::to_vec(&reply).unwrap();
            buf.push(b'\n');
            if stdout.write_all(&buf).await.is_err() {
                break;
            }
            let _ = stdout.flush().await;
        }
    }
}
