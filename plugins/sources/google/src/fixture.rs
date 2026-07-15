//! Fixture / replay mode — env-gated isolated e2e with NO network and NO OAuth.
//!
//! When `GOOGLE_FIXTURE_FILE` is set, the connector reads canned Google API
//! shapes from that JSON file instead of calling Gmail / Calendar. Crucially it
//! runs the SAME conversion path as live mode (the Gmail message-to-MailMessage
//! flatten for email, and the Gcal-event conversion for meetings), so
//! fixture-mode envelopes are byte-identical to real-mode ones.
//!
//! ## Fixture file format (single JSON object)
//!
//! ```jsonc
//! {
//!   // Each entry is a raw Gmail `users.messages.get` (format=full) response.
//!   "messages": [
//!     {
//!       "id": "m1",
//!       "threadId": "t1",
//!       "labelIds": ["UNREAD", "INBOX"],
//!       "snippet": "Hello preview",
//!       "internalDate": "1700000000000",
//!       "payload": {
//!         "mimeType": "text/plain",
//!         "headers": [
//!           { "name": "Subject", "value": "Hi" },
//!           { "name": "From", "value": "Alice <alice@x.com>" },
//!           { "name": "To", "value": "Bob <bob@y.com>" }
//!         ],
//!         "body": { "data": "<base64url>" }
//!       }
//!     }
//!   ],
//!   // Each entry is a raw Google Calendar `events.list` item.
//!   "events": [
//!     {
//!       "id": "e1",
//!       "summary": "Standup",
//!       "status": "confirmed",
//!       "start": { "dateTime": "2026-05-20T10:00:00Z" },
//!       "end":   { "dateTime": "2026-05-20T10:15:00Z" },
//!       "attendees": [ { "email": "alice@x.com", "displayName": "Alice" } ]
//!     }
//!   ],
//!   // Each entry is a raw People API `people.connections.list` item.
//!   "connections": [
//!     {
//!       "resourceName": "people/c12345",
//!       "names": [ { "displayName": "Carol", "givenName": "Carol" } ],
//!       "emailAddresses": [ { "value": "carol@x.com" } ]
//!     }
//!   ]
//! }
//! ```
//!
//! `magnis.sync.fetch` returns every fixture item for the requested surface in
//! file order; the cursor is end-of-stream (one page, `hasMore = false`).
//! `magnis.execute` records nothing remote — it echoes the action back so a
//! caller can assert the connector accepted it (no live send in fixture mode).

use serde_json::{json, Value};

use crate::calendar::{gcal_event_to_calendar_event, GcalEvent};
use crate::contacts::{gpeople_person_to_contact, GpeoplePerson};
use crate::gmail::{flatten_mail_payload, gmail_message_to_mail_message, GmailMessage};

/// Path of the active fixture file, or `None` for live mode.
pub fn fixture_path() -> Option<String> {
    std::env::var("GOOGLE_FIXTURE_FILE").ok()
}

/// Parsed fixture contents (the three raw-API arrays). Missing arrays are empty.
struct Fixture {
    messages: Vec<Value>,
    events: Vec<Value>,
    connections: Vec<Value>,
}

fn load() -> Fixture {
    let Some(path) = fixture_path() else {
        return Fixture {
            messages: Vec::new(),
            events: Vec::new(),
            connections: Vec::new(),
        };
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("magnis-google: cannot read GOOGLE_FIXTURE_FILE {path}: {e}");
            return Fixture {
                messages: Vec::new(),
                events: Vec::new(),
                connections: Vec::new(),
            };
        }
    };
    let doc: Value = match serde_json::from_str(&raw) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("magnis-google: malformed GOOGLE_FIXTURE_FILE {path}: {e}");
            return Fixture {
                messages: Vec::new(),
                events: Vec::new(),
                connections: Vec::new(),
            };
        }
    };
    Fixture {
        messages: doc
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        events: doc
            .get("events")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        connections: doc
            .get("connections")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    }
}

/// Build the `magnis.sync.fetch` result for `surface` from the fixture file.
/// Returns the Sync-Profile shape: `{ envelopes, nextCursor, hasMore }`.
pub fn fetch_result(surface: &str) -> Value {
    let fx = load();
    let envelopes: Vec<Value> = match surface {
        "email" => fx.messages.iter().filter_map(message_to_envelope).collect(),
        "meetings" => fx.events.iter().filter_map(event_to_envelope).collect(),
        "contacts" => fx
            .connections
            .iter()
            .filter_map(connection_to_envelope)
            .collect(),
        _ => Vec::new(),
    };
    json!({
        "envelopes": envelopes,
        "nextCursor": Value::Null,
        "hasMore": false,
    })
}

/// One raw Gmail message → canonical flattened email envelope (same code path as
/// live mode). Malformed entries are skipped (logged), matching live tolerance.
fn message_to_envelope(raw: &Value) -> Option<Value> {
    let msg: GmailMessage = match serde_json::from_value(raw.clone()) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("magnis-google: fixture message parse failed: {e}");
            return None;
        }
    };
    let mail = match gmail_message_to_mail_message(&msg) {
        Ok(mm) => mm,
        Err(e) => {
            eprintln!("magnis-google: fixture message convert failed: {e}");
            return None;
        }
    };
    let mut payload = serde_json::to_value(&mail).ok()?;
    flatten_mail_payload(&mut payload);
    Some(json!({
        "surface": "email",
        "payload": payload,
        "remote_id": msg.id,
        "kind": "snapshot",
    }))
}

/// One raw Gcal event → canonical meeting envelope (same code path as live mode).
/// `status == "cancelled"` is dropped, exactly as the live runtime does.
fn event_to_envelope(raw: &Value) -> Option<Value> {
    let ev: GcalEvent = match serde_json::from_value(raw.clone()) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("magnis-google: fixture event parse failed: {e}");
            return None;
        }
    };
    if ev.status.as_deref() == Some("cancelled") {
        return None;
    }
    let cal = match gcal_event_to_calendar_event(&ev) {
        Ok(ce) => ce,
        Err(e) => {
            eprintln!("magnis-google: fixture event convert failed: {e}");
            return None;
        }
    };
    let payload = serde_json::to_value(&cal).ok()?;
    Some(json!({
        "surface": "meetings",
        "payload": payload,
        "remote_id": format!("gcal:{}", ev.id),
        "kind": "snapshot",
    }))
}

/// One raw People-API connection → canonical contact envelope (same code path
/// as live mode). Returns `None` for entries `gpeople_person_to_contact` would
/// drop (no name AND no email AND no phone), matching live tolerance.
fn connection_to_envelope(raw: &Value) -> Option<Value> {
    let person: GpeoplePerson = match serde_json::from_value(raw.clone()) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("magnis-google: fixture connection parse failed: {e}");
            return None;
        }
    };
    let contact = gpeople_person_to_contact(&person)?;
    let remote_id = format!("gpeople:{}", contact.id);
    let payload = serde_json::to_value(&contact).ok()?;
    Some(json!({
        "surface": "contacts",
        "payload": payload,
        "remote_id": remote_id,
        "kind": "snapshot",
    }))
}

/// Fixture-mode `magnis.execute`: no live send/download — echo the action back
/// so a caller can assert the connector accepted and routed it. `send_message`
/// reports a synthetic message id; `download_file` reports zero bytes written.
pub fn execute_result(args: &Value) -> Value {
    let action = args.get("action").and_then(Value::as_str).unwrap_or("");
    match action {
        "send_message" => json!({
            "message_id": format!("fixture-{}", uuid::Uuid::new_v4()),
            "thread_id": Value::Null,
            "recorded": true,
            "action": "send_message",
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
