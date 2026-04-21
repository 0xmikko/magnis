//! Spawns the magnis-server binary as a child process and manages its lifecycle.
//! The frontend connects to the server via HTTP (RPC) at the returned base URL.
//!
//! Local-mode contract: desktop boots the backend in `MAGNIS_DB_MODE=local`
//! and points it at a `data_root` directory. The backend owns PGlite spawn,
//! lockfile, and identity artefacts inside that directory. Desktop only
//! resolves paths and passes envs; it never touches pgdata.

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
                let p = base
                    .join("../../../target")
                    .join(subdir)
                    .join("magnis-server");
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

    /// Resolve the bundled `pglite-server` sidecar binary.
    ///
    /// Tauri's `externalBin` convention drops the sidecar next to the main
    /// executable, suffixed with the target triple (e.g.
    /// `pglite-server-aarch64-apple-darwin`). In dev builds (no bundle),
    /// fall back to the plain-name binary produced by
    /// `desktop/build/bundle-pglite.sh`. `MAGNIS_PGLITE_SERVER_BIN` env
    /// overrides both — useful for integration testing against a checked-out
    /// binary, and explicitly documented in `docs/deployment/local.md`.
    fn pglite_server_binary_path() -> Result<std::path::PathBuf> {
        if let Ok(path) = std::env::var("MAGNIS_PGLITE_SERVER_BIN") {
            let p = std::path::PathBuf::from(path);
            if p.exists() {
                return Ok(p);
            }
            anyhow::bail!(
                "MAGNIS_PGLITE_SERVER_BIN set to {} but file does not exist",
                p.display()
            );
        }

        let current_exe =
            std::env::current_exe().context("Failed to get current executable path")?;
        let parent = current_exe
            .parent()
            .context("Executable has no parent directory")?;

        let triple = current_target_triple();
        let suffixed = parent.join(format!("pglite-server-{triple}"));
        if suffixed.exists() {
            return Ok(suffixed);
        }
        let plain = parent.join("pglite-server");
        if plain.exists() {
            return Ok(plain);
        }

        // Dev builds: desktop/target or repo/target.
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        for rel in [
            "../../target/release/pglite-server",
            "../../target/debug/pglite-server",
            "../../../target/release/pglite-server",
            "../../../target/debug/pglite-server",
            "../build/pglite-server",
        ] {
            let p = base.join(rel);
            if p.exists() {
                return Ok(p.canonicalize()?);
            }
        }

        anyhow::bail!(
            "pglite-server sidecar not found. Run desktop/build/bundle-pglite.sh, or set \
             MAGNIS_PGLITE_SERVER_BIN to a compiled binary. Expected suffixed name: \
             pglite-server-{triple}"
        )
    }

    /// Spawn magnis-server in Local mode against `data_root` and wait for `/health`.
    ///
    /// Local-mode env contract (see `docs/deployment/local.md`):
    /// - `MAGNIS_DB_MODE=local` — selects `DbMode::Local` in the backend.
    /// - `DB_PATH=<data_root>` — directory that owns pgdata/, magnis.lock, identity files.
    /// - `STORAGE_DIR=<data_root>` — file storage lives under the same root.
    /// - `MAGNIS_PGLITE_SERVER_BIN=<resolved>` — bundled sidecar path.
    pub fn start(data_root: &std::path::Path, port: u16) -> Result<Self> {
        let bin = Self::server_binary_path()?;
        let data_root_str = data_root
            .to_str()
            .context("Data root path is not valid UTF-8")?;
        let pglite_bin = Self::pglite_server_binary_path()?;
        let pglite_bin_str = pglite_bin
            .to_str()
            .context("pglite-server path is not valid UTF-8")?;

        let child = Command::new(&bin)
            .env("MAGNIS_DB_MODE", "local")
            .env("DB_PATH", data_root_str)
            .env("STORAGE_DIR", data_root_str)
            .env("MAGNIS_PGLITE_SERVER_BIN", pglite_bin_str)
            .env("PORT", port.to_string())
            .env(
                "RUST_LOG",
                std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
            )
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

/// Host target triple baked in at compile time. Matches Tauri's `externalBin`
/// naming (`<name>-<triple>`). Not `std::env::consts::ARCH/OS` — those don't
/// carry the full triple format Tauri requires.
fn current_target_triple() -> &'static str {
    // `TARGET` is set by Cargo during the build (see `build.rs`).
    env!("MAGNIS_TARGET_TRIPLE")
}
