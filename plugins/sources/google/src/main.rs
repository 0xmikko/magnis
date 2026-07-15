//! External `google` connector — Gmail + Calendar + Contacts as a Magnis MCP source.
//!
//! Speaks the Magnis Sync Profile over stdio JSON-RPC and feeds three
//! surfaces (`email`, `meetings`, `contacts`) with canonical envelopes
//! the corresponding modules ingest unchanged. Poll-only (matching the
//! original Gmail/Calendar runtime); People API has no delta token so
//! contacts is full-snapshot per page.
//!
//! ## Credential model
//! The connector does OAuth itself. The host injects credentials per call as
//! `_meta = { refresh_token, client_id, client_secret }`. On each fetch/execute
//! the connector calls `refresh_access_token(...)` to mint an access token, then
//! calls the Gmail / Calendar REST API.
//!
//! ## Fixture / replay mode (isolated e2e, no live Google)
//! If `GOOGLE_FIXTURE_FILE` is set, `magnis.sync.fetch` is served from that JSON
//! file (NO network, NO OAuth) and `magnis.execute` records/echoes the action.
//! See `fixture.rs` for the file format.

mod auth;
mod calendar;
mod contacts;
mod fixture;
mod gmail;
mod mime;
mod oauth_exchange;
mod progress;
mod surfaces;
mod tools;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use auth::{refresh_access_token, GoogleSyncError};
use calendar::GoogleCalendarApiClient;
use contacts::GoogleContactsApiClient;
use gmail::GmailApiClient;

/// Shared HTTP client, reused across every call. Building a fresh
/// `reqwest::Client` per request rebuilds the connection pool and redoes
/// DNS/TLS each time; under load (multi-account × surfaces × the host's
/// link-preview flood) that exhausts outbound connections and surfaces as
/// "error sending request for url …". One pooled client with a connect
/// timeout fixes it. `reqwest::Client` is `Arc`-internally → cloning is cheap.
fn http_client() -> reqwest::Client {
    use std::sync::OnceLock;
    static SHARED: OnceLock<reqwest::Client> = OnceLock::new();
    SHARED
        .get_or_init(|| {
            reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(10))
                .pool_idle_timeout(std::time::Duration::from_secs(30))
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default()
        })
        .clone()
}

/// Send a request, retrying a few times on transient connection failures
/// (connection refused/reset, connect timeout, generic "error sending
/// request"). At cold start the host fires every surface × account sync
/// loop at once, so the connector refreshes tokens and hits the Gmail /
/// Calendar / People APIs in a burst against an unwarmed pool; Google
/// occasionally drops one of those connections. A bounded backoff lets
/// that single transient self-heal instead of marking the whole surface
/// `Error` (which the scheduler does NOT auto-retry). Non-transient
/// errors (decode, body) and any HTTP status are returned immediately —
/// this only retries the low-level send. All call sites use GET or small
/// form/JSON POST bodies, which `try_clone` supports.
pub(crate) async fn send_with_retry(
    req: reqwest::RequestBuilder,
) -> reqwest::Result<reqwest::Response> {
    const MAX_RETRIES: u32 = 3;
    let mut attempt: u32 = 0;
    loop {
        let Some(this_try) = req.try_clone() else {
            // Streaming/non-cloneable body — send once, no retry.
            return req.send().await;
        };
        match this_try.send().await {
            Ok(resp) => return Ok(resp),
            Err(e) => {
                let transient = e.is_connect() || e.is_timeout() || e.is_request();
                if transient && attempt < MAX_RETRIES {
                    attempt += 1;
                    // 600ms, 1.2s, 2.4s
                    let backoff = std::time::Duration::from_millis(300u64 * (1u64 << attempt));
                    tokio::time::sleep(backoff).await;
                    continue;
                }
                return Err(e);
            }
        }
    }
}

// ── Sync Profile capabilities ─────────────────────────────────

fn capabilities() -> Value {
    json!({
        "tools": {},
        "experimental": { "magnis": { "sync": {
            "surfaces": ["email", "meetings", "contacts"],
            "mode": "poll",
            "interval_secs": 30
        } } }
    })
}

