//! Live-mode command handlers (best-effort port of the in-backend
//! `commands.rs` / `runtime.rs`). Only reached when NO `TELEGRAM_FIXTURE_FILE`
//! is set; the host-side ingest test exercises the fixture path instead.
//!
//! These drive a connected [`TgClient`] to produce the SAME canonical envelopes
//! fixture mode does (via `envelope::*` builders fed the `message_to_intermediate`
//! / `chat_to_intermediate` conversions).

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::client::{
    build_dialog_meta, chat_to_intermediate, message_to_intermediate, DialogOffset, DialogPager,
    LiveDialogPager, TgClient,
};
use crate::envelope::{chat_envelope, message_envelope};

/// Default page sizes, mirroring the in-backend bootstrap/catch-up constants.
/// One bootstrap batch enumerates up to `BOOTSTRAP_BATCH_DIALOGS` dialogs, then
/// checkpoints the offset and yields `hasMore=true` so the host can resume.
const BOOTSTRAP_BATCH_DIALOGS: usize = 50;
const CATCHUP_MESSAGES_PER_CHAT: usize = 20;

/// Live `magnis.sync.fetch`. `direction = "backward"` → Bootstrap (newest
/// dialogs + recent messages); `direction = "forward"` → CatchUp (messages newer
/// than the per-chat cursor). Returns the Sync-Profile `{ envelopes, nextCursor,
/// hasMore }` shape.
pub async fn fetch(
    client: &TgClient,
    account_id: &str,
    direction: &str,
    cursor: Option<&Value>,
) -> anyhow::Result<Value> {
    if direction == "forward" {
        fetch_catchup(client, account_id, cursor).await
    } else {
        fetch_bootstrap(client, account_id, cursor).await
    }
}

async fn fetch_bootstrap(
    client: &TgClient,
    account_id: &str,
    cursor: Option<&Value>,
) -> anyhow::Result<Value> {
    let pager = LiveDialogPager { client, account_id };
    run_bootstrap(cursor, &pager).await
}

