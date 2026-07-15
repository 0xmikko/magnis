//! Subscription protocol (Stage 1 of telegram cutover):
//! `listen_start{subscription_id, _meta}` + `listen_stop{subscription_id}`.
//!
//! Replaces the implicit "one listener per process" assumption of the
//! legacy `magnis.sync.listen` tool with a named subscription registry.
//! Each subscription is a tokio task with its own cancel channel; stopping
//! one doesn't affect others. Same connector process can hold N
//! subscriptions for N different account_ids concurrently.
//!
//! Notifications emitted from each subscription stamp `subscription_id`
//! and `account_id` into the params alongside the existing `{payload,
//! remote_id}` — host can route by `subscription_id` and validate that
//! the `account_id` matches a registered subscription
//! (host-side validation lands in Stage 2; this connector change is
//! purely additive — host's existing tolerant `parse_push_params`
//! ignores unknown fields).

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::client::{account_id_from_meta, creds_from_meta, TgClient};
use crate::{fixture, live_update_pushes_inline, sessions};

/// Listener mode — explicit (not from env) so unit tests can drive
/// the registry without mutating process-global state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListenerMode {
    /// Replay pre-recorded pushes from the fixture file then exit.
    Fixture,
    /// Connect via grammers + stream live MTProto updates.
    Live,
}

/// Shared, locked stdout (re-exported alias of `main::SharedOut`). We
/// don't import the type directly to avoid a cyclic dep on `main`; both
/// modules share the same shape.
pub type SharedOut = Arc<Mutex<tokio::io::Stdout>>;

/// One active subscription's runtime handle.
struct ListenerHandle {
    /// Task handle for the running listener; aborted on stop.
    handle: JoinHandle<()>,
    /// Cancel signal sent before abort to give the loop a chance to
    /// drain cleanly (best-effort).
    cancel_tx: oneshot::Sender<()>,
}

/// Per-connector subscription registry. Lives for the lifetime of the
/// process; one instance shared via `Arc` across all `tools/call`
/// handlers.
pub struct SubscriptionRegistry {
    /// Running listeners + the set of ids whose `start()` is in flight, under
    /// ONE lock so the "already running OR already starting?" check and the
    /// claim are atomic. DEC-1 spawns each `tools/call`, so concurrent
    /// `start()` for the same id can now race — the old single-reader-loop
    /// assumption (one request serviced at a time) no longer holds.
    inner: Mutex<RegistryInner>,
}

#[derive(Default)]
struct RegistryInner {
    running: HashMap<String, ListenerHandle>,
    /// ids with a `start()` in flight (claimed but not yet inserted into
    /// `running`). A concurrent `start()` for a claimed id is a no-op.
    starting: HashSet<String>,
}