// ── Credentials from the per-call `_meta` ─────────────────────

/// OAuth app credentials + refresh token injected by the host as `_meta`.
struct Creds {
    refresh_token: String,
    client_id: String,
    client_secret: String,
}

/// Pull `{ refresh_token, client_id, client_secret }` out of the tool-call
/// `_meta`. All three are required — a missing key is an error (NO FALLBACK).
fn creds_from_meta(args: &Value) -> Result<Creds, String> {
    let meta = args
        .get("_meta")
        .ok_or_else(|| "missing _meta with Google credentials".to_string())?;
    let get = |k: &str| {
        meta.get(k)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .ok_or_else(|| format!("missing credential '{k}' in _meta"))
    };
    Ok(Creds {
        refresh_token: get("refresh_token")?,
        client_id: get("client_id")?,
        client_secret: get("client_secret")?,
    })
}

/// Refresh an access token from the injected credentials.
async fn access_token(creds: &Creds) -> Result<String, GoogleSyncError> {
    let http = http_client();
    refresh_access_token(
        &http,
        &creds.client_id,
        &creds.client_secret,
        &creds.refresh_token,
    )
    .await
}

// ── magnis.sync.fetch ─────────────────────────────────────────

/// Build the `magnis.sync.fetch` result. `direction = "backward"` (or absent) is
/// a Bootstrap page; `direction = "forward"` is a CatchUp. In fixture mode the
/// file is served verbatim (one page). The wire result is camelCase
/// (`nextCursor`, `hasMore`) per the Sync Profile.
async fn fetch(args: &Value) -> Result<Value, String> {
    let surface = args
        .get("surface")
        .and_then(Value::as_str)
        .unwrap_or("email");

    if fixture::fixture_path().is_some() {
        return Ok(fixture::fetch_result(surface));
    }

    let direction = args
        .get("direction")
        .and_then(Value::as_str)
        .unwrap_or("backward");
    let cursor = args.get("cursor");

    let creds = creds_from_meta(args)?;
    let token = access_token(&creds).await.map_err(|e| e.to_string())?;

    match surface {
        "email" => {
            let client = GmailApiClient::new(http_client(), token);
            let (envelopes, next_cursor, has_more, total, discovered) = if direction == "forward" {
                client
                    .fetch_history_changes(cursor)
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                client
                    .fetch_message_page(cursor)
                    .await
                    .map_err(|e| e.to_string())?
            };
            Ok(json!({
                "envelopes": envelopes,
                "nextCursor": next_cursor,
                "hasMore": has_more,
                "total": total,
                "discovered": discovered,
            }))
        }
        "meetings" => {
            // Calendar is window-based: both Bootstrap and CatchUp page the same
            // time window (the in-backend runtime treats them identically).
            let client = GoogleCalendarApiClient::new(http_client(), token);
            let (envelopes, next_cursor, discovered) = client
                .fetch_events_page(cursor, args)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "envelopes": envelopes,
                "nextCursor": next_cursor,
                "hasMore": next_cursor_present(&next_cursor),
                // No cheap total estimate → indeterminate "N synced…" (DEC-5).
                "discovered": discovered,
            }))
        }
        "contacts" => {
            // People API has no delta token — every page is a snapshot.
            // Direction is ignored: Bootstrap and CatchUp both page
            // through `/people/me/connections` identically.
            let client = GoogleContactsApiClient::new(http_client(), token);
            let (envelopes, next_cursor, discovered) = client
                .fetch_contacts_page(cursor)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({
                "envelopes": envelopes,
                "nextCursor": next_cursor,
                "hasMore": next_cursor_present(&next_cursor),
                // No cheap total estimate → indeterminate "N synced…" (DEC-5).
                "discovered": discovered,
            }))
        }
        other => Err(format!("unknown surface '{other}'")),
    }
}

fn next_cursor_present(c: &Option<Value>) -> bool {
    c.is_some()
}

// ── magnis.execute ────────────────────────────────────────────