/// Pure offset-resumed bootstrap loop (DEC-1/8). Reads the dialog-offset + the
/// per-chat `last_msg_id` watermark from `cursor`, fetches ONE page from `pager`,
/// emits chat+message envelopes, assigns pinned ordering, and persists the
/// advanced offset. `hasMore` is true iff the dialog walk has more pages — the
/// host loops until false, then transitions Bootstrap → CatchUp.
///
/// This replaces the old O(N²) loop that re-created `iter_dialogs()` from the top
/// every batch and skipped `already_seen` — which re-fetched 50·(K-1) dialogs on
/// batch K, flood-waited Telegram, and stalled bootstrap before the tail.
async fn run_bootstrap(cursor: Option<&Value>, pager: &impl DialogPager) -> anyhow::Result<Value> {
    // Per-chat watermark carried forward (consumed by CatchUp). An OLD cursor has
    // `chats` but no `dialog_offset`; we then resume from the top — the already
    // recorded chats are re-emitted (idempotent in the graph), never lost (DEC-6).
    let mut cursor_chats: serde_json::Map<String, Value> = cursor
        .and_then(|c| c.get("chats"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut pinned_order = cursor
        .and_then(|c| c.get("pinned_count"))
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let start_offset: Option<DialogOffset> = cursor
        .and_then(|c| c.get("dialog_offset"))
        .filter(|v| !v.is_null())
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let page = pager
        .dialog_page(start_offset.as_ref(), BOOTSTRAP_BATCH_DIALOGS)
        .await?;

    let mut envelopes = Vec::new();
    for mut paged in page.dialogs {
        // The loop owns pinned ordering so it stays monotonic across batch
        // boundaries (the pager leaves `pin_order` as a 0 placeholder).
        if paged.chat.is_pinned {
            paged.chat.pin_order = pinned_order;
            pinned_order += 1;
        } else {
            paged.chat.pin_order = 0;
        }
        let chat_id = paged.chat.chat_id;
        envelopes.push(chat_envelope(&paged.chat));

        let mut highest: i64 = 0;
        for m in &paged.messages {
            highest = highest.max(m.message_id);
            envelopes.push(message_envelope(m, "snapshot"));
        }
        // Record EVERY enumerated chat (incl. 0-message → last_msg_id 0) so
        // CatchUp later fills it; with offset paging it is enumerated once.
        cursor_chats.insert(chat_id.to_string(), json!({ "last_msg_id": highest }));
    }

    let has_more = page.next_offset.is_some();
    // Progress (DEC-5): `total` is the server-side dialog count (passthrough);
    // `discovered` is the cumulative count of enumerated dialogs = size of the
    // cursor `chats` map after this batch's inserts.
    let total = page.total;
    let discovered = cursor_chats.len() as i64;
    let next_cursor = if cursor_chats.is_empty() && page.next_offset.is_none() {
        Value::Null
    } else {
        json!({
            "date": chrono::Utc::now().to_rfc3339(),
            "chats": Value::Object(cursor_chats),
            "pinned_count": pinned_order,
            "dialog_offset": match &page.next_offset {
                Some(o) => serde_json::to_value(o)?,
                None => Value::Null,
            },
        })
    };

    Ok(json!({
        "envelopes": envelopes,
        "nextCursor": next_cursor,
        "hasMore": has_more,
        "total": total,
        "discovered": discovered,
    }))
}

async fn fetch_catchup(
    client: &TgClient,
    account_id: &str,
    cursor: Option<&Value>,
) -> anyhow::Result<Value> {
    let cursor_chats: HashMap<String, i64> = cursor
        .and_then(|c| c.get("chats"))
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.get("last_msg_id")?.as_i64()?)))
                .collect()
        })
        .unwrap_or_default();

    let mut envelopes = Vec::new();
    let mut new_cursor_chats: serde_json::Map<String, Value> = serde_json::Map::new();
    let grammers = &client.client;
    let mut dialogs = grammers.iter_dialogs();
    let mut pinned_order = 0usize;

    while let Some(dialog) = dialogs.next().await? {
        let chat = dialog.chat();
        let chat_id = chat.id();
        client.peer_cache.lock().await.insert(chat_id, chat.pack());

        let is_pinned = dialog.raw.pinned();
        let pin_order = if is_pinned {
            let o = pinned_order;
            pinned_order += 1;
            o
        } else {
            0
        };
        let meta = build_dialog_meta(&dialog.raw, is_pinned, pin_order);
        envelopes.push(chat_envelope(&chat_to_intermediate(chat, &meta)));

        let offset_id = cursor_chats.get(&chat_id.to_string()).copied().unwrap_or(0);
        if offset_id > 0 && meta.top_message as i64 <= offset_id {
            new_cursor_chats.insert(chat_id.to_string(), json!({ "last_msg_id": offset_id }));
            continue;
        }

        let mut highest: Option<i64> = None;
        let mut msg_iter = grammers
            .iter_messages(chat.pack())
            .limit(CATCHUP_MESSAGES_PER_CHAT);
        while let Some(msg) = msg_iter.next().await? {
            let msg_id = msg.id() as i64;
            if offset_id > 0 && msg_id <= offset_id {
                break;
            }
            highest = Some(highest.map_or(msg_id, |h| h.max(msg_id)));
            envelopes.push(message_envelope(
                &message_to_intermediate(&msg, account_id, chat_id),
                "snapshot",
            ));
        }
        let new_last = highest.unwrap_or(offset_id).max(offset_id);
        if new_last > 0 {
            new_cursor_chats.insert(chat_id.to_string(), json!({ "last_msg_id": new_last }));
        }
    }

    let next_cursor = if new_cursor_chats.is_empty() {
        Value::Null
    } else {
        json!({
            "date": chrono::Utc::now().to_rfc3339(),
            "chats": Value::Object(new_cursor_chats),
        })
    };

    Ok(json!({
        "envelopes": envelopes,
        "nextCursor": next_cursor,
        "hasMore": false,
    }))
}

/// Extract an integer argument tolerant of how the host's V8 `source_command`
/// boundary encodes it. Telegram chat_ids exceed i32 and JS numbers are f64, so
/// the value can arrive as a JSON i64, an f64, or a numeric string — a plain
/// `as_i64()` returns None for the latter two, which surfaced as the bogus
/// "missing chat_id" error on backfill/send for real (large-id) chats.
fn arg_i64(args: &Value, key: &str) -> Option<i64> {
    let v = args.get(key)?;
    v.as_i64()
        .or_else(|| v.as_f64().map(|f| f as i64))
        .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
}

