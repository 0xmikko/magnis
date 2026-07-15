//! Isolated e2e for the google connector's MCP server (FIXTURE mode).
//!
//! Spawns THIS crate's binary (`CARGO_BIN_EXE_magnis-google`) as a real child
//! and drives it over stdio with the testkit — exactly as the Magnis host would
//! — with `GOOGLE_FIXTURE_FILE` pointing at a seeded fixture so there is NO live
//! Google call and NO OAuth. Asserts the `initialize` capabilities (both
//! surfaces), the flattened canonical email payload + `remote_id`, the meeting
//! payload + `gcal:` `remote_id`, and that `magnis.execute send_message` returns
//! a result.

use base64::Engine;
use magnis_mcp_testkit::McpServer;
use serde_json::{json, Value};

/// A unique temp path for this test's fixture file.
fn temp_fixture(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "magnis-google-{tag}-{}-{nanos}.json",
        std::process::id()
    ))
}

fn b64url(s: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s)
}

/// Seed two emails + one meeting as raw Google API shapes.
fn seed_fixture() -> Value {
    json!({
        "messages": [
            {
                "id": "m1",
                "threadId": "t1",
                "labelIds": ["UNREAD", "INBOX"],
                "snippet": "Hello preview",
                "internalDate": "1700000000000",
                "payload": {
                    "mimeType": "text/plain",
                    "headers": [
                        { "name": "Subject", "value": "Quarterly review" },
                        { "name": "From", "value": "Alice <alice@example.com>" },
                        { "name": "To", "value": "Bob <bob@example.com>, carol@example.com" },
                        { "name": "Cc", "value": "dave@example.com" },
                        { "name": "Date", "value": "Tue, 14 Nov 2023 22:13:20 +0000" }
                    ],
                    "body": { "size": 11, "data": b64url("Hello world") }
                }
            },
            {
                "id": "m2",
                "labelIds": ["INBOX"],
                "internalDate": "1700000100000",
                "payload": {
                    "mimeType": "text/plain",
                    "headers": [
                        { "name": "Subject", "value": "Lunch?" },
                        { "name": "From", "value": "eve@example.com" },
                        { "name": "To", "value": "me@example.com" }
                    ],
                    "body": { "data": b64url("Want to grab lunch?") }
                }
            }
        ],
        "events": [
            {
                "id": "e1",
                "summary": "Standup",
                "description": "Daily sync",
                "location": "Room A",
                "status": "confirmed",
                "start": { "dateTime": "2026-05-20T10:00:00Z" },
                "end":   { "dateTime": "2026-05-20T10:15:00Z" },
                "attendees": [ { "email": "alice@example.com", "displayName": "Alice" } ],
                "hangoutLink": "https://meet.google.com/abc"
            }
        ]
    })
}

fn spawn(fixture: &std::path::Path) -> McpServer {
    let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_magnis-google"));
    cmd.env("GOOGLE_FIXTURE_FILE", fixture);
    McpServer::spawn(cmd).expect("spawn magnis-google")
}

