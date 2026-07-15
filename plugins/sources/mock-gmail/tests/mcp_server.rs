//! Isolated e2e for the mock-gmail connector's MCP server.
//!
//! Spawns THIS crate's binary (`CARGO_BIN_EXE_magnis-mock-gmail`) as a real
//! child and drives it over stdio with the testkit — exactly as the Magnis host
//! would — asserting the MCP server is correct on its own, no backend involved:
//! the `initialize` capabilities, the `magnis.sync.fetch` envelope shapes per
//! surface, cursor advancement, and the HTTP injection side-channel.

use std::time::Duration;

use magnis_mcp_testkit::McpServer;
use serde_json::{json, Value};

/// A unique temp path for this test's shared inject file.
fn temp_inject_file(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "magnis-mockgmail-{tag}-{}-{nanos}.jsonl",
        std::process::id()
    ))
}

fn spawn(inject_file: &std::path::Path, port: Option<u16>) -> McpServer {
    let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_magnis-mock-gmail"));
    cmd.env("MOCK_INJECT_FILE", inject_file);
    if let Some(p) = port {
        cmd.env("MOCK_EMAIL_PORT", p.to_string());
    }
    McpServer::spawn(cmd).expect("spawn magnis-mock-gmail")
}

// scn_conn_mockgmail_001 — initialize advertises both surfaces (poll); fetch
// serves canonical email + meeting envelopes from the shared file, marked Live,
// with the cursor advancing so a second fetch is empty.
#[tokio::test]
async fn tst_conn_mockgmail_001_mcp_server_serves_both_surfaces() {
    let inject = temp_inject_file("fetch");
    let email = json!({
        "surface": "email",
        "payload": { "message_id": "m1", "from_address": "a@x", "subject": "Hi", "body_text": "hello" },
        "remote_id": "m1"
    });
    let meeting = json!({
        "surface": "meetings",
        "payload": { "id": "e1", "title": "Standup", "starts_at": "2026-05-20T10:00:00Z",
                     "ends_at": "2026-05-20T10:15:00Z", "attendees": [{ "email": "a@x" }] },
        "remote_id": "gcal:e1"
    });
    std::fs::write(&inject, format!("{email}\n{meeting}\n")).unwrap();

    let server = spawn(&inject, None);
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

    // Email surface from cursor 0.
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "email", "cursor": 0 }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 1);
    assert_eq!(envs[0]["payload"]["message_id"], "m1");
    assert_eq!(envs[0]["remote_id"], "m1");
    assert_eq!(envs[0]["kind"], "live"); // fresh arrival → trigger.check fires
    assert_eq!(out["nextCursor"], 1);

    // Meetings surface.
    let out_m = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "meetings", "cursor": 0 }),
        )
        .await
        .unwrap();
    let envs_m = out_m["envelopes"].as_array().unwrap();
    assert_eq!(envs_m.len(), 1);
    assert_eq!(envs_m[0]["payload"]["title"], "Standup");
    assert_eq!(envs_m[0]["remote_id"], "gcal:e1");

    // Cursor advancement: fetching from the reported next cursor yields nothing.
    let empty = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "email", "cursor": 1 }),
        )
        .await
        .unwrap();
    assert_eq!(empty["envelopes"].as_array().unwrap().len(), 0);

    let _ = std::fs::remove_file(&inject);
}

// scn_conn_mockgmail_002 — the HTTP injection side-channel appends a canonical
// email that the MCP fetch then returns (the `curl /inject` demo path).
#[tokio::test]
async fn tst_conn_mockgmail_002_http_injection_then_fetch() {
    let inject = temp_inject_file("http");
    // A free port for this connector's injection server.
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let server = spawn(&inject, Some(port));
    server.initialize().await.unwrap();

    // Wait for the injection server to bind.
    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    let mut ready = false;
    for _ in 0..50 {
        if client.get(format!("{base}/health")).send().await.is_ok() {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(ready, "injection server did not come up on :{port}");

    let resp = client
        .post(format!("{base}/inject"))
        .json(&json!({ "from_address": "b@x", "subject": "Injected", "body_text": "via http" }))
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());

    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "email", "cursor": 0 }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 1);
    assert_eq!(envs[0]["payload"]["subject"], "Injected");
    assert_eq!(envs[0]["payload"]["from_address"], "b@x");
    // message_id auto-generated → remote_id present, has_attachments=false.
    assert_eq!(envs[0]["payload"]["has_attachments"], false);

    let _ = std::fs::remove_file(&inject);
}
