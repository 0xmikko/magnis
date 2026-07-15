//! External `telegram` connector — Telegram as a Magnis MCP source.
//!
//! Ported faithfully out of the in-backend `backend/src/sources/telegram` source.
//! Speaks the Magnis Sync Profile over stdio JSON-RPC and feeds one PUSH surface
//! (`telegram`) with byte-identical canonical envelopes to the in-core Telegram
//! source, so the `telegram` module ingests it unchanged.
//!
//! ## Credential model
//! The connector builds its own grammers MTProto client. The host injects
//! credentials per call as `_meta = { api_id, api_hash, session }` (the `session`
//! is base64 of an already-authorized grammers session blob).
//!
//! ## Fixture / replay mode (isolated e2e, no live Telegram)
//! If `TELEGRAM_FIXTURE_FILE` is set, `magnis.sync.fetch` is served from that JSON
//! file (NO MTProto network), `magnis.sync.listen` replays the file's `live`
//! messages as push notifications, and `magnis.execute` records/echoes the
//! action. See `fixture.rs` for the file format.

mod auth;
mod client;
mod commands;
mod envelope;
mod fixture;
mod sessions;
mod subscriptions;
mod tools;

use std::sync::Arc;

use grammers_client::InvocationError;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{Mutex, Semaphore};

use client::{account_id_from_meta, creds_from_meta};

/// Bound on concurrently-spawned `tools/call` dispatches (CON-3). The read loop
/// spawns each `tools/call` so an interactive send is never starved behind a
/// long-running bootstrap fetch (DEC-1/INV-1); this caps the in-flight count so
/// a misbehaving caller can't fork-bomb the connector (INV-2).
const MAX_INFLIGHT_TOOL_CALLS: usize = 8;

// ── JSON-RPC error codes (protocol contract with the host) ─────
//
// Generic tool failure (unchanged historical code). `AUTH_REQUIRED_CODE`
// mirrors the host's `backend/src/sources/mcp/runtime.rs::AUTH_REQUIRED_CODE`:
// it tells the host to surface a typed auth error (`SyncStatus::AuthRequired`,
// UI "Re-auth needed") instead of a generic red sync error.
const TOOL_ERROR_CODE: i64 = -32601;
const AUTH_REQUIRED_CODE: i64 = -32001;
/// Rate-limit (DEC-2). A long FLOOD_WAIT on the send path surfaces as the
/// `RATE_LIMITED:{secs}` sentinel (see `client::send_with_flood_retry`); this
/// code + a `data: { retry_after }` payload let the host map it to a typed
/// `SourceError::RateLimit` (`backend/src/sources/mcp/runtime.rs`).
const RATE_LIMITED_CODE: i64 = -32002;

/// Wrap a plain string error (config / arg failures) as a generic tool error.
fn tool_err(message: String) -> (i64, String) {
    (TOOL_ERROR_CODE, message)
}

/// Classify an anyhow error from a live tool op into a JSON-RPC `(code, message)`.
/// A Telegram auth/session failure (grammers RPC error code 401 — e.g.
/// `AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED`) gets `AUTH_REQUIRED_CODE`; a long
/// FLOOD_WAIT (the `RATE_LIMITED:` sentinel) gets `RATE_LIMITED_CODE`; everything
/// else keeps the generic code.
fn classify_tool_error(err: &anyhow::Error) -> (i64, String) {
    let message = err.to_string();
    // DEC-2: the FLOOD_WAIT-aware send wrapper already converted a long
    // flood-wait into the `RATE_LIMITED:{secs}` sentinel.
    if message.starts_with(client::RATE_LIMITED_PREFIX) {
        return (RATE_LIMITED_CODE, message);
    }
    // Telegram signals auth/session failures as RPC error code 401
    // (AUTH_KEY_UNREGISTERED, SESSION_REVOKED, …). Match the structured grammers
    // error, not the message text.
    if let Some(InvocationError::Rpc(rpc)) = err.downcast_ref::<InvocationError>() {
        if rpc.code == 401 {
            return (AUTH_REQUIRED_CODE, message);
        }
    }
    (TOOL_ERROR_CODE, message)
}

