//! Shared session pool (Stage 6 of telegram cutover).
//!
//! One `TgClient` (= one grammers `Client` = one MTProto socket) per
//! `account_id`, shared across all tool calls and subscriptions for that
//! account_id. Lazy: first access for a new account_id triggers connect;
//! subsequent calls return the same client.
//!
//! Sessions are NEVER evicted by idle timeout (chigwell-confirmed
//! pattern; eviction conflicts with active subscriptions). Only explicit
//! revoke (via `evict`) or connector restart closes them.
//!
//! Concurrency model: a single `tokio::sync::Mutex` guards the HashMap.
//! Connecting to Telegram inside the lock (~1s handshake) serializes
//! concurrent first-access attempts for DIFFERENT accounts during
//! bootstrap. After bootstrap fan-out completes, lookups are O(1)
//! microseconds. Acceptable for our scale (10s of accounts per process);
//! per-account locks are a future optimization if contention becomes
//! measurable.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::client::{TgClient, TgCreds};

/// One grammers Client per account_id; cloning is cheap (peer_cache is
/// Arc-internal, the grammers Client itself uses internal Arcs too).
pub struct SessionPool {
    sessions: Mutex<HashMap<String, TgClient>>,
}

impl SessionPool {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Get the live `TgClient` for `account_id`. Lazy: creates + connects
    /// MTProto on first access; returns cached client thereafter.
    ///
    /// Returns the existing client even if `creds` differ from what was
    /// originally used to create it — re-auth flows go through
    /// `evict(account_id) → listen_stop → listen_start` instead of
    /// silently re-keying.
    pub async fn get_or_create(
        &self,
        account_id: &str,
        creds: &TgCreds,
    ) -> Result<TgClient, String> {
        let mut s = self.sessions.lock().await;
        if let Some(client) = s.get(account_id) {
            return Ok(client.clone());
        }
        let client = TgClient::connect(creds)
            .await
            .map_err(|e| format!("connect telegram session '{account_id}': {e}"))?;
        s.insert(account_id.to_string(), client.clone());
        Ok(client)
    }

    /// Drop the session for `account_id` from the pool. Returns whether
    /// a session was present. The dropped client's MTProto socket closes
    /// when the last `TgClient` clone is dropped (could be after this
    /// returns, if a tool call is still in flight using a borrowed
    /// clone).
    ///
    /// Wired for the future `evict_account` tool that the host calls
    /// on revoke (Stage 3 auth migration). Not used yet by any
    /// in-tree caller — `#[allow(dead_code)]` until then.
    #[allow(dead_code)]
    pub async fn evict(&self, account_id: &str) -> bool {
        let mut s = self.sessions.lock().await;
        s.remove(account_id).is_some()
    }

    /// Number of live sessions — diagnostics / future status RPC.
    #[allow(dead_code)]
    pub async fn len(&self) -> usize {
        self.sessions.lock().await.len()
    }
}

impl Default for SessionPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Module-level shared pool — one per connector process. Lifecycle =
/// process lifetime. Use `pool()` to access from any tool handler
/// without threading through every dispatch signature.
///
/// Tests use a fresh `SessionPool::new()` per test instead of the global
/// to avoid cross-test contamination.
static GLOBAL_POOL: std::sync::OnceLock<Arc<SessionPool>> = std::sync::OnceLock::new();

/// Get the connector's shared `SessionPool`. Initializes on first call.
pub fn pool() -> Arc<SessionPool> {
    GLOBAL_POOL
        .get_or_init(|| Arc::new(SessionPool::new()))
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Live behavior (connect / multi-account routing / shared client
    // between fetch+execute+listen) is covered by fixture-mode
    // integration tests in tests/mcp_server.rs + the host's stage_08
    // spawn-the-real-binary harness. These unit tests only cover the
    // HashMap mechanics that don't need an MTProto handshake.

    #[tokio::test]
    async fn pool_starts_empty() {
        let pool = SessionPool::new();
        assert_eq!(pool.len().await, 0);
    }

    #[tokio::test]
    async fn evict_unknown_returns_false() {
        let pool = SessionPool::new();
        assert!(!pool.evict("never-existed").await);
    }

    #[tokio::test]
    async fn pool_global_initializes_once() {
        let p1 = pool();
        let p2 = pool();
        assert!(
            Arc::ptr_eq(&p1, &p2),
            "global pool() must return the same Arc instance"
        );
    }
}