/// Live `magnis.execute`. Ports the in-backend `send_message` / `reply` /
/// `backfill_chat` / `download_file` actions to the connected client. Auth
/// actions are not part of the external connector's contract (auth is host-side).
pub async fn execute(client: &TgClient, account_id: &str, args: &Value) -> anyhow::Result<Value> {
    let action = args
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("send_message");
    match action {
        "send_message" | "reply" => {
            let chat_id =
                arg_i64(args, "chat_id").ok_or_else(|| anyhow::anyhow!("missing chat_id"))?;
            let text = args
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("missing text"))?;
            let reply_to = arg_i64(args, "reply_to_message_id");
            client.send_message(chat_id, text, reply_to).await
        }
        "backfill_chat" => {
            let chat_id =
                arg_i64(args, "chat_id").ok_or_else(|| anyhow::anyhow!("missing chat_id"))?;
            let before_message_id = arg_i64(args, "before_message_id").unwrap_or(0);
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .map(|v| v as usize)
                .unwrap_or(50);
            backfill_chat(client, account_id, chat_id, before_message_id, limit).await
        }
        "download_file" => {
            let source_ref = args
                .get("source_ref")
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("download_file: missing source_ref"))?;
            let dest = args
                .get("dest")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("download_file: missing dest"))?;
            let chat_id = arg_i64(&source_ref, "chat_id")
                .ok_or_else(|| anyhow::anyhow!("download_file: missing chat_id"))?;
            let message_id = arg_i64(&source_ref, "message_id")
                .ok_or_else(|| anyhow::anyhow!("download_file: missing message_id"))?;
            // local_path must be RELATIVE to the host's files dir — the host
            // serves it via files_dir.join(local_path). The source stamped that
            // as dest_subpath; fall back to the raw dest only if it is absent.
            let local_path = source_ref
                .get("dest_subpath")
                .and_then(Value::as_str)
                .unwrap_or(dest)
                .to_string();
            let size_bytes = client
                .download_media_file(chat_id, message_id, std::path::Path::new(dest))
                .await?;
            Ok(json!({ "size_bytes": size_bytes, "local_path": local_path }))
        }
        other => anyhow::bail!("unsupported telegram execute action '{other}'"),
    }
}

/// Whether backfill should fetch another page after one that returned
/// `returned` messages.
///
/// Telegram's `getHistory` returns SHORT pages (fewer than the requested limit)
/// even when older history still remains — auto-deleted messages, service
/// messages, and server-side chunking all shrink a page below the limit. So
/// "fewer than limit" is NOT a reliable end-of-history signal: a page that
/// returned ANY messages may have more behind it, and only an EMPTY page
/// reliably means the history is exhausted. Continue while the page was
/// non-empty (`run_backfill` re-anchors on `oldest_message_id`, exclusive, so
/// the next empty page terminates the walk).
fn backfill_has_more(returned: usize) -> bool {
    returned > 0
}