/// Classify an already-stringified dispatch error into a JSON-RPC `(code, message)`.
/// The advertised tools (`tools::dispatch`, e.g. `send_message`) stringify their
/// errors before they reach the reply path, so a long FLOOD_WAIT arrives here as the
/// `RATE_LIMITED:{secs}` sentinel STRING (DEC-2). Recognise it so the advertised
/// `send_message` tool surfaces `RATE_LIMITED_CODE` + `retry_after` exactly like the
/// `magnis.execute` path, instead of the generic code. Every other dispatch error
/// keeps the historical generic code.
fn classify_dispatch_error(message: String) -> (i64, String) {
    if message.starts_with(client::RATE_LIMITED_PREFIX) {
        (RATE_LIMITED_CODE, message)
    } else {
        (TOOL_ERROR_CODE, message)
    }
}

/// Build the JSON-RPC `error` object for a failed `magnis.sync.fetch`/
/// `magnis.execute`. A `RATE_LIMITED_CODE` error parses `{secs}` out of the
/// `RATE_LIMITED:{secs}` sentinel and attaches `data: { retry_after: secs }` so
/// the host can read a typed `retry_after` (the connector's only structured
/// error payload today). All other errors emit the plain `{code, message}`.
fn tool_error_reply(code: i64, message: String) -> Value {
    if code == RATE_LIMITED_CODE {
        if let Some(secs) = message
            .strip_prefix(client::RATE_LIMITED_PREFIX)
            .and_then(|s| s.trim().parse::<u64>().ok())
        {
            return json!({
                "code": code,
                "message": format!("rate limited; retry after {secs}s"),
                "data": { "retry_after": secs }
            });
        }
    }
    json!({ "code": code, "message": message })
}

// ── Sync Profile capabilities ─────────────────────────────────

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": ["telegram"],
            "mode": "push"
        } } }
    })
}

// ── magnis.sync.fetch ─────────────────────────────────────────

/// Build the `magnis.sync.fetch` result. In fixture mode it is served from the
/// file (one page); in live mode it drives grammers through the shared
/// `SessionPool` (Stage 6) — one MTProto session per account_id, reused across
/// fetch / execute / listen for that account.
async fn fetch(args: &Value) -> Result<Value, (i64, String)> {
    let direction = args
        .get("direction")
        .and_then(Value::as_str)
        .unwrap_or("backward");
    let cursor = args.get("cursor");

    if fixture::fixture_path().is_some() {
        return Ok(fixture::fetch_result(direction, cursor));
    }

    let creds = creds_from_meta(args).map_err(tool_err)?;
    let account_id = account_id_from_meta(args).map_err(tool_err)?;
    let client = sessions::pool()
        .get_or_create(&account_id, &creds)
        .await
        .map_err(tool_err)?;
    commands::fetch(&client, &account_id, direction, cursor)
        .await
        .map_err(|e| classify_tool_error(&e))
}

// ── magnis.execute ────────────────────────────────────────────

/// Forward an outbound action verbatim. Fixture mode records/echoes; live mode
/// drives the connected client (`send_message` | `reply` | `backfill_chat`)
/// through the shared `SessionPool`.
async fn execute(args: &Value) -> Result<Value, (i64, String)> {
    if fixture::fixture_path().is_some() {
        return Ok(fixture::execute_result(args));
    }
    let creds = creds_from_meta(args).map_err(tool_err)?;
    let account_id = account_id_from_meta(args).map_err(tool_err)?;
    let client = sessions::pool()
        .get_or_create(&account_id, &creds)
        .await
        .map_err(tool_err)?;
    commands::execute(&client, &account_id, args)
        .await
        .map_err(|e| classify_tool_error(&e))
}

// ── MCP stdio server ──────────────────────────────────────────

/// Shared, locked stdout so request replies and push notifications never
/// interleave on the wire.
type SharedOut = Arc<Mutex<tokio::io::Stdout>>;

async fn write_msg(out: &SharedOut, msg: &Value) -> bool {
    let mut bytes = serde_json::to_vec(msg).unwrap_or_default();
    bytes.push(b'\n');
    let mut w = out.lock().await;
    w.write_all(&bytes).await.is_ok() && w.flush().await.is_ok()
}

