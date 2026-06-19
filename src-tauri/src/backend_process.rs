//! Spawns the magnis-server binary as a child process and manages its lifecycle.
//! The frontend connects to the server via HTTP (RPC) at the returned base URL.
//!
//! Local-mode contract: desktop boots the backend in `MAGNIS_DB_MODE=local`
//! and points it at a `data_root` directory. The backend owns PGlite spawn,
//! lockfile, and identity artefacts inside that directory. Desktop only
//! resolves paths and passes envs; it never touches pgdata.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

const DEFAULT_PORT: u16 = 3765;
const HEALTH_POLL_INTERVAL_MS: u64 = 100;
// First desktop run extracts the bundled PostgreSQL archive and runs initdb
// before /health binds — give it room (was 15s for the PGlite sidecar).
const HEALTH_TIMEOUT_SECS: u64 = 120;
// On quit, ask the backend to shut down gracefully (SIGTERM → main.rs runs
// AppState::shutdown(): close pool, then stop the embedded postmaster) and wait
// this long before escalating to SIGKILL. Native Postgres recovers from an
// unclean kill, but a clean stop avoids leaving an orphan for the next boot.
const SHUTDOWN_GRACE_SECS: u64 = 10;
const SHUTDOWN_POLL_INTERVAL_MS: u64 = 50;

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
        // Tauri `externalBin` packages the sidecar target-triple-suffixed
        // (mirrors the pglite-server resolver); try that first, then plain.
        if let Some(p) = pick_existing(parent, current_target_triple(), |p| p.exists()) {
            return Ok(p);
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
    // Retained for the dev-only PGlite opt-out (desktop ships embedded PG now).
    #[allow(dead_code)]
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
    /// - `MAGNIS_LOCAL_PG=embedded` — desktop ships native embedded Postgres
    ///   (bundled into magnis-server); no PGlite sidecar.
    pub fn start(data_root: &std::path::Path, port: u16) -> Result<Self> {
        let bin = Self::server_binary_path()?;
        let data_root_str = data_root
            .to_str()
            .context("Data root path is not valid UTF-8")?;
        let child = Command::new(&bin)
            .env("MAGNIS_DB_MODE", "local")
            .env("DB_PATH", data_root_str)
            .env("STORAGE_DIR", data_root_str)
            // Desktop ships native embedded Postgres (bundled into magnis-server);
            // no PGlite sidecar. The PGlite opt-out is dev-only (not shipped).
            .env("MAGNIS_LOCAL_PG", "embedded")
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

    /// Stop the backend process gracefully (SIGTERM + grace → SIGKILL).
    /// Idempotent.
    pub fn stop(&mut self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(mut child) = self.child.take() {
            terminate_child(&mut child, Duration::from_secs(SHUTDOWN_GRACE_SECS));
        }
    }
}

/// Resolve the `magnis-server` binary next to `parent`: the Tauri
/// `externalBin` triple-suffixed name first (`magnis-server-<triple>`), then the
/// plain name. `exists` is injected so the precedence is unit-testable.
fn pick_existing(parent: &Path, triple: &str, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    let suffixed = parent.join(format!("magnis-server-{triple}"));
    if exists(&suffixed) {
        return Some(suffixed);
    }
    let plain = parent.join("magnis-server");
    if exists(&plain) {
        return Some(plain);
    }
    None
}

/// Terminate `child`, preferring a graceful shutdown: on unix send SIGTERM and
/// poll up to `grace` for a clean exit (so the backend runs `AppState::shutdown`
/// — pool close then embedded-postmaster stop), escalating to SIGKILL only if it
/// outlives the grace. On non-unix (no SIGTERM) it force-kills. Returns the
/// child's exit status. Effects use the real OS; tests drive it with a real
/// short-lived child so every branch is exercised.
fn terminate_child(child: &mut Child, grace: Duration) -> Option<ExitStatus> {
    #[cfg(unix)]
    {
        // SAFETY: kill(2) with a real pid + SIGTERM; no memory is touched.
        unsafe {
            libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
        }
        let deadline = Instant::now() + grace;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => return Some(status),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(SHUTDOWN_POLL_INTERVAL_MS));
                }
                Err(_) => break,
            }
        }
    }
    // Grace elapsed (or non-unix): force-kill and reap.
    let _ = child.kill();
    child.wait().ok()
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

