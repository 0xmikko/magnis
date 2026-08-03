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

/// CORS origins the desktop backend must allow: the Tauri webview origins plus
/// loopback. Set explicitly so it ALWAYS wins over any `CORS_ALLOWED_ORIGINS`
/// a `.env` on the machine carries — `dotenvy` walks parent dirs and would
/// otherwise pick up a server-deployment list that omits `tauri://localhost`,
/// blocking every webview request (the cause of the packaged-app "Load failed").
pub const DESKTOP_CORS_ORIGINS: &str =
    "tauri://localhost,https://tauri.localhost,http://localhost:*,http://127.0.0.1:*";

/// Resolve `(MAGNIS_PLUGINS_DIR, MAGNIS_PLUGINS_DIST_DIR)`: the bundled
/// `Contents/Resources/{plugins,plugins_dist}` when running from a `.app`,
/// else the repo dirs (dev / `cargo tauri dev`). `None` if neither is present.
fn plugin_dirs() -> Option<(PathBuf, PathBuf)> {
    // Bundle: <exe>/../.. = Contents → Contents/Resources/{plugins,plugins_dist}.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
            let res = contents.join("Resources");
            let plugins = res.join("plugins");
            if plugins.exists() {
                return Some((plugins, res.join("plugins_dist")));
            }
        }
    }
    // Dev: the catalog checkout (+ its sibling plugins_dist/).
    //
    // `plugins-public/plugins` comes FIRST and is why this function stopped
    // working: the probe still named `plugins/` at the repo root, the layout
    // from before the catalog moved into the `plugins-public` submodule. It
    // could no longer match anything, so this returned None,
    // MAGNIS_PLUGINS_DIST_DIR was never set, and the boot-time bundle seed
    // silently copied nothing — leaving the app serving whatever plugin UI the
    // store happened to hold, days stale. The bare `plugins` entries stay for
    // a pre-submodule checkout.
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")); // desktop/src-tauri
    for rel in [
        "../../plugins-public/plugins",
        "../../../plugins-public/plugins",
        "../../plugins",
        "../../../plugins",
    ] {
        let plugins = base.join(rel);
        if plugins.exists() {
            let canon = plugins.canonicalize().ok()?;
            let dist = canon.parent()?.join("plugins_dist");
            return Some((canon, dist));
        }
    }
    None
}
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

/// An explicit binary override, or `None` when the variable is unset.
///
/// Set-but-missing is an ERROR, never a fallthrough. The variable exists to pin
/// one specific binary, so quietly running a different one defeats its only
/// purpose — and that is the exact failure this resolver was rewritten to stop:
/// a stale binary won silently and "several demo takes ran yesterday's backend
/// that way, and nothing said so".
///
/// `agent_binary_path` already refused; `server_binary_path` fell through and
/// only noted the miss among its rejected candidates, while a comment in this
/// file claimed the two resolvers mirrored each other. They now share this.
///
/// Pure in its input so the rule is testable without touching process env,
/// which is global and would make such a test race with every other one.
///
/// @tested-by: tst_desktop_resolver_003
fn explicit_override(var: &str, raw: Option<String>) -> Result<Option<std::path::PathBuf>> {
    let Some(raw) = raw.filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let path = std::path::PathBuf::from(&raw);
    if !path.exists() {
        anyhow::bail!("{var} set to {raw} but file does not exist");
    }
    Ok(Some(path))
}