/// Forward an outbound action (`send_message` | `download_file`) to Gmail. The
/// host relays `{ action, ... , _meta }` verbatim; the result JSON is returned
/// to the caller unchanged. Ported from the in-backend Gmail `Execute` arm.
async fn execute(args: &Value) -> Result<Value, String> {
    if fixture::fixture_path().is_some() {
        return Ok(fixture::execute_result(args));
    }

    let action = args.get("action").and_then(Value::as_str).unwrap_or("");
    let creds = creds_from_meta(args)?;
    let token = access_token(&creds).await.map_err(|e| e.to_string())?;
    let client = GmailApiClient::new(http_client(), token);

    match action {
        "send_message" => {
            let draft: surfaces::MailDraft =
                serde_json::from_value(args.get("draft").cloned().unwrap_or_default())
                    .map_err(|e| format!("Invalid MailDraft payload: {e}"))?;
            let result = client
                .send_message(draft)
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "download_file" => {
            let source_ref = args
                .get("source_ref")
                .ok_or_else(|| "download_file: missing source_ref".to_string())?;
            let dest_str = args
                .get("dest")
                .and_then(Value::as_str)
                .ok_or_else(|| "download_file: missing dest".to_string())?;
            let dest = std::path::PathBuf::from(dest_str);
            let message_id = source_ref
                .get("message_id")
                .and_then(Value::as_str)
                .ok_or_else(|| "download_file: missing message_id in source_ref".to_string())?;
            let attachment_id = source_ref
                .get("attachment_id")
                .and_then(Value::as_str)
                .ok_or_else(|| "download_file: missing attachment_id in source_ref".to_string())?;

            let bytes = client
                .download_attachment(message_id, attachment_id)
                .await
                .map_err(|e| e.to_string())?;

            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            tokio::fs::write(&dest, &bytes)
                .await
                .map_err(|e| e.to_string())?;

            let size_bytes = bytes.len() as u64;
            let local_path = dest.to_string_lossy().to_string();
            Ok(json!({ "local_path": local_path, "size_bytes": size_bytes }))
        }
        other => Err(format!("Unknown gmail execute action: {other}")),
    }
}

// ── MCP stdio server ──────────────────────────────────────────

async fn run_mcp_stdio() {
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut lines = BufReader::new(stdin).lines();

    // Mode-spawn gating (DEC-8/INV-16): an auth-mode spawn (--auth-mode) exposes
    // ONLY `magnis.auth.*`; a normal (sync) spawn refuses them. The host already
    // spawns the right mode per use; this is defense-in-depth so a sync binding
    // can never run an auth tool, nor vice-versa.
    let auth_mode = std::env::args().any(|a| a == "--auth-mode");

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
                        "serverInfo": { "name": "magnis-google", "version": env!("CARGO_PKG_VERSION") }
                    }
                })
            }),
            "tools/list" => id.map(|id| {
                json!({ "jsonrpc": "2.0", "id": id, "result": tools::tools_list() })
            }),
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
                let is_auth_tool = name.starts_with("magnis.auth.");
                let outcome = if is_auth_tool != auth_mode {
                    Err(format!(
                        "tool '{name}' is not available in {} mode",
                        if auth_mode { "auth" } else { "sync" }
                    ))
                } else if let Some(r) = tools::dispatch(&name, &args).await {
                    // Opinionated tools first (advertised in tools/list); fall
                    // through to internal dispatchers for host-side callers.
                    r
                } else {
                    match name.as_str() {
                        "magnis.sync.fetch" => fetch(&args).await,
                        "magnis.execute" => execute(&args).await,
                        // Host-driven OAuth code→token exchange (DEC-15/25/26).
                        "magnis.auth.exchange" => oauth_exchange::exchange(&args).await,
                        // Provider-side revoke at disconnect (DEC-27).
                        "magnis.auth.revoke" => oauth_exchange::revoke(&args).await,
                        other => Err(format!("unknown tool {other}")),
                    }
                };

                Some(match outcome {
                    Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                    Err(message) => json!({
                        "jsonrpc": "2.0", "id": id,
                        "error": { "code": -32601, "message": message }
                    }),
                })
            }
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

#[tokio::main]
async fn main() {
    run_mcp_stdio().await;
}