/// The backend the GUI talks to: either a child process it spawned (dev/`Spawn`
/// mode) or a launchd-managed service it only connects to (`Service` mode). The
/// commands read `base_url()` uniformly; only `Spawn` is stopped on window exit.
pub enum BackendHandle {
    /// `Spawn` mode — GUI owns the child and stops it on exit.
    Spawned(BackendProcessManager),
    /// `Service` mode — connect-only; launchd owns the lifecycle, so the service
    /// intentionally outlives the GUI window (DEC-3/DEC-11). No child here.
    Service { base_url: String },
}

impl BackendHandle {
    pub fn base_url(&self) -> &str {
        match self {
            BackendHandle::Spawned(m) => m.base_url(),
            BackendHandle::Service { base_url } => base_url,
        }
    }

    /// Stop the spawned child (`Spawn` mode). In `Service` mode this is a no-op:
    /// the launchd services keep running so background sync survives window close.
    pub fn stop(&mut self) {
        if let BackendHandle::Spawned(m) = self {
            m.stop();
        }
    }
}

/// Host target triple baked in at compile time. Matches Tauri's `externalBin`
/// naming (`<name>-<triple>`). Not `std::env::consts::ARCH/OS` — those don't
/// carry the full triple format Tauri requires.
fn current_target_triple() -> &'static str {
    // `TARGET` is set by Cargo during the build (see `build.rs`).
    env!("MAGNIS_TARGET_TRIPLE")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// tst_desktop_resolver_001: the triple-suffixed binary wins over the
    /// plain name, and absence yields None (GAP-8 — packaging resolver order).
    #[test]
    fn tst_desktop_resolver_001_suffixed_precedence() {
        let parent = Path::new("/opt/app");
        let triple = "x86_64-unknown-linux-gnu";
        let suffixed = parent.join(format!("magnis-server-{triple}"));
        let plain = parent.join("magnis-server");

        // Both present → suffixed (Tauri externalBin) wins.
        let got = pick_existing(parent, triple, |p| p == suffixed || p == plain);
        assert_eq!(got.as_deref(), Some(suffixed.as_path()));

        // Only plain present → plain (dev build).
        let got = pick_existing(parent, triple, |p| p == plain);
        assert_eq!(got.as_deref(), Some(plain.as_path()));

        // Only suffixed present → suffixed.
        let got = pick_existing(parent, triple, |p| p == suffixed);
        assert_eq!(got.as_deref(), Some(suffixed.as_path()));

        // Neither → None (caller falls through to dev/target search).
        let got = pick_existing(parent, triple, |_| false);
        assert_eq!(got, None);
    }

    /// tst_desktop_term_001 (Finding 2): a child that exits on SIGTERM is
    /// stopped GRACEFULLY — it exits via its own handler, not SIGKILL, so the
    /// real backend's `AppState::shutdown` would have run.
    #[cfg(unix)]
    #[test]
    fn tst_desktop_term_001_graceful_sigterm_exit() {
        use std::os::unix::process::ExitStatusExt;
        // TERM trap exits 0; `sleep & wait` so the trap fires PROMPTLY on the
        // signal (a foreground `sleep` would defer it) — modelling the real
        // backend's tokio SIGTERM handler.
        let mut child = Command::new("sh")
            .arg("-c")
            .arg("trap 'exit 0' TERM; sleep 30 & wait")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn sh");
        // Let the shell install the trap before signalling.
        std::thread::sleep(Duration::from_millis(300));
        let status = terminate_child(&mut child, Duration::from_secs(5));
        let status = status.expect("child reaped");
        assert_eq!(
            status.signal(),
            None,
            "graceful exit must NOT be a signal-kill (got {status:?})"
        );
        assert_eq!(status.code(), Some(0), "TERM handler exits 0");
    }

    /// tst_desktop_term_002 (Finding 2): a child that IGNORES SIGTERM is force
    /// -killed after the grace window (so quit can never hang forever).
    #[cfg(unix)]
    #[test]
    fn tst_desktop_term_002_sigkill_escalation() {
        use std::os::unix::process::ExitStatusExt;
        // Ignores TERM and keeps sleeping → only SIGKILL stops it.
        let mut child = Command::new("sh")
            .arg("-c")
            .arg("trap '' TERM; sleep 30")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn sh");
        std::thread::sleep(Duration::from_millis(300));
        let started = Instant::now();
        let status = terminate_child(&mut child, Duration::from_millis(500));
        assert!(
            started.elapsed() >= Duration::from_millis(500),
            "must wait the full grace before escalating"
        );
        let status = status.expect("child reaped");
        assert_eq!(
            status.signal(),
            Some(libc::SIGKILL),
            "TERM-ignoring child must be SIGKILLed (got {status:?})"
        );
    }
}
