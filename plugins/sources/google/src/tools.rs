//! Opinionated MCP tools advertised via `tools/list` for direct
//! Claude / agent use (vs the internal `magnis.sync.fetch` /
//! `magnis.execute` dispatchers the host backend uses for its own
//! pipeline).
//!
//! Each opinionated tool:
//!   - Has a stable name + input schema (declared in `tools_list`)
//!   - Trims the response to a Claude-friendly shape (drops verbose
//!     body_html, attachment bytes, internal labels, etc.) — full
//!     canonical envelopes stay available via `magnis.sync.fetch`
//!   - Requires `_meta` credentials like every other tool call
//!
//! Future direction: these tools become the natural implementation of
//! module-declared interfaces (MailSource, CalendarSource,
//! ContactSource) once modules move to TS. See
//! `docs/plans/module-driven-mcp-sources.md`.

use serde_json::{json, Map, Value};

use crate::auth::refresh_access_token;
use crate::calendar::GoogleCalendarApiClient;
use crate::contacts::GoogleContactsApiClient;
use crate::gmail::{gmail_message_to_mail_message, GmailApiClient};

/// MCP `tools/list` result — what Claude sees when it asks the
/// connector for available tools. Internal dispatchers
/// (`magnis.sync.fetch`, `magnis.execute`) are NOT advertised; they
/// remain callable but are host-only.
pub fn tools_list() -> Value {
    json!({
        "tools": [
            {
                "name": "list_emails",
                "description":
                    "List recent Gmail messages, newest first. \
                     Returns trimmed metadata (id, subject, from, \
                     snippet, sent_at, is_read). Use `get_email` for \
                     full body and attachments.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "limit":  { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
                        "cursor": { "type": "string", "description": "Opaque cursor from a previous page" }
                    },
                    "additionalProperties": false
                }
            },
            {
                "name": "get_email",
                "description":
                    "Fetch a single Gmail message by id, including \
                     body text/HTML and attachment metadata.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Gmail message id" }
                    },
                    "required": ["id"],
                    "additionalProperties": false
                }
            },
            {
                "name": "send_email",
                "description":
                    "Send a Gmail message. Body is plain text; \
                     optional `body_html` for richer formatting. \
                     `in_reply_to` is an RFC 2822 Message-ID for \
                     threading.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "to":          { "type": "array", "items": { "type": "string" }, "minItems": 1 },
                        "cc":          { "type": "array", "items": { "type": "string" } },
                        "bcc":         { "type": "array", "items": { "type": "string" } },
                        "subject":     { "type": "string" },
                        "body":        { "type": "string", "description": "Plain-text body" },
                        "body_html":   { "type": "string", "description": "Optional HTML body" },
                        "in_reply_to": { "type": "string", "description": "RFC 2822 Message-ID for threading" }
                    },
                    "required": ["to", "subject", "body"],
                    "additionalProperties": false
                }
            },
            {
                "name": "list_meetings",
                "description":
                    "List Google Calendar events, most recent first. \
                     Returns trimmed shape (id, title, starts_at, \
                     ends_at, attendees, location, conference_link).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "cursor": { "type": "string", "description": "Opaque cursor from a previous page" }
                    },
                    "additionalProperties": false
                }
            },
            {
                "name": "list_contacts",
                "description":
                    "List Google contacts (People API). Returns \
                     trimmed shape (id, display_name, emails, phones, \
                     organizations).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "cursor": { "type": "string", "description": "Opaque cursor from a previous page" }
                    },
                    "additionalProperties": false
                }
            }
        ]
    })
}

/// Dispatch an opinionated tool call. Returns `Some(result)` if the
/// tool name matched; `None` if the caller should fall through to the
/// internal-dispatcher arms (`magnis.sync.fetch`, `magnis.execute`).
pub async fn dispatch(name: &str, args: &Value) -> Option<Result<Value, String>> {
    match name {
        "list_emails" => Some(list_emails(args).await),
        "get_email" => Some(get_email(args).await),
        "send_email" => Some(send_email(args).await),
        "list_meetings" => Some(list_meetings(args).await),
        "list_contacts" => Some(list_contacts(args).await),
        _ => None,
    }
}

// ── helpers ──────────────────────────────────────────────────