/// Convert one grammers live update into push `(payload, remote_id)` pairs. v1
/// handles new/edited messages (the common live case); other update kinds are
/// dropped (best-effort — the in-backend source handles more, but fixture mode
/// is the tested path).
pub(crate) fn live_update_pushes_inline(
    update: grammers_client::types::Update,
    account_id: &str,
) -> Vec<(Value, String)> {
    use grammers_client::types::Update;
    match update {
        Update::NewMessage(msg) | Update::MessageEdited(msg) => {
            // Live updates carry a full chat — its own id is authoritative here.
            let chat_id = msg.chat().id();
            let m = client::message_to_intermediate(&msg, account_id, chat_id);
            vec![(
                envelope::message_payload(&m),
                envelope::message_remote_id(m.chat_id, m.message_id),
            )]
        }
        _ => vec![],
    }
}

/// Handle one `tools/call` to completion and write its reply. Runs inside a
/// spawned task (DEC-1) so a long-running dispatch (e.g. a bootstrap fetch)
/// never blocks the read loop. All owned: `name`/`args`/`id` are moved, `out`
/// and `registry` are `Arc` clones. The mode-spawn gate is applied by the
/// caller before this is reached.
async fn handle_tools_call(
    name: String,
    args: Value,
    id: Value,
    out: SharedOut,
    registry: Arc<subscriptions::SubscriptionRegistry>,
) {
    // Opinionated tools first (advertised in tools/list); fall through to
    // internal dispatchers for host-side callers (NOT advertised on purpose).
    if let Some(outcome) = tools::dispatch(&name, &args).await {
        let reply = match outcome {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            // R4/DEC-2: a long FLOOD_WAIT bubbles up here as the `RATE_LIMITED:{secs}`
            // sentinel string; classify it so the advertised `send_message` tool emits
            // `-32002` + `retry_after` like `magnis.execute`. Other errors keep -32601.
            Err(message) => {
                let (code, message) = classify_dispatch_error(message);
                json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": tool_error_reply(code, message)
                })
            }
        };
        write_msg(&out, &reply).await;
        return;
    }

    match name.as_str() {
        // Stage 1: subscription protocol (named, cancellable).
        "listen_start" => {
            let sub_id = args
                .get("subscription_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if sub_id.is_empty() {
                write_msg(
                    &out,
                    &json!({
                        "jsonrpc": "2.0", "id": id,
                        "error": { "code": -32602, "message": "missing required arg 'subscription_id'" }
                    }),
                )
                .await;
                return;
            }
            let reply = match registry
                .start_from_env(sub_id.clone(), &args, out.clone())
                .await
            {
                Ok(()) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "result": { "ok": true, "subscription_id": sub_id }
                }),
                Err(message) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": { "code": -32602, "message": message }
                }),
            };
            write_msg(&out, &reply).await;
        }
        "listen_stop" => {
            let sub_id = args
                .get("subscription_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let cancelled = if sub_id.is_empty() {
                false
            } else {
                registry.stop(&sub_id).await
            };
            write_msg(
                &out,
                &json!({
                    "jsonrpc": "2.0", "id": id,
                    "result": { "ok": true, "subscription_id": sub_id, "cancelled": cancelled }
                }),
            )
            .await;
        }
        // Backward-compat: legacy single-subscription tool. Routes through the
        // registry with a stable default sub_id derived from account_id so
        // callers that never adopted listen_stop still get one cancellable
        // subscription per account.
        "magnis.sync.listen" => {
            let sub_id = match account_id_from_meta(&args) {
                Ok(account_id) => format!("sub:{account_id}"),
                Err(_) => "sub:legacy".to_string(),
            };
            let reply = match registry
                .start_from_env(sub_id.clone(), &args, out.clone())
                .await
            {
                Ok(()) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "result": { "ok": true, "subscription_id": sub_id }
                }),
                Err(message) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": { "code": -32602, "message": message }
                }),
            };
            write_msg(&out, &reply).await;
        }
        "magnis.sync.fetch" | "magnis.execute" => {
            let outcome = if name == "magnis.sync.fetch" {
                fetch(&args).await
            } else {
                execute(&args).await
            };
            let reply = match outcome {
                Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                Err((code, message)) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": tool_error_reply(code, message)
                }),
            };
            write_msg(&out, &reply).await;
        }
        // Test seam (Stage 1, DEC-1): a controllable slow handler so the
        // concurrency tests can put a real in-flight call behind a fast one.
        // Not advertised in tools/list.
        "magnis.test.sleep" => {
            let result = fixture::sleep_result(&args).await;
            write_msg(
                &out,
                &json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            )
            .await;
        }
        // Host-driven MTProto login (DEC-15/21/24). One connector instance per
        // session keeps the grammers client + LoginToken alive across begin→step.
        "magnis.auth.begin" | "magnis.auth.step" | "magnis.auth.revoke" => {
            let outcome = match name.as_str() {
                "magnis.auth.begin" => auth::begin(&args).await,
                "magnis.auth.step" => auth::step(&args).await,
                _ => auth::revoke(&args).await,
            };
            let reply = match outcome {
                Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                Err(message) => json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": { "code": -32000, "message": message }
                }),
            };
            write_msg(&out, &reply).await;
        }
        other => {
            write_msg(
                &out,
                &json!({
                    "jsonrpc": "2.0", "id": id,
                    "error": { "code": -32601, "message": format!("unknown tool {other}") }
                }),
            )
            .await;
        }
    }
}

