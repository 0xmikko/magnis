//! Spawns the magnis-server binary as a child process and manages its lifecycle.
//! The frontend connects to the server via HTTP (RPC) at the returned base URL.

use anyhow::{Context, Result};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

const DEFAULT_PORT: u16 = 3765;
const HEALTH_POLL_INTERVAL_MS: u64 = 100;
const HEALTH_TIMEOUT_SECS: u64 = 15;

/// Manages the magnis-server child process and exposes its base URL for the frontend.
pub struct BackendProcessManager {
    child: Option<Child>,
    base_url: String,
    port: u16,
    stopped: Arc<AtomicBool>,
}

impl BackendProcessManager {
    /// Resolve path to magnis-server binary (next to current exe, or repo/desktop target dir).
    fn server_binary_path() -> Result<std::path::PathBuf> {
        let current_exe =
            std::env::current_exe().context("Failed to get current executable path")?;
        let parent = current_exe
            .parent()
            .context("Executable has no parent directory")?;
        let next_to_exe = parent.join("magnis-server");
        if next_to_exe.exists() {
            return Ok(next_to_exe);
        }
        // When run from desktop/: CARGO_MANIFEST_DIR = desktop/src-tauri (baked at compile time)
        {
            let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            // desktop/target/release or desktop/target/debug
            for subdir in ["release", "debug"] {
                let p = base.join("../../target").join(subdir).join("magnis-server");
                if p.exists() {
                    return Ok(p.canonicalize()?);
                }
            }
            // Repo root target (when desktop is in repo/desktop): repo/target/release
            for subdir in ["release", "debug"] {
                let p = base.join("../../../target").join(subdir).join("magnis-server");
                if p.exists() {
                    return Ok(p.canonicalize()?);
                }
            }
        }
        // Explicit path for packaging
        if let Ok(path) = std::env::var("MAGNIS_SERVER_PATH") {
            let p = std::path::Path::new(&path);
            if p.exists() {
                return Ok(p.to_path_buf());
            }
        }
        anyhow::bail!(
            "magnis-server binary not found. From repo root run: cargo build -p magnis-server --release. \
             Or set MAGNIS_SERVER_PATH to the binary path."
        )
    }

    /// Spawn magnis-server with DB_PATH and PORT; wait for /health to return 200.
    pub fn start(db_path: &std::path::Path, port: u16) -> Result<Self> {
        let bin = Self::server_binary_path()?;
        let db_path_str = db_path
            .to_str()
            .context("Database path is not valid UTF-8")?;

        // Pass the repo .env file path so the backend loads the same config as standalone mode.
        // DB_PATH overrides DATABASE_URL inside the backend's resolve_database_url().
        let child = Command::new(&bin)
            .env("DB_PATH", db_path_str)
            .env("PORT", port.to_string())
            .env("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .context("Failed to spawn magnis-server")?;

        let base_url = format!("http://127.0.0.1:{}", port);
        let stopped = Arc::new(AtomicBool::new(false));

        let manager = Self {
            child: Some(child),
            base_url: base_url.clone(),
            port,
            stopped: stopped.clone(),
        };

        Self::wait_for_health(&base_url)?;

        Ok(manager)
    }

    fn wait_for_health(base_url: &str) -> Result<()> {
        let url = format!("{}/health", base_url);
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(1))
            .timeout(Duration::from_secs(2))
            .build()
            .context("Failed to build HTTP client")?;
        let deadline = Instant::now() + Duration::from_secs(HEALTH_TIMEOUT_SECS);
        while deadline > Instant::now() {
            if let Ok(resp) = client.get(&url).send() {
                if resp.status().is_success() {
                    return Ok(());
                }
            }
            std::thread::sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS));
        }
        anyhow::bail!("Backend did not become healthy in {}s", HEALTH_TIMEOUT_SECS)
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Stop the backend process. Idempotent.
    pub fn stop(&mut self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for BackendProcessManager {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Pick a port for the backend. Reads MAGNIS_BACKEND_PORT env var, falls back to DEFAULT_PORT.
pub fn pick_port() -> u16 {
    std::env::var("MAGNIS_BACKEND_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}