/// Pull `_meta.{refresh_token, client_id, client_secret}` and mint an
/// access token. Mirrors `creds_from_meta` + `access_token` in main.rs
/// but kept local so this module compiles in isolation.
async fn access_token_from_args(args: &Value) -> Result<String, String> {
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
    let refresh_token = get("refresh_token")?;
    let client_id = get("client_id")?;
    let client_secret = get("client_secret")?;
    let http = reqwest::Client::new();
    refresh_access_token(&http, &client_id, &client_secret, &refresh_token)
        .await
        .map_err(|e| e.to_string())
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        let mut t: String = s.chars().take(max).collect();
        t.push('…');
        t
    } else {
        s.to_string()
    }
}

fn trim_address(v: &Value) -> Value {
    // EmailAddress is `{name?, address}`. Render as "Name <addr>" or just "addr".
    let name = v.get("name").and_then(Value::as_str);
    let addr = v.get("address").and_then(Value::as_str).unwrap_or("");
    match name {
        Some(n) if !n.is_empty() => json!(format!("{n} <{addr}>")),
        _ => json!(addr),
    }
}

// ── list_emails ──────────────────────────────────────────────

async fn list_emails(args: &Value) -> Result<Value, String> {
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .map(|n| n.clamp(1, 100) as usize)
        .unwrap_or(20);

    // Reuse the internal fetch path via direct call (mirrors
    // host SyncScheduler behaviour). We don't go through `fetch()`
    // in main.rs to keep the modules cleanly separated; instead we
    // build a fresh GmailApiClient with the access token from _meta.
    let token = access_token_from_args(args).await?;
    let client = GmailApiClient::new(reqwest::Client::new(), token);
    let cursor_arg = args.get("cursor");
    let (envelopes, next_cursor, has_more, _total, _discovered) = client
        .fetch_message_page(cursor_arg)
        .await
        .map_err(|e| e.to_string())?;

    let trimmed: Vec<Value> = envelopes
        .into_iter()
        .take(limit)
        .map(|env| {
            // env is a SourceEnvelope wrapper; payload is the
            // canonical MailMessage. The connector's fetch path
            // returns these wrapped — see plugins/.../main.rs fetch.
            let payload = env.get("payload").cloned().unwrap_or(Value::Null);
            json!({
                "id": payload.get("id"),
                "thread_id": payload.get("thread_id"),
                "subject": payload.get("subject"),
                "from": trim_address(payload.get("from").unwrap_or(&Value::Null)),
                "snippet": payload.get("snippet"),
                "sent_at": payload.get("sent_at"),
                "is_read": payload.get("is_read"),
                "has_attachments": payload.get("has_attachments"),
            })
        })
        .collect();
    Ok(json!({
        "emails": trimmed,
        "cursor": next_cursor,
        "has_more": has_more,
    }))
}

// ── get_email ────────────────────────────────────────────────

async fn get_email(args: &Value) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing required arg 'id'".to_string())?;

    let token = access_token_from_args(args).await?;
    let client = GmailApiClient::new(reqwest::Client::new(), token);
    let gmail_msg = client.fetch_message(id).await.map_err(|e| e.to_string())?;
    let mail = gmail_message_to_mail_message(&gmail_msg).map_err(|e| e.to_string())?;
    // Return the full canonical MailMessage — Claude is asking for one
    // message explicitly so trimming would be lossy here.
    serde_json::to_value(&mail).map_err(|e| e.to_string())
}

// ── send_email ───────────────────────────────────────────────