impl SubscriptionRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(RegistryInner::default()),
        }
    }

    /// INV-SUB-1: start a listener for `subscription_id`. Idempotent —
    /// re-calling with the same id is a no-op (returns ok without
    /// spawning a duplicate).
    ///
    /// `mode` is explicit; caller (typically `main`) decides based on
    /// `TELEGRAM_FIXTURE_FILE` env. Tests pass `Fixture` directly to
    /// avoid mutating process-global state.
    ///
    /// Returns `Ok(_)` once the listener is established (or already
    /// present). In live mode this means the MTProto session is
    /// CONNECTED before we return — INV-LIFECYCLE-5: the host's
    /// `listen_start` ack then means "the live stream is open", so the
    /// caller can start backfill without a drop window between subscribe
    /// and connect. Errors on malformed `_meta` or a failed connect.
    pub async fn start(
        &self,
        subscription_id: String,
        mode: ListenerMode,
        args: &Value,
        out: SharedOut,
    ) -> Result<(), String> {
        // Atomic claim (INV-9): under ONE lock, "already running" OR "already
        // starting" is a no-op; otherwise claim the id. DEC-1 spawns each
        // `tools/call`, so two concurrent `start()` for the same id can arrive
        // at once — the claim guarantees exactly ONE builds a listener and the
        // other returns Ok without a duplicate spawn.
        {
            let mut inner = self.inner.lock().await;
            if inner.running.contains_key(&subscription_id)
                || !inner.starting.insert(subscription_id.clone())
            {
                return Ok(());
            }
        }

        // Build OUTSIDE the lock so a live MTProto connect never blocks other
        // subscriptions. The claim is released in BOTH the ok and err paths.
        let built = self.build_listener(&subscription_id, mode, args, out).await;

        let mut inner = self.inner.lock().await;
        inner.starting.remove(&subscription_id);
        match built {
            Ok(handle) => {
                inner.running.insert(subscription_id, handle);
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    /// Build one listener (resolve `_meta`, connect, spawn the stream loop).
    /// Owns NONE of the registry maps — the caller holds the claim and does the
    /// insert. INV-LIFECYCLE-5: a live connect happens BEFORE the stream loop
    /// is spawned, so a failed connect surfaces as a `listen_start` error
    /// (exercised host-side by `tst_src_mcp_runtime_017`).
    async fn build_listener(
        &self,
        subscription_id: &str,
        mode: ListenerMode,
        args: &Value,
        out: SharedOut,
    ) -> Result<ListenerHandle, String> {
        // NO FALLBACKS: account_id is required for SessionPool routing AND for
        // notification stamping. Missing → error, caller fixes their _meta.
        let account_id = account_id_from_meta(args)?;

        // Test seam (INV-9): an optional `_meta.test_build_delay_ms` widens the
        // claim→insert window so the concurrency test deterministically
        // exercises the race. Production calls never carry it → no delay, no
        // process-global state.
        if let Some(ms) = args
            .get("_meta")
            .and_then(|m| m.get("test_build_delay_ms"))
            .and_then(Value::as_u64)
        {
            tokio::time::sleep(Duration::from_millis(ms)).await;
        }

        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
        let handle = match mode {
            ListenerMode::Fixture => {
                spawn_fixture_listener(subscription_id.to_string(), account_id, out, cancel_rx)
            }
            ListenerMode::Live => {
                let creds = creds_from_meta(args)?;
                let client = sessions::pool().get_or_create(&account_id, &creds).await?;
                spawn_live_listener(
                    subscription_id.to_string(),
                    account_id,
                    client,
                    out,
                    cancel_rx,
                )
            }
        };
        Ok(ListenerHandle { handle, cancel_tx })
    }

    /// Convenience: choose mode from `TELEGRAM_FIXTURE_FILE` env. Used
    /// by `main` so production paths stay one-call; tests use `start()`
    /// with explicit mode.
    pub async fn start_from_env(
        &self,
        subscription_id: String,
        args: &Value,
        out: SharedOut,
    ) -> Result<(), String> {
        let mode = if fixture::fixture_path().is_some() {
            ListenerMode::Fixture
        } else {
            ListenerMode::Live
        };
        self.start(subscription_id, mode, args, out).await
    }

    /// INV-SUB-3: cancel the named listener task. Returns whether a task
    /// was actually found and cancelled. Other subscriptions stay alive.
    pub async fn stop(&self, subscription_id: &str) -> bool {
        let mut inner = self.inner.lock().await;
        let Some(ListenerHandle { handle, cancel_tx }) = inner.running.remove(subscription_id)
        else {
            return false;
        };
        // Best-effort cancel signal (listener may have already exited).
        let _ = cancel_tx.send(());
        handle.abort();
        true
    }

    /// Number of active subscriptions — used by tests / diagnostics.
    #[allow(dead_code)] // test helper; also useful for future status RPC
    pub async fn len(&self) -> usize {
        self.inner.lock().await.running.len()
    }
}

impl Default for SubscriptionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ── listener task spawners ───────────────────────────────────

/// Fixture mode: emit pre-recorded live pushes from the fixture file,
/// then exit (the fixture is finite). Cancel signal interrupts mid-stream
/// for stop-during-replay tests.
fn spawn_fixture_listener(
    subscription_id: String,
    account_id: String,
    out: SharedOut,
    mut cancel_rx: oneshot::Receiver<()>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        for (payload, remote_id) in fixture::live_pushes() {
            tokio::select! {
                _ = &mut cancel_rx => return,
                _ = emit_envelope(&out, &subscription_id, &account_id, &payload, &remote_id) => {}
            }
        }
    })
}

