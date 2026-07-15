//! Isolated e2e for the local connector's MCP server.
//!
//! Spawns `CARGO_BIN_EXE_magnis-local` against a temp notes dir and drives it
//! over stdio with the testkit, asserting the MCP server is correct on its own:
//! capabilities, the canonical note envelope shape, and incremental (catch-up)
//! filtering by mtime cursor.

use magnis_mcp_testkit::McpServer;
use serde_json::json;

fn temp_notes_dir(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir =
        std::env::temp_dir().join(format!("magnis-local-{tag}-{}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn spawn(notes_dir: &std::path::Path) -> McpServer {
    let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_magnis-local"));
    cmd.env("NOTES_DIR", notes_dir);
    McpServer::spawn(cmd).expect("spawn magnis-local")
}

// scn_conn_local_001 — initialize advertises the notes surface (poll); a
// backward fetch returns every *.md as a canonical note envelope; a forward
// fetch past the newest cursor returns nothing (incremental).
#[tokio::test]
async fn tst_conn_local_001_serves_notes_surface_and_incremental() {
    let dir = temp_notes_dir("fetch");
    std::fs::write(dir.join("a.md"), "# Alpha\nbody a").unwrap();
    std::fs::write(dir.join("b.md"), "# Bravo\nbody b").unwrap();
    // A non-md file is ignored.
    std::fs::write(dir.join("ignore.txt"), "nope").unwrap();

    let server = spawn(&dir);
    let caps = server.initialize().await.unwrap();
    let sync = &caps["experimental"]["magnis"]["sync"];
    assert_eq!(sync["mode"], "poll");
    assert_eq!(sync["surfaces"][0], "notes");

    // Bootstrap (backward): all notes.
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "notes", "direction": "backward" }),
        )
        .await
        .unwrap();
    let envs = out["envelopes"].as_array().unwrap();
    assert_eq!(envs.len(), 2, "two .md files, .txt ignored");
    let paths: Vec<&str> = envs
        .iter()
        .filter_map(|e| e["payload"]["path"].as_str())
        .collect();
    assert!(paths.contains(&"a.md") && paths.contains(&"b.md"));
    // Canonical payload fields + remote_id.
    let a = envs
        .iter()
        .find(|e| e["payload"]["path"] == "a.md")
        .unwrap();
    assert_eq!(a["payload"]["filename"], "a.md");
    assert!(a["payload"]["body"].as_str().unwrap().contains("body a"));
    assert!(a["payload"]["content_hash"].is_string());
    assert_eq!(a["remote_id"], "a.md");
    assert!(out["nextCursor"]["last_mtime"].is_i64());

    // Catch-up (forward) past the newest mtime → nothing new.
    let newest = out["nextCursor"]["last_mtime"].as_i64().unwrap();
    let out2 = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "notes", "direction": "forward", "cursor": { "last_mtime": newest } }),
        )
        .await
        .unwrap();
    assert_eq!(out2["envelopes"].as_array().unwrap().len(), 0);

    let _ = std::fs::remove_dir_all(&dir);
}

// scn_conn_local_002 — an empty notes dir yields zero envelopes and a null cursor.
#[tokio::test]
async fn tst_conn_local_002_empty_dir_is_empty() {
    let dir = temp_notes_dir("empty");
    let server = spawn(&dir);
    server.initialize().await.unwrap();
    let out = server
        .call_tool(
            "magnis.sync.fetch",
            json!({ "surface": "notes", "direction": "backward" }),
        )
        .await
        .unwrap();
    assert_eq!(out["envelopes"].as_array().unwrap().len(), 0);
    assert!(out["nextCursor"].is_null());
    let _ = std::fs::remove_dir_all(&dir);
}