async fn send_email(args: &Value) -> Result<Value, String> {
    let to: Vec<String> = parse_str_array(args.get("to"), "to")?;
    let cc: Vec<String> = parse_str_array(args.get("cc"), "cc").unwrap_or_default();
    let bcc: Vec<String> = parse_str_array(args.get("bcc"), "bcc").unwrap_or_default();
    let subject = args
        .get("subject")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing required arg 'subject'".to_string())?
        .to_string();
    let body = args
        .get("body")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing required arg 'body'".to_string())?
        .to_string();
    let body_html = args
        .get("body_html")
        .and_then(Value::as_str)
        .map(str::to_string);
    let in_reply_to = args
        .get("in_reply_to")
        .and_then(Value::as_str)
        .map(str::to_string);

    let to_addrs = to.iter().map(|s| string_to_address(s)).collect::<Vec<_>>();
    let cc_addrs = cc.iter().map(|s| string_to_address(s)).collect::<Vec<_>>();
    let bcc_addrs = bcc.iter().map(|s| string_to_address(s)).collect::<Vec<_>>();
    let draft = crate::surfaces::MailDraft {
        to: to_addrs,
        cc: cc_addrs,
        bcc: bcc_addrs,
        subject,
        body_text: body,
        body_html,
        in_reply_to,
        attachments: Vec::new(),
    };

    let token = access_token_from_args(args).await?;
    let client = GmailApiClient::new(reqwest::Client::new(), token);
    let result = client
        .send_message(draft)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&result).map_err(|e| e.to_string())
}

fn parse_str_array(v: Option<&Value>, field: &str) -> Result<Vec<String>, String> {
    let Some(arr) = v.and_then(Value::as_array) else {
        return Err(format!("'{field}' must be an array of strings"));
    };
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let Some(s) = item.as_str() else {
            return Err(format!("'{field}' must contain only strings"));
        };
        out.push(s.to_string());
    }
    Ok(out)
}

/// Accept either a bare address "foo@x.com" or a "Name <foo@x.com>"
/// form. We don't parse the latter precisely — connector's `mime.rs`
/// already handles the MIME encoding side. Here we just split off
/// a display name if present so the `MailDraft` shape is preserved.
fn string_to_address(s: &str) -> crate::surfaces::EmailAddress {
    let s = s.trim();
    if let (Some(lt), Some(gt)) = (s.rfind('<'), s.rfind('>')) {
        if lt < gt {
            let name = s[..lt].trim().trim_matches('"').to_string();
            let addr = s[lt + 1..gt].trim().to_string();
            return crate::surfaces::EmailAddress {
                name: if name.is_empty() { None } else { Some(name) },
                address: addr,
            };
        }
    }
    crate::surfaces::EmailAddress {
        name: None,
        address: s.to_string(),
    }
}

// ── list_meetings ────────────────────────────────────────────

async fn list_meetings(args: &Value) -> Result<Value, String> {
    let token = access_token_from_args(args).await?;
    let client = GoogleCalendarApiClient::new(reqwest::Client::new(), token);
    let cursor_arg = args.get("cursor");
    let (envelopes, next_cursor, _discovered) = client
        .fetch_events_page(cursor_arg, args)
        .await
        .map_err(|e| e.to_string())?;
    let trimmed: Vec<Value> = envelopes
        .iter()
        .map(|env| {
            let payload = env.get("payload").cloned().unwrap_or(Value::Null);
            let attendees: Vec<Value> = payload
                .get("attendees")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|a| trim_address(&a))
                .collect();
            json!({
                "id": payload.get("id"),
                "title": payload.get("title"),
                "starts_at": payload.get("starts_at"),
                "ends_at": payload.get("ends_at"),
                "all_day": payload.get("all_day"),
                "status": payload.get("status"),
                "location": payload.get("location"),
                "conference_link": payload.get("conference_link"),
                "attendees": attendees,
                "description": payload
                    .get("description")
                    .and_then(Value::as_str)
                    .map(|s| truncate_str(s, 500)),
            })
        })
        .collect();
    Ok(json!({
        "meetings": trimmed,
        "cursor": next_cursor,
        "has_more": next_cursor.is_some(),
    }))
}

// ── list_contacts ────────────────────────────────────────────