/// Live mode: forward MTProto updates from an already-connected
/// `TgClient` as notifications. Best-effort: errors stop the loop.
/// Cancel signal triggers clean exit.
///
/// The client is connected by the caller (`start`) BEFORE this task is
/// spawned (INV-LIFECYCLE-5) and is the shared `SessionPool` client for
/// this `account_id` — one MTProto socket per account, used by `fetch` /
/// `execute` / opinionated tools too. Matches chigwell's pattern.
fn spawn_live_listener(
    subscription_id: String,
    account_id: String,
    client: TgClient,
    out: SharedOut,
    mut cancel_rx: oneshot::Receiver<()>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut cancel_rx => return,
                update_res = client.client.next_update() => {
                    match update_res {
                        Ok(update) => {
                            for (payload, remote_id) in
                                live_update_pushes_inline(update, &account_id)
                            {
                                emit_envelope(
                                    &out,
                                    &subscription_id,
                                    &account_id,
                                    &payload,
                                    &remote_id,
                                )
                                .await;
                            }
                        }
                        Err(e) => {
                            eprintln!("magnis-telegram: live update error: {e}");
                            return;
                        }
                    }
                }
            }
        }
    })
}

/// Write one `notifications/magnis/envelope` with the new params shape
/// (`{subscription_id, account_id, payload, remote_id}`). Host's existing
/// tolerant parser ignores `subscription_id` + `account_id` until Stage
/// 2 wires them.
async fn emit_envelope(
    out: &SharedOut,
    subscription_id: &str,
    account_id: &str,
    payload: &Value,
    remote_id: &str,
) {
    let msg = json!({
        "jsonrpc": "2.0",
        "method": "notifications/magnis/envelope",
        "params": {
            "subscription_id": subscription_id,
            "account_id": account_id,
            "payload": payload,
            "remote_id": remote_id,
        }
    });
    let mut bytes = serde_json::to_vec(&msg).unwrap_or_default();
    bytes.push(b'\n');
    let mut w = out.lock().await;
    let _ = tokio::io::AsyncWriteExt::write_all(&mut *w, &bytes).await;
    let _ = tokio::io::AsyncWriteExt::flush(&mut *w).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Make a SharedOut backed by stdout — we don't read what's
    /// written in these unit tests, only assert registry mechanics.
    fn test_out() -> SharedOut {
        Arc::new(Mutex::new(tokio::io::stdout()))
    }

    #[tokio::test]
    async fn registry_start_is_idempotent_by_subscription_id() {
        let reg = SubscriptionRegistry::new();
        let args = json!({ "_meta": { "account_id": "tg:A" } });
        reg.start(
            "sub:1".to_string(),
            ListenerMode::Fixture,
            &args,
            test_out(),
        )
        .await
        .unwrap();
        let len_after_first = reg.len().await;
        reg.start(
            "sub:1".to_string(),
            ListenerMode::Fixture,
            &args,
            test_out(),
        )
        .await
        .unwrap();
        let len_after_second = reg.len().await;
        assert_eq!(len_after_first, 1);
        assert_eq!(len_after_second, 1, "duplicate start must be no-op");
    }

    #[tokio::test]
    async fn registry_stop_unknown_returns_false() {
        let reg = SubscriptionRegistry::new();
        let stopped = reg.stop("never-started").await;
        assert!(!stopped);
    }

    #[tokio::test]
    async fn registry_stop_removes_from_tasks() {
        let reg = SubscriptionRegistry::new();
        let args = json!({ "_meta": { "account_id": "tg:A" } });
        reg.start(
            "sub:A".to_string(),
            ListenerMode::Fixture,
            &args,
            test_out(),
        )
        .await
        .unwrap();
        reg.start(
            "sub:B".to_string(),
            ListenerMode::Fixture,
            &args,
            test_out(),
        )
        .await
        .unwrap();
        assert_eq!(reg.len().await, 2);

        assert!(reg.stop("sub:A").await);
        assert_eq!(reg.len().await, 1);
        // sub:B unaffected
        assert!(reg.stop("sub:B").await);
        assert_eq!(reg.len().await, 0);
    }

    #[tokio::test]
    async fn registry_live_mode_rejects_missing_creds() {
        let reg = SubscriptionRegistry::new();
        let args = json!({ "_meta": { "account_id": "tg:A" } }); // no api_id/hash/session
        let err = reg
            .start("sub:1".to_string(), ListenerMode::Live, &args, test_out())
            .await
            .unwrap_err();
        assert!(err.contains("api_id"));
        assert_eq!(reg.len().await, 0, "failed start must not leave state");
    }
}
