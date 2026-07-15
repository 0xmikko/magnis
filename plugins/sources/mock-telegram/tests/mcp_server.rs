//! Isolated e2e for the mock-telegram connector's MCP server.
//!
//! Spawns THIS crate's binary (`CARGO_BIN_EXE_magnis-mock-telegram`) as a real
//! child and drives it over stdio with the testkit — exactly as the Magnis host
//! would — asserting the MCP server is correct on its own, no backend involved:
//! the `initialize` capabilities, the `magnis.sync.fetch` telegram envelope
//! shapes (chat → snapshot, message → live), cursor advancement, and the HTTP
//! control side-channel (`/inject-chat`, `/inject-message`).

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
        "magnis-mocktelegram-{tag}-{}-{nanos}.jsonl",
        std::process::id()
    ))
}

fn spawn(inject_file: &std::path::Path, port: Option<u16>) -> McpServer {
    let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_magnis-mock-telegram"));
    cmd.env("MOCK_INJECT_FILE", inject_file);
    if let Some(p) = port {
        cmd.env("MOCK_TELEGRAM_PORT", p.to_string());
    }
    McpServer::spawn(cmd).expect("spawn magnis-mock-telegram")
}

// scn_conn_mocktelegram_001 — initialize advertises the telegram surface (poll);
// fetch serves canonical chat (snapshot) + message (live) envelopes from the
// shared file, with the cursor advancing so a second fetch is empty.
#[tokio::test]
async fn tst_conn_mocktelegram_001_mcp_server_serves_telegram_surface() {
    let inject = temp_inject_file("fetch");
    let chat = json!({
        "surface": "telegram",
        "payload": { "entity_type": "telegram_chat", "chat_id": 111, "title": "Project X",
                     "type": "group", "is_pinned": false, "unread_count": 2, "top_message": 42 },
        "remote_id": "tg:chat:111",
        "kind": "snapshot"
    });
    let message = json!({
        "surface": "telegram",
        "payload": { "message_id": 42, "chat_id": 111, "text": "Hello world",
                     "date": "2026-05-20T10:00:00+00:00", "is_outgoing": false,
                     "sender_name": "Alice", "sender_id": 222 },
        "remote_id": "tg:msg:111:42",
        "kind": "live"
    });
    std::fs::write(&inject, format!("{chat}\n{message}\n")).unwrap();

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
    assert!(
        surfaces.contains(&"telegram"),
        "telegram surface advertised"
    );

    // Telegram surface from cursor 0 → chat then message.
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "telegram", "cursor": 0 }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 2);

    // Chat envelope — snapshot (no trigger), telegram_chat payload.
    assert_eq!(envs[0]["payload"]["entity_type"], "telegram_chat");
    assert_eq!(envs[0]["payload"]["chat_id"], 111);
    assert_eq!(envs[0]["payload"]["title"], "Project X");
    assert_eq!(envs[0]["remote_id"], "tg:chat:111");
    assert_eq!(envs[0]["kind"], "snapshot");

    // Message envelope — live (trigger.check fires).
    assert_eq!(envs[1]["payload"]["message_id"], 42);
    assert_eq!(envs[1]["payload"]["text"], "Hello world");
    assert_eq!(envs[1]["payload"]["sender_name"], "Alice");
    assert_eq!(envs[1]["remote_id"], "tg:msg:111:42");
    assert_eq!(envs[1]["kind"], "live");

    assert_eq!(out["nextCursor"], 2);

    // Cursor advancement: fetching from the reported next cursor yields nothing.
    let empty = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "telegram", "cursor": 2 }),
        )
        .await
        .unwrap();
    assert_eq!(empty["envelopes"].as_array().unwrap().len(), 0);

    let _ = std::fs::remove_file(&inject);
}