async fn list_contacts(args: &Value) -> Result<Value, String> {
    let token = access_token_from_args(args).await?;
    let client = GoogleContactsApiClient::new(reqwest::Client::new(), token);
    let cursor_arg = args.get("cursor");
    let (envelopes, next_cursor, _discovered) = client
        .fetch_contacts_page(cursor_arg)
        .await
        .map_err(|e| e.to_string())?;
    let trimmed: Vec<Value> = envelopes
        .iter()
        .map(|env| {
            let payload = env.get("payload").cloned().unwrap_or(Value::Null);
            // Contact payload shape (canonical) is rich; flatten to a
            // Claude-friendly headline view: id, display_name, primary
            // email, primary phone, primary org.
            let primary_email = primary_field(payload.get("emails"), "address");
            let primary_phone = primary_field(payload.get("phones"), "number");
            let primary_org = primary_org_view(payload.get("organizations"));
            json!({
                "id": payload.get("id"),
                "display_name": payload.get("display_name"),
                "primary_email": primary_email,
                "primary_phone": primary_phone,
                "primary_organization": primary_org,
                "all_emails": payload.get("emails"),
                "all_phones": payload.get("phones"),
            })
        })
        .collect();
    Ok(json!({
        "contacts": trimmed,
        "cursor": next_cursor,
        "has_more": next_cursor.is_some(),
    }))
}

fn primary_field(arr: Option<&Value>, key: &str) -> Option<Value> {
    let arr = arr?.as_array()?;
    arr.iter()
        .find(|e| {
            e.get("is_primary")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .or_else(|| arr.first())
        .and_then(|e| e.get(key).cloned())
}

fn primary_org_view(arr: Option<&Value>) -> Option<Value> {
    let arr = arr?.as_array()?;
    let pick = arr
        .iter()
        .find(|o| {
            o.get("is_current")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .or_else(|| arr.first())?;
    let mut out = Map::new();
    if let Some(n) = pick.get("name") {
        out.insert("name".into(), n.clone());
    }
    if let Some(t) = pick.get("title") {
        out.insert("title".into(), t.clone());
    }
    Some(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_str_array_accepts_strings() {
        let v = json!(["a@x", "b@x"]);
        assert_eq!(
            parse_str_array(Some(&v), "to").unwrap(),
            vec!["a@x".to_string(), "b@x".to_string()]
        );
    }

    #[test]
    fn parse_str_array_rejects_non_array() {
        let v = json!("a@x");
        assert!(parse_str_array(Some(&v), "to").is_err());
    }

    #[test]
    fn parse_str_array_rejects_non_string_element() {
        let v = json!(["a@x", 42]);
        assert!(parse_str_array(Some(&v), "to").is_err());
    }

    #[test]
    fn string_to_address_parses_bare_email() {
        let a = string_to_address("alice@example.com");
        assert_eq!(a.name, None);
        assert_eq!(a.address, "alice@example.com");
    }

    #[test]
    fn string_to_address_parses_named_form() {
        let a = string_to_address("Alice <alice@example.com>");
        assert_eq!(a.name.as_deref(), Some("Alice"));
        assert_eq!(a.address, "alice@example.com");
    }

    #[test]
    fn string_to_address_strips_quoted_name() {
        let a = string_to_address("\"Alice Smith\" <alice@example.com>");
        assert_eq!(a.name.as_deref(), Some("Alice Smith"));
    }

    #[test]
    fn trim_address_with_name() {
        let v = json!({ "name": "Alice", "address": "alice@x" });
        assert_eq!(trim_address(&v), json!("Alice <alice@x>"));
    }

    #[test]
    fn trim_address_without_name() {
        let v = json!({ "address": "alice@x" });
        assert_eq!(trim_address(&v), json!("alice@x"));
    }

    #[test]
    fn primary_field_prefers_primary_flag() {
        let arr = json!([
            { "address": "secondary@x", "is_primary": false },
            { "address": "primary@x", "is_primary": true }
        ]);
        assert_eq!(
            primary_field(Some(&arr), "address"),
            Some(json!("primary@x"))
        );
    }

    #[test]
    fn primary_field_falls_back_to_first_when_none_primary() {
        let arr = json!([
            { "address": "first@x" },
            { "address": "second@x" }
        ]);
        assert_eq!(primary_field(Some(&arr), "address"), Some(json!("first@x")));
    }

    #[test]
    fn tools_list_advertises_all_opinionated_tools() {
        let result = tools_list();
        let tools = result["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"list_emails"));
        assert!(names.contains(&"get_email"));
        assert!(names.contains(&"send_email"));
        assert!(names.contains(&"list_meetings"));
        assert!(names.contains(&"list_contacts"));
        // Internal dispatchers MUST NOT leak into tools/list.
        assert!(!names.contains(&"magnis.sync.fetch"));
        assert!(!names.contains(&"magnis.execute"));
    }
}
