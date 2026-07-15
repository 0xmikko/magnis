//! Isolated e2e for the telegram connector's MCP server (FIXTURE mode).
//!
//! Spawns THIS crate's binary (`CARGO_BIN_EXE_magnis-telegram`) as a real child
//! and drives it over stdio with the testkit — exactly as the Magnis host would
//! — with `TELEGRAM_FIXTURE_FILE` pointing at a seeded fixture so there is NO
//! live Telegram call. Asserts the `initialize` capabilities (telegram / push),
//! the canonical message + chat payloads with `tg:msg:` / `tg:chat:` `remote_id`s
//! and the `{chat_id,message_id}` cursor, the `magnis.sync.listen` push delivery,
//! and that `magnis.execute send_message` returns a result.

use std::time::Duration;

use magnis_mcp_testkit::McpServer;
use serde_json::{json, Value};

/// A unique temp path for this test's fixture file.
fn temp_fixture(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "magnis-telegram-{tag}-{}-{nanos}.json",
        std::process::id()
    ))
}

/// Seed one chat + two snapshot messages + one live message.
fn seed_fixture() -> Value {
    json!({
        "chats": [
            {
                "chat_id": 111,
                "title": "Project X",
                "type": "group",
                "is_pinned": true,
                "pin_order": 0,
                "unread_count": 2,
                "unread_mark": false,
                "read_inbox_max_id": 40,
                "read_outbox_max_id": 39,
                "unread_mentions_count": 0,
                "top_message": 42,
                "member_count": 5,
                "username": "projectx"
            }
        ],
        "messages": [
            {
                "message_id": 41,
                "chat_id": 111,
                "text": "Hello world",
                "date": "2026-05-20T10:00:00+00:00",
                "is_outgoing": false,
                "chat_title": "Project X",
                "sender_name": "Alice",
                "sender_id": 222,
                "sender_info": {
                    "first_name": "Alice",
                    "last_name": "Smith",
                    "username": "alice"
                }
            },
            {
                "message_id": 42,
                "chat_id": 111,
                "text": "",
                "date": "2026-05-20T10:01:00+00:00",
                "is_outgoing": false,
                "reply_to_msg_id": 41,
                "media_type": "photo",
                "is_pinned": true,
                "account_id": "acct-1"
            },
            {
                "message_id": 99,
                "chat_id": 111,
                "text": "live ping",
                "date": "2026-05-20T10:05:00+00:00",
                "is_outgoing": false,
                "sender_name": "Bob",
                "live": true
            }
        ]
    })
}

fn spawn(fixture: &std::path::Path) -> McpServer {
    let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_magnis-telegram"));
    cmd.env("TELEGRAM_FIXTURE_FILE", fixture);
    McpServer::spawn(cmd).expect("spawn magnis-telegram")
}