impl BackendProcessManager {
    /// Resolve path to magnis-server binary (next to current exe, or repo/desktop target dir).
    fn server_binary_path() -> Result<std::path::PathBuf> {
        // @tested-by: tst_desktop_sidecar_001, tst_desktop_resolver_003
        // @invariant: INV-17 — an EXPLICIT path wins, and the log names both
        // the winner and every candidate rejected before it.
        //
        // The old order tried the sidecar sitting next to the current
        // executable FIRST and consulted MAGNIS_SERVER_PATH LAST, so a binary
        // left over from a previous desktop build beat both the current build
        // and an explicit override — silently. Several demo takes ran
        // yesterday's backend that way, and nothing said so.
        //
        // `agent_binary_path` below already put its env var first; the two
        // resolvers disagreed while a comment claimed they mirrored each other.
        let mut rejected: Vec<String> = Vec::new();

        if let Some(p) = explicit_override(
            "MAGNIS_SERVER_PATH",
            std::env::var("MAGNIS_SERVER_PATH").ok(),
        )? {
            eprintln!("magnis-server: using {} (MAGNIS_SERVER_PATH)", p.display());
            return Ok(p);
        }

        // Dev: this worktree's own build. Preferred over a neighbour binary so
        // `cargo tauri dev` runs what was just compiled.
        {
            let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            for rel in ["../../target", "../../../target"] {
                for subdir in ["release", "debug"] {
                    let p = base.join(rel).join(subdir).join("magnis-server");
                    if p.exists() {
                        let p = p.canonicalize()?;
                        eprintln!(
                            "magnis-server: using {} (worktree target); skipped {:?}",
                            p.display(),
                            rejected
                        );
                        return Ok(p);
                    }
                    rejected.push(p.display().to_string());
                }
            }
        }

        // Packaged: the Tauri `externalBin` sidecar beside the executable.
        let current_exe =
            std::env::current_exe().context("Failed to get current executable path")?;
        let parent = current_exe
            .parent()
            .context("Executable has no parent directory")?;
        if let Some(p) = pick_existing(parent, current_target_triple(), |p| p.exists()) {
            eprintln!(
                "magnis-server: using {} (bundled sidecar); skipped {:?}",
                p.display(),
                rejected
            );
            return Ok(p);
        }
        rejected.push(format!("{}/magnis-server*", parent.display()));

        anyhow::bail!(
            "magnis-server binary not found. Tried: {rejected:?}. \
             From repo root run: cargo build -p magnis-server --release, \
             or set MAGNIS_SERVER_PATH."
        )
    }