async fn run_mcp_stdio() {
    let stdin = tokio::io::stdin();
    let out: SharedOut = Arc::new(Mutex::new(tokio::io::stdout()));
    let mut lines = BufReader::new(stdin).lines();
    // One subscription registry per connector process (Stage 1).
    let registry = Arc::new(subscriptions::SubscriptionRegistry::new());
    // CON-3/INV-2: bound the concurrently-spawned `tools/call` dispatches.
    let sem = Arc::new(Semaphore::new(MAX_INFLIGHT_TOOL_CALLS));
    // Mode-spawn gating (DEC-8/INV-16): an --auth-mode spawn exposes ONLY
    // `magnis.auth.*`; a sync spawn refuses them. Defense-in-depth.
    let auth_mode = std::env::args().any(|a| a == "--auth-mode");

    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let id = msg.get("id").cloned();

        match method {
            "initialize" => {
                if let Some(id) = id {
                    write_msg(
                        &out,
                        &json!({
                            "jsonrpc": "2.0", "id": id,
                            "result": {
                                "protocolVersion": "2025-06-18",
                                "capabilities": capabilities(),
                                "serverInfo": { "name": "magnis-telegram", "version": env!("CARGO_PKG_VERSION") }
                            }
                        }),
                    )
                    .await;
                }
            }
            "tools/list" => {
                if let Some(id) = id {
                    write_msg(
                        &out,
                        &json!({ "jsonrpc": "2.0", "id": id, "result": tools::tools_list() }),
                    )
                    .await;
                }
            }
            "tools/call" => {
                let Some(id) = id else { continue };
                let args = msg
                    .get("params")
                    .and_then(|p| p.get("arguments"))
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let name = msg
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();

                // Mode-spawn gate (DEC-8): reject cross-mode tool calls up front.
                // Stays INLINE (cheap, no I/O) before the spawn.
                if name.starts_with("magnis.auth.") != auth_mode {
                    write_msg(
                        &out,
                        &json!({
                            "jsonrpc": "2.0", "id": id,
                            "error": { "code": -32601, "message": format!(
                                "tool '{name}' is not available in {} mode",
                                if auth_mode { "auth" } else { "sync" }
                            ) }
                        }),
                    )
                    .await;
                    continue;
                }

                // DEC-1/INV-1: spawn the ENTIRE remaining `tools/call` handling so
                // the read loop never blocks on a long-running dispatch (a
                // background bootstrap fetch no longer starves an interactive
                // send). Bounded by the semaphore (CON-3/INV-2): the permit is
                // acquired INSIDE the spawned task so the read loop itself never
                // blocks, but the (bound+1)th task waits for a permit before it
                // dispatches. Stdout writes stay serialized via `out`'s Mutex.
                let out = out.clone();
                let registry = registry.clone();
                let sem = sem.clone();
                tokio::spawn(async move {
                    let _permit = sem.acquire_owned().await.expect("semaphore not closed");
                    handle_tools_call(name, args, id, out, registry).await;
                });
            }
            _ => {} // notifications/initialized etc.
        }
    }
}