// scn_conn_google_001 — initialize advertises both surfaces (poll); fetch serves
// the canonical flattened email payload + remote_id, the full meeting payload +
// gcal: remote_id, all from the fixture file (no network, no OAuth).
#[tokio::test]
async fn tst_conn_google_001_mcp_server_serves_both_surfaces() {
    let fixture = temp_fixture("fetch");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);

    // initialize → both surfaces, poll.
    let caps = server.initialize().await.unwrap();
    let sync = &caps["experimental"]["magnis"]["sync"];
    assert_eq!(sync["mode"], "poll");
    let surfaces: Vec<&str> = sync["surfaces"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert!(surfaces.contains(&"email") && surfaces.contains(&"meetings"));

    // Email surface: flattened canonical payload.
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "email", "direction": "backward" }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 2);

    let e0 = &envs[0];
    assert_eq!(e0["remote_id"], "m1");
    assert_eq!(e0["surface"], "email");
    let p0 = &e0["payload"];
    // flatten_mail_payload shape (the bytes the emails module ingests).
    assert_eq!(p0["from_name"], "Alice");
    assert_eq!(p0["from_address"], "alice@example.com");
    assert_eq!(p0["to_addresses"], "bob@example.com, carol@example.com");
    assert_eq!(p0["cc_addresses"], "dave@example.com");
    assert_eq!(p0["subject"], "Quarterly review");
    assert_eq!(p0["body_text"], "Hello world");
    assert_eq!(p0["id"], "m1");
    assert_eq!(p0["has_attachments"], false);
    assert_eq!(p0["is_read"], false); // UNREAD label present
                                      // `from` / `to` arrays are flattened away.
    assert!(p0.get("from").is_none());
    assert!(p0.get("to").is_none());

    let e1 = &envs[1];
    assert_eq!(e1["remote_id"], "m2");
    assert_eq!(e1["payload"]["from_address"], "eve@example.com");
    assert_eq!(e1["payload"]["to_addresses"], "me@example.com");

    // No more pages.
    assert_eq!(out["hasMore"], false);

    // Meetings surface: full CalendarEvent payload + gcal: remote_id.
    let out_m = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "meetings", "direction": "backward" }),
        )
        .await
        .unwrap();
    let envs_m = out_m["envelopes"].as_array().unwrap();
    assert_eq!(envs_m.len(), 1);
    let m = &envs_m[0];
    assert_eq!(m["remote_id"], "gcal:e1");
    assert_eq!(m["surface"], "meetings");
    let pm = &m["payload"];
    assert_eq!(pm["id"], "e1");
    assert_eq!(pm["title"], "Standup");
    assert_eq!(pm["description"], "Daily sync");
    assert_eq!(pm["location"], "Room A");
    // chrono's default `DateTime<Utc>` serde form is RFC-3339 with a `Z` suffix
    // (this is exactly what the in-backend CalendarEvent serializes to).
    assert_eq!(pm["starts_at"], "2026-05-20T10:00:00Z");
    assert_eq!(pm["ends_at"], "2026-05-20T10:15:00Z");
    assert_eq!(pm["all_day"], false);
    assert_eq!(pm["status"], "confirmed");
    assert_eq!(pm["conference_link"], "https://meet.google.com/abc");
    assert_eq!(pm["attendees"][0]["email"], "alice@example.com");
    assert_eq!(pm["attendees"][0]["name"], "Alice");

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_google_002 — magnis.execute send_message returns a result (fixture
// mode records/echoes the action, no live send).
#[tokio::test]
async fn tst_conn_google_002_execute_send_message_returns_result() {
    let fixture = temp_fixture("exec");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let out = server
        .call_tool(
            "magnis.execute",
            json!({
                "action": "send_message",
                "draft": {
                    "to": [{ "name": null, "address": "x@y.com" }],
                    "subject": "Hi",
                    "body_text": "hello"
                }
            }),
        )
        .await
        .unwrap();
    assert_eq!(out["action"], "send_message");
    assert_eq!(out["recorded"], true);
    assert!(out["message_id"].is_string());

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_google_003 — an unknown tool is a JSON-RPC error (not a panic).
#[tokio::test]
async fn tst_conn_google_003_unknown_tool_is_rpc_error() {
    let fixture = temp_fixture("unknown");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let err = server
        .call_tool("magnis.nonexistent", json!({}))
        .await
        .unwrap_err();
    assert!(
        matches!(err, magnis_mcp_testkit::McpError::Rpc { .. }),
        "got {err:?}"
    );

    let _ = std::fs::remove_file(&fixture);
}

// tst_conn_google_004 — tools/list advertises the opinionated tools
// (list_emails, get_email, send_email, list_meetings, list_contacts)
// and does NOT leak the internal magnis.sync.fetch / magnis.execute
// dispatchers (those stay callable by the host but invisible to
// Claude via the bridge).
#[tokio::test]
async fn tst_conn_google_004_tools_list_advertises_opinionated_tools() {
    let fixture = temp_fixture("tools-list");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let result = server
        .request("tools/list", json!({}))
        .await
        .expect("tools/list");
    let tools = result["tools"].as_array().expect("tools array");
    let names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().unwrap_or(""))
        .collect();

    for required in [
        "list_emails",
        "get_email",
        "send_email",
        "list_meetings",
        "list_contacts",
    ] {
        assert!(
            names.contains(&required),
            "missing tool '{required}' in {names:?}"
        );
    }
    assert!(
        !names.contains(&"magnis.sync.fetch"),
        "internal dispatcher leaked to tools/list: {names:?}"
    );
    assert!(
        !names.contains(&"magnis.execute"),
        "internal dispatcher leaked to tools/list: {names:?}"
    );

    let _ = std::fs::remove_file(&fixture);
}