// scn_conn_mocktelegram_002 — the HTTP control side-channel injects a chat then a
// message that the MCP fetch returns with the right kinds, remote_ids, and the
// auto-assigned message_id (the `curl /inject-chat` + `/inject-message` demo path).
#[tokio::test]
async fn tst_conn_mocktelegram_002_http_injection_then_fetch() {
    let inject = temp_inject_file("http");
    // A free port for this connector's control server.
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let server = spawn(&inject, Some(port));
    server.initialize().await.unwrap();

    // Wait for the control server to bind.
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
    assert!(ready, "control server did not come up on :{port}");

    // Inject a chat.
    let resp = client
        .post(format!("{base}/inject-chat"))
        .json(&json!({ "chat_id": 777, "title": "Acme Team", "type": "group", "member_count": 3 }))
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());

    // Inject a message (message_id auto-assigned → second item → id 2).
    let resp = client
        .post(format!("{base}/inject-message"))
        .json(&json!({ "chat_id": 777, "text": "ship it", "sender_name": "Bob", "sender_id": 99 }))
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());

    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "telegram", "cursor": 0 }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 2);

    // Chat — snapshot, member_count carried through.
    assert_eq!(envs[0]["payload"]["entity_type"], "telegram_chat");
    assert_eq!(envs[0]["payload"]["chat_id"], 777);
    assert_eq!(envs[0]["payload"]["title"], "Acme Team");
    assert_eq!(envs[0]["payload"]["type"], "group");
    assert_eq!(envs[0]["payload"]["member_count"], 3);
    assert_eq!(envs[0]["remote_id"], "tg:chat:777");
    assert_eq!(envs[0]["kind"], "snapshot");

    // Message — live, auto message_id 2, remote_id derived from chat+id.
    assert_eq!(envs[1]["payload"]["chat_id"], 777);
    assert_eq!(envs[1]["payload"]["text"], "ship it");
    assert_eq!(envs[1]["payload"]["sender_name"], "Bob");
    assert_eq!(envs[1]["payload"]["sender_id"], 99);
    assert_eq!(envs[1]["payload"]["is_outgoing"], false);
    assert_eq!(envs[1]["remote_id"], "tg:msg:777:2");
    assert_eq!(envs[1]["kind"], "live");

    let _ = std::fs::remove_file(&inject);
}

// scn_conn_mocktelegram_003 — control-surface edge cases: a missing chat_id is
// rejected (queued:false) on both inject endpoints; /status reports the chat vs
// message split; an unknown MCP tool surfaces a JSON-RPC error.
#[tokio::test]
async fn tst_conn_mocktelegram_003_edge_cases() {
    let inject = temp_inject_file("edge");
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let server = spawn(&inject, Some(port));
    server.initialize().await.unwrap();

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
    assert!(ready, "control server did not come up on :{port}");

    // Missing chat_id → rejected, not queued (both endpoints).
    let body: Value = client
        .post(format!("{base}/inject-chat"))
        .json(&json!({ "title": "no id" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        body["queued"], false,
        "inject-chat without chat_id is rejected"
    );

    let body: Value = client
        .post(format!("{base}/inject-message"))
        .json(&json!({ "text": "no id" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        body["queued"], false,
        "inject-message without chat_id is rejected"
    );

    // A valid chat + message → /status splits chats vs messages.
    client
        .post(format!("{base}/inject-chat"))
        .json(&json!({ "chat_id": 1, "title": "C" }))
        .send()
        .await
        .unwrap();
    client
        .post(format!("{base}/inject-message"))
        .json(&json!({ "chat_id": 1, "text": "m" }))
        .send()
        .await
        .unwrap();

    let status: Value = client
        .get(format!("{base}/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["chats"], 1, "one chat (snapshot)");
    assert_eq!(status["messages"], 1, "one message (live)");
    assert_eq!(status["total"], 2);

    // Unknown MCP tool → JSON-RPC error.
    assert!(
        server.call_tool("no.such.tool", json!({})).await.is_err(),
        "an unknown tool must surface a JSON-RPC error"
    );

    let _ = std::fs::remove_file(&inject);
}
