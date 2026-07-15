//! Minimal MCP stdio test client for connector e2e tests.
//!
//! Each external source connector is a standalone binary speaking the Model
//! Context Protocol over newline-delimited JSON-RPC on stdio. This kit spawns
//! such a binary as a child process and drives it the way the Magnis host
//! would — `initialize`, `tools/call`, and server→client notifications — so a
//! connector crate can e2e-test *its own MCP server in isolation* (via
//! `CARGO_BIN_EXE_<name>`), without pulling in the backend.
//!
//! ```no_run
//! # async fn ex() {
//! use magnis_mcp_testkit::McpServer;
//! // In a connector crate's test, use `env!("CARGO_BIN_EXE_<bin-name>")`.
//! let cmd = tokio::process::Command::new("target/debug/magnis-mock-gmail");
//! let server = McpServer::spawn(cmd).unwrap();
//! let caps = server.initialize().await.unwrap();
//! let out = server.call_tool("magnis.sync.fetch", serde_json::json!({ "surface": "email" })).await.unwrap();
//! # }
//! ```

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, mpsc, oneshot};

/// A server→client JSON-RPC notification (the push channel).
#[derive(Debug, Clone)]
pub struct Notification {
    pub method: String,
    pub params: Value,
}

/// An error talking to the connector under test.
#[derive(Debug)]
pub enum McpError {
    Closed,
    Spawn(String),
    Rpc { code: i64, message: String },
}

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpError::Closed => write!(f, "mcp transport closed"),
            McpError::Spawn(m) => write!(f, "spawn failed: {m}"),
            McpError::Rpc { code, message } => write!(f, "rpc error {code}: {message}"),
        }
    }
}

type Pending = Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value, McpError>>>>>;

/// A spawned connector under test. Killed on drop (`kill_on_drop`).
pub struct McpServer {
    _child: Child,
    out_tx: mpsc::UnboundedSender<Value>,
    pending: Pending,
    notif_tx: broadcast::Sender<Notification>,
    next_id: AtomicI64,
    closed: Arc<AtomicBool>,
}

impl McpServer {
    /// Spawn `cmd` as a child connector and wire its stdio.
    pub fn spawn(mut cmd: Command) -> Result<Self, McpError> {
        use std::process::Stdio;
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|e| McpError::Spawn(e.to_string()))?;
        let stdin = child.stdin.take().ok_or(McpError::Closed)?;
        let stdout = child.stdout.take().ok_or(McpError::Closed)?;

        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let notif_tx = broadcast::channel::<Notification>(256).0;
        let closed = Arc::new(AtomicBool::new(false));
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Value>();

        // Writer task.
        {
            let closed = closed.clone();
            let pending = pending.clone();
            tokio::spawn(async move {
                let mut w = stdin;
                while let Some(msg) = out_rx.recv().await {
                    let Ok(mut bytes) = serde_json::to_vec(&msg) else {
                        continue;
                    };
                    bytes.push(b'\n');
                    if w.write_all(&bytes).await.is_err() || w.flush().await.is_err() {
                        break;
                    }
                }
                mark_closed(&closed, &pending);
            });
        }
        // Reader task.
        {
            let pending = pending.clone();
            let notif_tx = notif_tx.clone();
            let closed = closed.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) if line.trim().is_empty() => continue,
                        Ok(Some(line)) => {
                            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                                dispatch(&v, &pending, &notif_tx);
                            }
                        }
                        _ => break,
                    }
                }
                mark_closed(&closed, &pending);
            });
        }

        Ok(Self {
            _child: child,
            out_tx,
            pending,
            notif_tx,
            next_id: AtomicI64::new(1),
            closed,
        })
    }

    /// Subscribe to server→client notifications.
    pub fn subscribe(&self) -> broadcast::Receiver<Notification> {
        self.notif_tx.subscribe()
    }

    /// Send a JSON-RPC request and await its response.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, McpError> {
        if self.closed.load(Ordering::Relaxed) {
            return Err(McpError::Closed);
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let msg = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        if self.out_tx.send(msg).is_err() {
            self.pending.lock().unwrap().remove(&id);
            return Err(McpError::Closed);
        }
        rx.await.map_err(|_| McpError::Closed)?
    }

    /// Fire-and-forget notification.
    pub fn notify(&self, method: &str, params: Value) {
        let _ = self
            .out_tx
            .send(json!({ "jsonrpc": "2.0", "method": method, "params": params }));
    }

    /// MCP `initialize` handshake; returns the server's `capabilities`.
    pub async fn initialize(&self) -> Result<Value, McpError> {
        let result = self
            .request(
                "initialize",
                json!({ "protocolVersion": "2025-06-18", "capabilities": {},
                        "clientInfo": { "name": "magnis-mcp-testkit", "version": "0" } }),
            )
            .await?;
        let caps = result.get("capabilities").cloned().unwrap_or(json!({}));
        self.notify("notifications/initialized", json!({}));
        Ok(caps)
    }

    /// Call an MCP tool.
    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<Value, McpError> {
        self.request(
            "tools/call",
            json!({ "name": name, "arguments": arguments }),
        )
        .await
    }

    /// Await the next notification within `dur`, or `None` on timeout/close.
    pub async fn next_notification(&self, dur: Duration) -> Option<Notification> {
        let mut sub = self.subscribe();
        match tokio::time::timeout(dur, sub.recv()).await {
            Ok(Ok(n)) => Some(n),
            _ => None,
        }
    }
}

fn mark_closed(closed: &Arc<AtomicBool>, pending: &Pending) {
    closed.store(true, Ordering::Relaxed);
    for (_, tx) in pending.lock().unwrap().drain() {
        let _ = tx.send(Err(McpError::Closed));
    }
}

fn dispatch(v: &Value, pending: &Pending, notif: &broadcast::Sender<Notification>) {
    if let Some(id) = v.get("id").and_then(Value::as_i64) {
        if let Some(tx) = pending.lock().unwrap().remove(&id) {
            if let Some(err) = v.get("error") {
                let code = err.get("code").and_then(Value::as_i64).unwrap_or(-1);
                let message = err
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let _ = tx.send(Err(McpError::Rpc { code, message }));
            } else {
                let _ = tx.send(Ok(v.get("result").cloned().unwrap_or(Value::Null)));
            }
        }
    } else if let Some(method) = v.get("method").and_then(Value::as_str) {
        let _ = notif.send(Notification {
            method: method.to_string(),
            params: v.get("params").cloned().unwrap_or(Value::Null),
        });
    }
}