    /// Resolve the bundled `agent-server` sidecar binary the backend will
    /// spawn (`MAGNIS_AGENT_COMMAND`). Mirrors [`Self::server_binary_path`]
    /// precedence: the Tauri `externalBin` triple-suffixed name next to the
    /// exe first, then plain. In dev builds (no bundle) fall back to the
    /// compiled `agent-server` produced by `desktop/build/bundle-agent.sh`.
    /// `MAGNIS_AGENT_SERVER_PATH` overrides everything.
    fn agent_binary_path() -> Result<std::path::PathBuf> {
        if let Some(p) = explicit_override(
            "MAGNIS_AGENT_SERVER_PATH",
            std::env::var("MAGNIS_AGENT_SERVER_PATH").ok(),
        )? {
            return Ok(p);
        }
        let current_exe =
            std::env::current_exe().context("Failed to get current executable path")?;
        let parent = current_exe
            .parent()
            .context("Executable has no parent directory")?;
        let triple = current_target_triple();
        let suffixed = parent.join(format!("agent-server-{triple}"));
        if suffixed.exists() {
            return Ok(suffixed);
        }
        let plain = parent.join("agent-server");
        if plain.exists() {
            return Ok(plain);
        }
        // Dev: desktop/src-tauri/binaries (where bundle-agent.sh writes).
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let dev_suffixed = base.join("binaries").join(format!("agent-server-{triple}"));
        if dev_suffixed.exists() {
            return Ok(dev_suffixed.canonicalize()?);
        }
        anyhow::bail!(
            "agent-server sidecar not found. Run desktop/build/bundle-agent.sh, or set \
             MAGNIS_AGENT_SERVER_PATH to a compiled binary. Expected suffixed name: \
             agent-server-{triple}"
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
        let mut cmd = Command::new(&bin);
        cmd.env("MAGNIS_DB_MODE", "local")
            .env("DB_PATH", data_root_str)
            // ONE ROOT: the backend derives its own paths from the same home
            // the shell resolved, instead of each side guessing separately.
            .env("MAGNIS_HOME", data_root_str)
            .env("STORAGE_DIR", data_root_str)
            // Desktop ships native embedded Postgres (bundled into magnis-server);
            // no PGlite sidecar. The PGlite opt-out is dev-only (not shipped).
            .env("MAGNIS_LOCAL_PG", "embedded")
            .env("PORT", port.to_string())
            // Allow the Tauri webview origins (wins over any machine .env list).
            .env("CORS_ALLOWED_ORIGINS", DESKTOP_CORS_ORIGINS)
            // Local desktop uses the Claude Code SUBSCRIPTION (engine `claude`),
            // not the cloud billable path. The release default of
            // BILLABLE_ENGINES_ONLY is `true` (forces `builtin`); turn it off
            // locally so `claude`/`codex` are allowed and `claude` is the default.
            .env("BILLABLE_ENGINES_ONLY", "false")
            .env(
                "RUST_LOG",
                std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
            )
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        // Enable first-party plugins (companies, email, telegram, …): point the
        // backend at the bundled (or repo, in dev) plugin packages so they are
        // presence-seeded at boot and the plugin store works.
        // Dev/spawn parity with the launchd contract (service/plist.rs): the
        // plugin root lives under the data root and is created by
        // `paths::ensure_plugin_tree`, and the catalog channel is a BASE url.
        // A repo checkout still wins in dev so `cargo tauri dev` keeps working
        // against the working tree instead of the installed store.
        // An explicit MAGNIS_PLUGINS_DIR from the environment wins over both
        // the bundle and the repo probe. Without this an operator cannot point
        // a packaged build at a real plugin tree — which is exactly what is
        // needed to run the shipped shell against a working catalog (sources
        // included) instead of the empty store dir the bundle ships with.
        let explicit_plugins_dir = std::env::var("MAGNIS_PLUGINS_DIR")
            .ok()
            .filter(|v| !v.is_empty());
        let probed = plugin_dirs();
        match (&explicit_plugins_dir, &probed) {
            // Explicit wins, as the comment above has always claimed. It did
            // not: the probe branch below used to run unconditionally and
            // overwrite the operator's value, so pointing a packaged shell at a
            // real catalog quietly had no effect.
            (Some(dir), probe) => {
                cmd.env("MAGNIS_PLUGINS_DIR", dir);
                // The dist dir is not derivable from an explicit plugins dir in
                // general, so take the probe's when there is one; otherwise the
                // operator sets MAGNIS_PLUGINS_DIST_DIR and it is inherited.
                if let Some((_, dist)) = probe {
                    cmd.env("MAGNIS_PLUGINS_DIST_DIR", dist);
                }
            }
            (None, Some((plugins_dir, plugins_dist))) => {
                cmd.env("MAGNIS_PLUGINS_DIR", plugins_dir)
                    .env("MAGNIS_PLUGINS_DIST_DIR", plugins_dist);
            }
            (None, None) => {
                if let Ok(dir) = crate::paths::ensure_plugin_tree(data_root) {
                    cmd.env("MAGNIS_PLUGINS_DIR", &dir);
                }
            }
        }
        // Same zero-download default as the launchd contract (plist.rs).
        // Zero-download default, unless the operator asked for a real model.
        if std::env::var("EMBEDDINGS_PROVIDER")
            .ok()
            .filter(|v| !v.is_empty())
            .is_none()
        {
            cmd.env("EMBEDDINGS_PROVIDER", "tfidf");
        }
        cmd.env(
            "MAGNIS_CATALOG_URL",
            std::env::var("MAGNIS_CATALOG_URL")
                .unwrap_or_else(|_| crate::service::plist::DEFAULT_CATALOG_URL.to_string()),
        );
        // Backend owns the agent in spawn mode too: set the gate flag +
        // the COMPLETE agent spawn spec on the backend, so it spawns +
        // supervises `agent-server` itself (both ports wired from one
        // owner). The MAGNIS_AGENT_COMMAND is the resolved sidecar path —
        // the backend never guesses it. The agent's env file / MCP proxy /
        // DEFAULT_ENGINE / PATH are forwarded from the desktop's own env
        // (set by `run-spawn.sh` in dev) so the agent reaches node + the
        // claude/codex CLI; PATH is the desktop's inherited PATH.
        Self::apply_agent_spawn_env(&mut cmd, port, data_root);
        let child = cmd.spawn().context("Failed to spawn magnis-server")?;

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

    /// Set `MAGNIS_BACKEND_OWNS_AGENT=1` + the COMPLETE agent spawn spec on
    /// the backend command (spawn mode). The backend reads these and spawns
    /// + supervises `agent-server` itself, owning both ports.
    ///
    /// NO FALLBACK: the gate is enabled ONLY when every required input is
    /// available — the resolved agent-server path AND `MAGNIS_ENV_FILE`
    /// (the agent requires an env file; the supervisor filters out
    /// `*_API_KEY` before the agent loads it). If either is missing the gate
    /// stays OFF and the reason is logged, rather than spawning a broken
    /// agent that crash-loops.
    fn apply_agent_spawn_env(cmd: &mut Command, backend_port: u16, data_root: &std::path::Path) {
        let agent_command = match Self::agent_binary_path() {
            Ok(p) => p,
            Err(e) => {
                eprintln!(
                    "[backend-owns-agent] not enabling: agent-server not found ({e}). \
                     The backend will run without the agent."
                );
                return;
            }
        };
        // Default to the same path the launchd contract uses. Bailing out here
        // meant the agent silently never spawned in spawn mode — nothing sets
        // this var outside the plist — and the app showed "No agents available
        // — the agent runtime is not reachable" with no other clue. The file
        // itself is optional: the supervisor treats an absent one as empty.
        let env_file = match std::env::var("MAGNIS_ENV_FILE") {
            Ok(v) if !v.is_empty() => v,
            _ => data_root.join("magnis.env").to_string_lossy().into_owned(),
        };
        let mcp_proxy = std::env::var("MAGNIS_MCP_PROXY_PATH")
            .ok()
            .unwrap_or_else(|| {
                // Dev fallback to the repo proxy path is acceptable here because
                // the suffix is a FIXED, known repo artifact (not a guessed
                // value): desktop/src-tauri/../../agent/src/mcp-stdio-proxy.mjs.
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../../agent/src/mcp-stdio-proxy.mjs")
                    .to_string_lossy()
                    .into_owned()
            });
        let default_engine =
            std::env::var("DEFAULT_ENGINE").unwrap_or_else(|_| "claude".to_string());
        let agent_port = std::env::var("AGENT_PORT").unwrap_or_else(|_| "3002".to_string());
        // Same PATH the launchd contract builds — asked from the login shell so
        // the agent finds `claude`/`codex` wherever the user installed them.
        // Inheriting the GUI process's PATH is not enough: a Finder launch
        // never sources the shell profile, so a perfectly good Claude Code
        // install reported "Not logged in" simply because it was invisible.
        let path = crate::service::plist::agent_path(
            &dirs::home_dir().unwrap_or_default(),
            &std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(std::path::Path::to_path_buf))
                .unwrap_or_default(),
        );

        cmd.env("MAGNIS_BACKEND_OWNS_AGENT", "1")
            .env("MAGNIS_AGENT_COMMAND", &agent_command)
            .env("AGENT_PORT", &agent_port)
            .env("AGENT_HOST", "127.0.0.1")
            .env("BACKEND_URL", format!("http://127.0.0.1:{backend_port}"))
            .env("MAGNIS_ENV_FILE", &env_file)
            .env("DEFAULT_ENGINE", &default_engine)
            .env("MAGNIS_MCP_PROXY_PATH", &mcp_proxy)
            .env("PATH", &path)
            // The backend's own AGENT_URL must match AGENT_PORT (same number)
            // so frontend→backend→agent proxying hits the live agent.
            .env("AGENT_URL", format!("http://127.0.0.1:{agent_port}"));
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

    /// tst_desktop_resolver_003 — an explicit override that points nowhere is
    /// an ERROR, for BOTH sidecars.
    ///
    /// The variable exists to pin one specific binary. Falling through to the
    /// next candidate defeats its only purpose and reintroduces exactly the
    /// failure this resolver was rewritten to stop: "several demo takes ran
    /// yesterday's backend that way, and nothing said so".
    ///
    /// `agent_binary_path` already refused; `server_binary_path` fell through
    /// and merely noted the miss in its rejected list — while a comment in the
    /// same file claimed the two resolvers mirrored each other.
    #[test]
    fn tst_desktop_resolver_003_missing_explicit_override_is_an_error() {
        let here = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");

        assert!(
            explicit_override("MAGNIS_SERVER_PATH", None)
                .expect("unset is not an error")
                .is_none(),
            "an unset override yields no candidate"
        );

        let found = explicit_override("MAGNIS_SERVER_PATH", Some(here.display().to_string()))
            .expect("an existing path is accepted");
        assert_eq!(found.as_deref(), Some(here.as_path()));

        let err = explicit_override(
            "MAGNIS_SERVER_PATH",
            Some("/nowhere/magnis-server".to_string()),
        )
        .expect_err("a missing explicit path must not fall through");
        let text = err.to_string();
        assert!(text.contains("MAGNIS_SERVER_PATH"), "names the variable: {text}");
        assert!(text.contains("/nowhere/magnis-server"), "names the path: {text}");
    }

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