// scn_conn_telegram_001 — initialize advertises the telegram surface in push
// mode; fetch serves the canonical chat envelope + tg:chat: remote_id and the
// message envelopes + tg:msg: remote_id + {chat_id,message_id} cursor, all from
// the fixture (no MTProto). The `live`-flagged message is NOT served by fetch.
#[tokio::test]
async fn tst_conn_telegram_001_mcp_server_serves_telegram_surface() {
    let fixture = temp_fixture("fetch");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);

    // initialize → telegram surface, push.
    let caps = server.initialize().await.unwrap();
    let sync = &caps["experimental"]["magnis"]["sync"];
    assert_eq!(sync["mode"], "push");
    let surfaces: Vec<&str> = sync["surfaces"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert_eq!(surfaces, vec!["telegram"]);

    // fetch (backward / bootstrap).
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "telegram", "direction": "backward" }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    // chat + 2 snapshot messages (live message excluded).
    assert_eq!(envs.len(), 3);

    // First envelope: the chat snapshot.
    let chat = &envs[0];
    assert_eq!(chat["surface"], "telegram");
    assert_eq!(chat["remote_id"], "tg:chat:111");
    assert_eq!(chat["kind"], "snapshot");
    let cp = &chat["payload"];
    assert_eq!(cp["entity_type"], "telegram_chat");
    assert_eq!(cp["chat_id"], 111);
    assert_eq!(cp["title"], "Project X");
    assert_eq!(cp["type"], "group");
    assert_eq!(cp["is_pinned"], true);
    assert_eq!(cp["unread_count"], 2);
    assert_eq!(cp["top_message"], 42);
    assert_eq!(cp["member_count"], 5);
    assert_eq!(cp["username"], "projectx");

    // Second envelope: plain text message.
    let m1 = &envs[1];
    assert_eq!(m1["surface"], "telegram");
    assert_eq!(m1["remote_id"], "tg:msg:111:41");
    assert_eq!(m1["kind"], "snapshot");
    assert_eq!(m1["cursor"], json!({ "chat_id": 111, "message_id": 41 }));
    let p1 = &m1["payload"];
    assert_eq!(p1["message_id"], 41);
    assert_eq!(p1["chat_id"], 111);
    assert_eq!(p1["text"], "Hello world");
    assert_eq!(p1["date"], "2026-05-20T10:00:00+00:00");
    assert_eq!(p1["is_outgoing"], false);
    assert_eq!(p1["chat_title"], "Project X");
    assert_eq!(p1["sender_name"], "Alice");
    assert_eq!(p1["sender_id"], 222);
    assert_eq!(p1["sender_info"]["first_name"], "Alice");
    assert_eq!(p1["sender_info"]["last_name"], "Smith");
    assert_eq!(p1["sender_info"]["username"], "alice");
    assert!(p1.get("media_type").is_none());
    assert!(p1.get("source_ref").is_none());

    // Third envelope: media message → media_type + source_ref + derived file_name.
    let m2 = &envs[2];
    assert_eq!(m2["remote_id"], "tg:msg:111:42");
    let p2 = &m2["payload"];
    assert_eq!(p2["media_type"], "photo");
    assert_eq!(p2["reply_to_msg_id"], 41);
    assert_eq!(p2["is_pinned"], true);
    let sr = &p2["source_ref"];
    assert_eq!(sr["account_id"], "acct-1");
    assert_eq!(sr["chat_id"], 111);
    assert_eq!(sr["message_id"], 42);
    assert_eq!(sr["media_type"], "photo");
    assert_eq!(sr["dest_subpath"], "telegram/photos/tg_111_42.jpg");
    assert_eq!(p2["file_name"], "photo_111_42.jpg");

    // Cursor watermark + no more pages.
    assert_eq!(out["nextCursor"]["chats"]["111"]["last_msg_id"], 42);
    assert_eq!(out["hasMore"], false);

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_002 — magnis.sync.listen acks {ok:true} then republishes the
// fixture's `live` message as a notifications/magnis/envelope push with
// {payload, remote_id} (the host's parse_push_params shape).
#[tokio::test]
async fn tst_conn_telegram_002_listen_pushes_live_envelope() {
    let fixture = temp_fixture("listen");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    // Subscribe BEFORE the call so no early notification is missed.
    let mut sub = server.subscribe();

    let ack = server
        .call_tool(
            "magnis.sync.listen",
            json!({ "_meta": { "account_id": "tg:test-002" } }),
        )
        .await
        .unwrap();
    assert_eq!(ack["ok"], true);

    // The single live message arrives as a push notification.
    let notif = tokio::time::timeout(Duration::from_secs(5), sub.recv())
        .await
        .expect("listen push within timeout")
        .expect("notification");
    assert_eq!(notif.method, "notifications/magnis/envelope");
    assert_eq!(notif.params["remote_id"], "tg:msg:111:99");
    assert_eq!(notif.params["payload"]["message_id"], 99);
    assert_eq!(notif.params["payload"]["text"], "live ping");
    assert_eq!(notif.params["payload"]["sender_name"], "Bob");

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_003 — magnis.execute send_message returns a result (fixture
// mode records/echoes the action, no live send).
#[tokio::test]
async fn tst_conn_telegram_003_execute_send_message_returns_result() {
    let fixture = temp_fixture("exec");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let out = server
        .call_tool(
            "magnis.execute",
            json!({ "action": "send_message", "chat_id": 111, "text": "hi there" }),
        )
        .await
        .unwrap();
    assert_eq!(out["action"], "send_message");
    assert_eq!(out["recorded"], true);
    assert_eq!(out["chat_id"], 111);
    assert_eq!(out["text"], "hi there");
    assert_eq!(out["schema_id"], "telegram.message");
    assert!(out["message_id"].is_i64());

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_005 — listen_start/listen_stop lifecycle. Start one
// subscription, receive the fixture's live push (now stamped with the
// stable subscription_id + account_id from _meta), then stop. The reply
// to listen_stop carries cancelled=true.
#[tokio::test]
async fn tst_conn_telegram_005_listen_start_stop_lifecycle() {
    let fixture = temp_fixture("listen-lifecycle");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let mut sub = server.subscribe();

    let ack = server
        .call_tool(
            "listen_start",
            json!({
                "subscription_id": "sub:test",
                "_meta": { "account_id": "tg:acct-test" }
            }),
        )
        .await
        .unwrap();
    assert_eq!(ack["ok"], true);
    assert_eq!(ack["subscription_id"], "sub:test");

    let notif = tokio::time::timeout(Duration::from_secs(5), sub.recv())
        .await
        .expect("listen push within timeout")
        .expect("notification");
    assert_eq!(notif.method, "notifications/magnis/envelope");
    // New params shape (Stage 1): subscription_id + account_id stamped.
    assert_eq!(notif.params["subscription_id"], "sub:test");
    assert_eq!(notif.params["account_id"], "tg:acct-test");
    // Existing shape preserved for back-compat:
    assert_eq!(notif.params["remote_id"], "tg:msg:111:99");
    assert_eq!(notif.params["payload"]["message_id"], 99);

    let stop = server
        .call_tool("listen_stop", json!({ "subscription_id": "sub:test" }))
        .await
        .unwrap();
    assert_eq!(stop["ok"], true);
    assert_eq!(stop["cancelled"], true);

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_006 — listen_start is idempotent: calling twice with
// the same subscription_id returns ok without spawning a duplicate (no
// second push). Tests INV-SUB-1.
#[tokio::test]
async fn tst_conn_telegram_006_listen_start_idempotent_by_subscription_id() {
    let fixture = temp_fixture("listen-idem");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let mut sub = server.subscribe();

    server
        .call_tool(
            "listen_start",
            json!({ "subscription_id": "sub:once", "_meta": { "account_id": "tg:A" } }),
        )
        .await
        .unwrap();
    let _first_notif = tokio::time::timeout(Duration::from_secs(5), sub.recv())
        .await
        .expect("first push")
        .expect("notification");

    // Re-call with same subscription_id — must be ok, must NOT spawn a
    // second listener (which would re-emit the fixture pushes).
    let ack2 = server
        .call_tool(
            "listen_start",
            json!({ "subscription_id": "sub:once", "_meta": { "account_id": "tg:A" } }),
        )
        .await
        .unwrap();
    assert_eq!(ack2["ok"], true);
    assert_eq!(ack2["subscription_id"], "sub:once");

    // No second push within a short window — single-listener guarantee.
    let second = tokio::time::timeout(Duration::from_millis(300), sub.recv()).await;
    assert!(
        second.is_err(),
        "duplicate listen_start must not emit additional notifications, got: {second:?}"
    );

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_007 — listen_stop on an unknown subscription_id
// returns cancelled=false (not an error). Tests INV-SUB-3 (other
// subscriptions unaffected).
#[tokio::test]
async fn tst_conn_telegram_007_listen_stop_unknown_returns_not_cancelled() {
    let fixture = temp_fixture("listen-stop-unknown");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = spawn(&fixture);
    server.initialize().await.unwrap();

    let stop = server
        .call_tool(
            "listen_stop",
            json!({ "subscription_id": "sub:never-started" }),
        )
        .await
        .unwrap();
    assert_eq!(stop["ok"], true);
    assert_eq!(stop["cancelled"], false);

    let _ = std::fs::remove_file(&fixture);
}

// tst_src_tg_030 (INV-1) — while a slow `tools/call` is in flight, a
// subsequently-issued fast `tools/call` is read, dispatched, and replied to
// BEFORE the slow one completes. RED on the inline-await read loop (the fast
// call cannot even be READ until the slow handler returns), GREEN after the
// whole tools/call arm is spawned.
#[tokio::test]
async fn tst_src_tg_030_fast_call_not_starved_by_slow_call() {
    let fixture = temp_fixture("concurrency");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = std::sync::Arc::new(spawn(&fixture));
    server.initialize().await.unwrap();

    let start = std::time::Instant::now();

    // Slow call: a real 1500ms in-flight handler.
    let slow_server = server.clone();
    let slow = tokio::spawn(async move {
        slow_server
            .call_tool(
                "magnis.test.sleep",
                json!({ "sleep_ms": 1500, "marker": "slow" }),
            )
            .await
            .unwrap();
        std::time::Instant::now()
    });

    // Give the slow call a head start so it is genuinely in flight, then fire a
    // fast call that should NOT wait behind it.
    tokio::time::sleep(Duration::from_millis(100)).await;
    let fast_server = server.clone();
    let fast = tokio::spawn(async move {
        fast_server
            .call_tool(
                "magnis.test.sleep",
                json!({ "sleep_ms": 0, "marker": "fast" }),
            )
            .await
            .unwrap();
        std::time::Instant::now()
    });

    let fast_done = fast.await.unwrap();
    let slow_done = slow.await.unwrap();

    let fast_elapsed = fast_done.duration_since(start);
    assert!(
        fast_done < slow_done,
        "fast reply must arrive before the slow one (fast={:?}, slow={:?} from start)",
        fast_elapsed,
        slow_done.duration_since(start)
    );
    assert!(
        fast_elapsed < Duration::from_millis(1000),
        "fast reply must not be starved behind the 1500ms slow call, took {fast_elapsed:?}"
    );

    let _ = std::fs::remove_file(&fixture);
}

// tst_src_tg_031 (INV-2/CON-3) — concurrent in-flight `tools/call` dispatches are
// BOUNDED by the semaphore (MAX_INFLIGHT_TOOL_CALLS = 8). The bound forces the
// batch to run in ceil(N / bound) sequential "waves", so issuing well more than
// the bound makes the wall time observably longer than a single wave — which is
// the ONLY behaviour that proves the bound exists.
//
// We fire N = 24 calls of D = 200ms each:
//   • bounded at 8 → ceil(24/8) = 3 waves → ~600ms,
//   • UNBOUNDED    → 1 wave            → ~200ms,
//   • serialized   → 24 waves          → ~4800ms.
// Asserting `elapsed >= 450ms` FAILS if the semaphore is removed (unbounded
// ~200ms < 450ms) — so this test actually guards the bound, not just "concurrency
// happened". Asserting `elapsed < 2000ms` proves it is NOT serialized. All
// complete.
#[tokio::test]
async fn tst_src_tg_031_semaphore_bounds_concurrency() {
    let fixture = temp_fixture("sem-bound");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = std::sync::Arc::new(spawn(&fixture));
    server.initialize().await.unwrap();

    const N: usize = 24;
    const D_MS: u64 = 200;

    let start = std::time::Instant::now();
    let mut handles = Vec::new();
    for i in 0..N {
        let s = server.clone();
        handles.push(tokio::spawn(async move {
            s.call_tool(
                "magnis.test.sleep",
                json!({ "sleep_ms": D_MS, "marker": i }),
            )
            .await
            .unwrap()
        }));
    }
    let mut completed = 0;
    for h in handles {
        let out = h.await.unwrap();
        assert_eq!(out["slept_ms"], D_MS);
        completed += 1;
    }
    let elapsed = start.elapsed();
    assert_eq!(completed, N, "all calls must complete");
    // Lower bound: with the bound of 8, 24×200ms runs in 3 waves (~600ms). If the
    // semaphore were removed all 24 would run in one ~200ms wave — RED here.
    assert!(
        elapsed >= Duration::from_millis(450),
        "{N} calls of {D_MS}ms must be bounded into ≥2 waves (bound=8 → ~600ms); \
         got {elapsed:?} — the semaphore is not bounding concurrency"
    );
    // Upper bound: not serialized (24×200ms = 4800ms).
    assert!(
        elapsed < Duration::from_millis(2000),
        "bounded dispatch must beat full serialization (24×200ms=4.8s), took {elapsed:?}"
    );

    let _ = std::fs::remove_file(&fixture);
}

// tst_src_tg_032 (INV-9) — two concurrent `listen_start` for the SAME
// subscription_id result in exactly ONE live subscription (no double-spawn under
// concurrency). The fixture listener re-emits the fixture's live pushes, so a
// double-spawn would surface as a SECOND notification for the same message.
#[tokio::test]
async fn tst_src_tg_032_concurrent_listen_start_idempotent() {
    let fixture = temp_fixture("concurrent-listen");
    std::fs::write(&fixture, serde_json::to_string(&seed_fixture()).unwrap()).unwrap();

    let server = std::sync::Arc::new(spawn(&fixture));
    server.initialize().await.unwrap();

    let mut sub = server.subscribe();

    // Fire two listen_start for the same id concurrently. `test_build_delay_ms`
    // widens the claim→insert window so the race is exercised deterministically:
    // without the atomic claim both starts pass the "present?" check and spawn a
    // second (orphaned) listener → a duplicate push.
    let s1 = server.clone();
    let s2 = server.clone();
    let call = json!({
        "subscription_id": "sub:race",
        "_meta": { "account_id": "tg:race", "test_build_delay_ms": 200 }
    });
    let c1 = call.clone();
    let c2 = call.clone();
    let h1 = tokio::spawn(async move { s1.call_tool("listen_start", c1).await.unwrap() });
    let h2 = tokio::spawn(async move { s2.call_tool("listen_start", c2).await.unwrap() });
    let a1 = h1.await.unwrap();
    let a2 = h2.await.unwrap();
    assert_eq!(a1["ok"], true);
    assert_eq!(a2["ok"], true);

    // Exactly ONE push for the single live message — drain and count within a
    // short window. A double-spawn emits two.
    let mut pushes = 0;
    loop {
        match tokio::time::timeout(Duration::from_millis(500), sub.recv()).await {
            Ok(Ok(n)) if n.method == "notifications/magnis/envelope" => pushes += 1,
            Ok(Ok(_)) => continue,
            _ => break,
        }
    }
    assert_eq!(
        pushes, 1,
        "concurrent listen_start for the same id must spawn exactly one listener (got {pushes} pushes)"
    );

    let _ = std::fs::remove_file(&fixture);
}

// scn_conn_telegram_004 — an unknown tool is a JSON-RPC error (not a panic).
#[tokio::test]
async fn tst_conn_telegram_004_unknown_tool_is_rpc_error() {
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