#[tokio::main]
async fn main() {
    run_mcp_stdio().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use grammers_mtsender::RpcError;

    fn rpc_err(code: i32, name: &str) -> anyhow::Error {
        anyhow::Error::new(InvocationError::Rpc(RpcError {
            code,
            name: name.to_string(),
            value: None,
            caused_by: None,
        }))
    }

    // INV-1: a Telegram auth/session failure (grammers RPC code 401, e.g.
    // AUTH_KEY_UNREGISTERED) is classified with AUTH_REQUIRED_CODE so the host
    // surfaces "Re-auth needed" rather than a generic sync error.
    #[test]
    fn tst_src_tg_001_auth_error_classified_as_auth_code() {
        let (code, message) = classify_tool_error(&rpc_err(401, "AUTH_KEY_UNREGISTERED"));
        assert_eq!(code, AUTH_REQUIRED_CODE);
        assert!(
            message.contains("AUTH_KEY_UNREGISTERED"),
            "message should carry the grammers detail, got: {message}"
        );
    }

    // INV-3 (connector side): non-auth RPC errors and plain errors keep the
    // generic tool-error code — no regression.
    #[test]
    fn tst_src_tg_002_non_auth_errors_keep_generic_code() {
        // FLOOD_WAIT (420) is not auth.
        assert_eq!(
            classify_tool_error(&rpc_err(420, "FLOOD_WAIT")).0,
            TOOL_ERROR_CODE
        );
        // A non-grammers error.
        assert_eq!(
            classify_tool_error(&anyhow::anyhow!("some parse failure")).0,
            TOOL_ERROR_CODE
        );
    }

    // INV-3 (connector side): a long FLOOD_WAIT surfaces from the send wrapper as
    // the `RATE_LIMITED:{secs}` sentinel → classified to RATE_LIMITED_CODE, and
    // the error reply carries `data.retry_after` so the host can type it.
    #[test]
    fn tst_src_tg_024_rate_limited_sentinel_classified_with_retry_after() {
        let (code, message) =
            classify_tool_error(&anyhow::anyhow!("{}120", client::RATE_LIMITED_PREFIX));
        assert_eq!(code, RATE_LIMITED_CODE);
        let obj = tool_error_reply(code, message);
        assert_eq!(obj["code"], RATE_LIMITED_CODE);
        assert_eq!(obj["message"], "rate limited; retry after 120s");
        assert_eq!(obj["data"]["retry_after"], 120);
    }

    // INV-3 (connector side, advertised-tool path): the advertised `send_message`
    // tool routes through `tools::dispatch`, which stringifies its error. A long
    // FLOOD_WAIT arrives here as the `RATE_LIMITED:{secs}` sentinel STRING and must
    // still be classified to RATE_LIMITED_CODE (with `retry_after`), not the generic
    // code — same typed signal the `magnis.execute` path emits.
    #[test]
    fn tst_src_tg_025_dispatch_rate_limit_sentinel_classified() {
        let (code, message) =
            classify_dispatch_error(format!("{}120", client::RATE_LIMITED_PREFIX));
        assert_eq!(code, RATE_LIMITED_CODE);
        let obj = tool_error_reply(code, message);
        assert_eq!(obj["code"], RATE_LIMITED_CODE);
        assert_eq!(obj["data"]["retry_after"], 120);

        // A plain dispatch error keeps the generic code and emits no `data`.
        let (code, _message) = classify_dispatch_error("missing required arg 'chat_id'".into());
        assert_eq!(code, TOOL_ERROR_CODE);
        let obj = tool_error_reply(code, "missing required arg 'chat_id'".into());
        assert_eq!(obj["code"], TOOL_ERROR_CODE);
        assert!(obj.get("data").is_none(), "plain error must not carry data");
    }
}