async fn backfill_chat(
    client: &TgClient,
    account_id: &str,
    chat_id: i64,
    before_message_id: i64,
    limit: usize,
) -> anyhow::Result<Value> {
    let packed = client.resolve_packed_chat(chat_id).await?;
    let mut msg_iter = client
        .client
        .iter_messages(packed)
        .offset_id(before_message_id as i32)
        .limit(limit);

    let mut envelopes = Vec::new();
    let mut oldest: Option<i64> = None;
    // Stamp the connection's account_id into every backfilled message's
    // source_ref (Bug 2). Previously hardcoded "" — which the host did NOT
    // re-stamp for the external connector, so backfilled media facets carried
    // account_id="" and the file-download worker later resolved the Telegram
    // session for account '' (no session) and never downloaded the attachment.
    while let Some(msg) = msg_iter.next().await? {
        let msg_id = msg.id() as i64;
        oldest = Some(oldest.map_or(msg_id, |o| o.min(msg_id)));
        envelopes.push(message_envelope(
            &message_to_intermediate(&msg, account_id, chat_id),
            "snapshot",
        ));
    }
    // Report the pagination state so run_backfill walks each chat to COMPLETION
    // (full history into the graph), not just one page. oldest_message_id is the
    // cursor to continue from. Keys are read raw by run_backfill (the Execute path
    // is not FetchResult-shaped), so they are snake_case.
    let has_more = backfill_has_more(envelopes.len());
    Ok(json!({
        "envelopes": envelopes,
        "has_more": has_more,
        "oldest_message_id": oldest,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // tst_src_tg_argi64_001: source_command args cross the host V8 boundary as a
    // JSON i64, an f64 (JS numbers are doubles), or a numeric string. arg_i64
    // must accept all three so large telegram chat_ids (> i32) don't surface as
    // the bogus "missing chat_id" on backfill/send.
    #[test]
    fn tst_src_tg_argi64_001_accepts_i64_f64_and_string() {
        let big = 4_891_473_905i64; // a real telegram chat_id, > i32::MAX
        assert_eq!(arg_i64(&json!({ "chat_id": big }), "chat_id"), Some(big));
        assert_eq!(
            arg_i64(&json!({ "chat_id": big as f64 }), "chat_id"),
            Some(big)
        );
        assert_eq!(
            arg_i64(&json!({ "chat_id": big.to_string() }), "chat_id"),
            Some(big)
        );
        assert_eq!(arg_i64(&json!({}), "chat_id"), None);
        assert_eq!(arg_i64(&json!({ "chat_id": "abc" }), "chat_id"), None);
    }

    // tst_src_tg_backfill_001: a non-empty page SHORTER than the requested limit
    // must still report has_more=true. Telegram getHistory returns short pages
    // mid-history (a real chat: 251 returned for a 500 limit, with another month
    // of messages behind it), so only an empty page ends backfill. Captures the
    // regression where `len() == limit` stopped early and dropped real history.
    #[test]
    fn tst_src_tg_backfill_001_short_nonempty_page_has_more() {
        assert!(
            backfill_has_more(251),
            "a short but non-empty page may have older history behind it"
        );
        assert!(backfill_has_more(500), "a full page certainly continues");
        assert!(
            !backfill_has_more(0),
            "an empty page is the only reliable end-of-history signal"
        );
    }

    // ── Offset-paginated bootstrap (DEC-1/8) ───────────────────────────────
    use crate::client::{
        resolve_hydrated_messages, DialogOffset, DialogPage, OffsetPeer, PagedDialog,
    };
    use std::cell::RefCell;

    /// In-memory dialog the fake pager serves. `history_rpc_err`, when set
    /// (`(code, name)`), makes the pager simulate this chat's
    /// `messages.getHistory` failing with a typed grammers RPC error — routed
    /// through the SAME `resolve_hydrated_messages` seam the live pager uses, so
    /// the test exercises the real skip (transient, e.g. 500/RPC_CALL_FAIL) vs
    /// propagate (fatal, e.g. 401/auth) policy.
    struct FakeDialog {
        chat_id: i64,
        is_pinned: bool,
        msg_ids: Vec<i64>,
        history_rpc_err: Option<(i32, &'static str)>,
    }

    /// Deterministic `DialogPager` over an ordered in-memory dialog list. It
    /// pages by a synthetic index encoded in `DialogOffset.offset_id`, records
    /// every request, and — crucially — re-serves dialogs from `start` so a loop
    /// that fails to advance the offset (the O(N²) bug) re-hands earlier dialogs.
    struct FakePager {
        dialogs: Vec<FakeDialog>,
        page_size: usize,
        requests: RefCell<Vec<Option<i32>>>,
        handed: RefCell<usize>,
        /// Reported `DialogsSlice.count` passthrough (None → pager omits total).
        total: Option<i64>,
    }

    impl FakePager {
        fn new(dialogs: Vec<FakeDialog>, page_size: usize) -> Self {
            Self {
                dialogs,
                page_size,
                requests: RefCell::new(Vec::new()),
                handed: RefCell::new(0),
                total: None,
            }
        }

        /// Make the fake report `count` as the server-side `total` on every page.
        fn with_total(mut self, count: i64) -> Self {
            self.total = Some(count);
            self
        }
    }

    impl DialogPager for FakePager {
        async fn dialog_page(
            &self,
            offset: Option<&DialogOffset>,
            limit: usize,
        ) -> anyhow::Result<DialogPage> {
            self.requests.borrow_mut().push(offset.map(|o| o.offset_id));
            let start = offset.map(|o| o.offset_id as usize).unwrap_or(0);
            let take = limit.min(self.page_size);
            let end = (start + take).min(self.dialogs.len());
            *self.handed.borrow_mut() += end.saturating_sub(start);

            let mut dialogs = Vec::new();
            for fd in &self.dialogs[start..end] {
                // Mirror LiveDialogPager: hydrate into a Result, then run it
                // through the real skip/propagate seam. A transient history_err
                // yields an empty snapshot (chat still discovered); a fatal one
                // aborts the page (the `?` propagates, as in the live pager).
                let fetched: anyhow::Result<Vec<crate::envelope::TgMessage>> =
                    match fd.history_rpc_err {
                        Some((code, name)) => Err(anyhow::Error::new(
                            grammers_client::InvocationError::Rpc(grammers_mtsender::RpcError {
                                code,
                                name: name.to_string(),
                                value: None,
                                caused_by: None,
                            }),
                        )),
                        None => Ok(fd
                            .msg_ids
                            .iter()
                            .map(|&m| fake_msg(fd.chat_id, m))
                            .collect()),
                    };
                let messages = resolve_hydrated_messages(fd.chat_id, fetched)?;
                dialogs.push(PagedDialog {
                    chat: fake_chat(fd.chat_id, fd.is_pinned),
                    messages,
                });
            }
            let next_offset = if end < self.dialogs.len() {
                Some(DialogOffset {
                    offset_date: 0,
                    offset_id: end as i32,
                    offset_peer: OffsetPeer {
                        ty: "user".to_string(),
                        id: 0,
                        access_hash: None,
                    },
                })
            } else {
                None
            };
            Ok(DialogPage {
                dialogs,
                next_offset,
                total: self.total,
            })
        }
    }

    fn fake_chat(chat_id: i64, is_pinned: bool) -> crate::envelope::TgChat {
        crate::envelope::TgChat {
            chat_id,
            title: format!("Chat {chat_id}"),
            chat_type: "private".to_string(),
            is_pinned,
            pin_order: 0,
            unread_count: 0,
            unread_mark: false,
            read_inbox_max_id: 0,
            read_outbox_max_id: 0,
            unread_mentions_count: 0,
            top_message: 0,
            pts: None,
            member_count: None,
            username: None,
            avatar_url: None,
        }
    }

    fn fake_msg(chat_id: i64, message_id: i64) -> crate::envelope::TgMessage {
        crate::envelope::TgMessage {
            message_id,
            chat_id,
            text: String::new(),
            date: "2026-01-01T00:00:00+00:00".to_string(),
            is_outgoing: false,
            chat_title: None,
            sender_name: None,
            sender_id: None,
            reply_to_msg_id: None,
            media_type: None,
            has_media: false,
            file_name: None,
            is_pinned: false,
            sender_info: None,
            account_id: String::new(),
            live: false,
        }
    }

    /// Drive the host's bootstrap loop over the fake: repeatedly call
    /// `run_bootstrap` threading `nextCursor` until `hasMore=false`. Returns the
    /// emitted chat ids (in order, across batches), the per-batch `hasMore`, and
    /// the final cursor.
    async fn drive_bootstrap(pager: &FakePager, mut cursor: Value) -> (Vec<i64>, Vec<bool>, Value) {
        let mut emitted = Vec::new();
        let mut has_mores = Vec::new();
        for _ in 0..50 {
            let c = if cursor.is_null() {
                None
            } else {
                Some(&cursor)
            };
            let out = run_bootstrap(c, pager).await.unwrap();
            for env in out["envelopes"].as_array().unwrap() {
                let rid = env["remote_id"].as_str().unwrap_or("");
                if rid.starts_with("tg:chat:") {
                    emitted.push(env["payload"]["chat_id"].as_i64().unwrap());
                }
            }
            let hm = out["hasMore"].as_bool().unwrap();
            has_mores.push(hm);
            cursor = out["nextCursor"].clone();
            if !hm {
                break;
            }
        }
        (emitted, has_mores, cursor)
    }

    fn simple_dialogs(n: i64) -> Vec<FakeDialog> {
        (0..n)
            .map(|i| FakeDialog {
                chat_id: 1000 + i,
                is_pinned: false,
                msg_ids: vec![i * 10 + 1, i * 10 + 2],
                history_rpc_err: None,
            })
            .collect()
    }

    // INV-1/3 — every dialog enumerated exactly once across ⌈M/B⌉ batches;
    // hasMore is true until the walk is exhausted, then false.
    #[tokio::test]
    async fn tst_src_tg_bootstrap_001_covers_all_dialogs_once() {
        let pager = FakePager::new(simple_dialogs(130), 50);
        let (emitted, has_mores, cursor) = drive_bootstrap(&pager, Value::Null).await;

        let unique: std::collections::HashSet<_> = emitted.iter().copied().collect();
        assert_eq!(emitted.len(), 130, "every dialog emitted");
        assert_eq!(unique.len(), 130, "no dialog emitted twice");
        assert_eq!(has_mores, vec![true, true, false]);
        assert!(
            cursor["dialog_offset"].is_null(),
            "final cursor has no further offset"
        );
    }

    // INV-2 — O(N) regression lock: the pager hands out each dialog at most once
    // (total handed == M), and the request offsets advance (∅, 50, 100) instead
    // of re-requesting ∅ every batch (which would re-hand 50+100+... under O(N²)).
    #[tokio::test]
    async fn tst_src_tg_o_n_002_pager_hands_each_dialog_once() {
        let pager = FakePager::new(simple_dialogs(130), 50);
        let _ = drive_bootstrap(&pager, Value::Null).await;

        assert_eq!(
            *pager.handed.borrow(),
            130,
            "O(N): each dialog fetched once, not re-walked"
        );
        assert_eq!(
            *pager.requests.borrow(),
            vec![None, Some(50), Some(100)],
            "offsets advance; batch 2+ never re-requests the top"
        );
    }

    // INV-5 — a 0-message dialog is recorded once with last_msg_id=0 and not
    // re-enumerated in a later batch (regression lock for e51e2098).
    #[tokio::test]
    async fn tst_src_tg_zero_msg_003_zero_message_chat_recorded_once() {
        let mut dialogs = simple_dialogs(60);
        dialogs[10].msg_ids.clear(); // chat 1010 has no messages
        let empty_id = dialogs[10].chat_id;
        let pager = FakePager::new(dialogs, 50);

        let (emitted, _hm, cursor) = drive_bootstrap(&pager, Value::Null).await;

        assert_eq!(
            emitted.iter().filter(|&&c| c == empty_id).count(),
            1,
            "0-message chat emitted exactly once"
        );
        assert_eq!(
            cursor["chats"][empty_id.to_string()]["last_msg_id"],
            0,
            "0-message chat recorded with watermark 0"
        );
    }

    // INV-6 — pinned dialogs spanning a batch boundary keep monotonic pin_order
    // and pinned_count is not double-counted, because the offset advances (a loop
    // that re-requested the top would re-emit the head-pinned dialogs).
    #[tokio::test]
    async fn tst_src_tg_pinned_004_pinned_order_stable_across_batches() {
        // 3 pinned at the head, 2 normal; page size 2 → pinned span batches 1-2.
        let mut dialogs = simple_dialogs(5);
        for d in dialogs.iter_mut().take(3) {
            d.is_pinned = true;
        }
        let pager = FakePager::new(dialogs, 2);

        let (emitted, _hm, cursor) = drive_bootstrap(&pager, Value::Null).await;

        assert_eq!(emitted.len(), 5, "each dialog once");
        assert_eq!(
            cursor["pinned_count"], 3,
            "exactly 3 pinned counted (no double-count across batches)"
        );
    }

    // tst_src_tg_bootstrap_total_001 (INV-1/2) — the bootstrap result carries
    // `total` (the pager's reported DialogsSlice.count, passed through) and
    // `discovered` (= the cumulative size of the cursor `chats` map). On the
    // FIRST batch over 130 dialogs (page size 50): total==130 (the pager's
    // reported count) and discovered==50 (the chats enumerated so far).
    #[tokio::test]
    async fn tst_src_tg_bootstrap_total_001_reports_total_and_discovered() {
        let pager = FakePager::new(simple_dialogs(130), 50).with_total(130);

        // First batch: 50 dialogs enumerated, 80 remain.
        let out = run_bootstrap(None, &pager).await.unwrap();
        assert_eq!(out["total"], 130, "total passes through DialogsSlice.count");
        assert_eq!(
            out["discovered"], 50,
            "discovered = size of the chats map after batch 1"
        );

        // Drive the rest: discovered climbs to 130 by the final batch.
        let mut cursor = out["nextCursor"].clone();
        let mut last_discovered = out["discovered"].as_i64().unwrap();
        for _ in 0..10 {
            let c = if cursor.is_null() {
                None
            } else {
                Some(&cursor)
            };
            let out = run_bootstrap(c, &pager).await.unwrap();
            assert_eq!(out["total"], 130, "total stays the reported count");
            last_discovered = out["discovered"].as_i64().unwrap();
            cursor = out["nextCursor"].clone();
            if !out["hasMore"].as_bool().unwrap() {
                break;
            }
        }
        assert_eq!(
            last_discovered, 130,
            "discovered reaches the full enumerated set"
        );
    }

    // INV-8 — a cursor written by the OLD bootstrap (chats map, NO dialog_offset)
    // resumes from the top without panic and emits the full set (idempotent).
    #[tokio::test]
    async fn tst_src_tg_cursor_compat_005_old_cursor_resumes() {
        let pager = FakePager::new(simple_dialogs(120), 50);
        // Old-shape cursor: chats recorded, pinned_count, but NO dialog_offset.
        let old_cursor = json!({
            "date": "2026-01-01T00:00:00+00:00",
            "chats": { "1000": { "last_msg_id": 5 }, "1001": { "last_msg_id": 7 } },
            "pinned_count": 1,
        });

        let (emitted, has_mores, _cursor) = drive_bootstrap(&pager, old_cursor).await;

        assert_eq!(
            pager.requests.borrow()[0],
            None,
            "no dialog_offset → resume from the top"
        );
        let unique: std::collections::HashSet<_> = emitted.iter().copied().collect();
        assert_eq!(unique.len(), 120, "all dialogs emitted despite old cursor");
        assert!(!has_mores.last().unwrap(), "completes");
    }

    // tst_src_tg_bootstrap_history_skip_012 — THE regression for the live failure:
    // bootstrap reached 1954/2581 dialogs, then ONE chat's getHistory returned a
    // server `RPC_CALL_FAIL` (500) and aborted the WHOLE bootstrap. A single
    // chat's transient history failure must NOT abort the batch: the batch must
    // drain ALL remaining chats, the failing chat is still discovered (its chat
    // envelope emitted), only its history snapshot is skipped (no message
    // envelopes), and bootstrap completes (hasMore→false).
    #[tokio::test]
    async fn tst_src_tg_bootstrap_history_skip_012_transient_history_error_continues() {
        let mut dialogs = simple_dialogs(60);
        // The 30th chat (mid-batch) fails getHistory with the live-observed error.
        let failing_id = dialogs[30].chat_id;
        dialogs[30].history_rpc_err = Some((500, "RPC_CALL_FAIL"));
        let pager = FakePager::new(dialogs, 50).with_total(60);

        let (emitted, has_mores, cursor) = drive_bootstrap(&pager, Value::Null).await;

        // The batch drained every chat — the failing one did NOT abort it.
        let unique: std::collections::HashSet<_> = emitted.iter().copied().collect();
        assert_eq!(
            unique.len(),
            60,
            "all 60 chats discovered despite one getHistory 500"
        );
        assert!(
            emitted.contains(&failing_id),
            "the failing chat is STILL discovered (chat envelope emitted)"
        );
        assert!(
            !has_mores.last().unwrap(),
            "bootstrap completes, not stuck in error"
        );
        // The failing chat is recorded with watermark 0 (history skipped, no msgs).
        assert_eq!(
            cursor["chats"][failing_id.to_string()]["last_msg_id"],
            0,
            "failing chat's history skipped → watermark 0, re-attempted next cycle"
        );
    }

    // tst_src_tg_bootstrap_history_fatal_013 — an AUTH failure during per-chat
    // history hydration is FATAL: it must abort the batch (propagate), never be
    // silently swallowed like a transient server error. Distinguishes the two
    // classes at the bootstrap-loop level.
    #[tokio::test]
    async fn tst_src_tg_bootstrap_history_fatal_013_auth_error_aborts() {
        let mut dialogs = simple_dialogs(10);
        dialogs[3].history_rpc_err = Some((401, "AUTH_KEY_UNREGISTERED"));
        let pager = FakePager::new(dialogs, 50);

        let result = run_bootstrap(None, &pager).await;
        assert!(
            result.is_err(),
            "an auth failure must propagate (abort the batch), not be swallowed"
        );
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("AUTH_KEY_UNREGISTERED"),
            "the propagated error preserves the auth cause"
        );
    }
}
