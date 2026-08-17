//! Spawns the magnis-server binary as a child process and manages its lifecycle.
//! The frontend connects to the server via HTTP (RPC) at the returned base URL.
//!
//! Server-mode contract: the SHELL owns the PostgreSQL cluster and hands the
//! backend a `DATABASE_URL` (DEC-18). The backend no longer owns a database,
//! a data-dir lock or a JWT secret — those moved here with the cluster.
//!
//! Deliberately NOT `MAGNIS_DB_MODE=local`: that branch reads an injected
//! `DATABASE_URL` as "a harness already applied the schema" and runs no
//! migrations, so the app would boot against an empty database.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

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
/// The directory `scripts/build-backend.sh` stages the backend payload into,
/// relative to the resource root. Declared in `tauri.conf.json` twice — as the
/// staging argument and as a bundle resource glob — and asserted equal to this
/// constant by `tst_desktop_serverbuild_001`.
pub const PAYLOAD_SUBDIR: &str = "binaries";

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
        // @tested-by: tst_desktop_resolver_003
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

        // The dev-target probe that used to sit here is DELETED (DEC-30). It
        // looked in `<repo>/target/{release,debug}/magnis-server` BEFORE the
        // sidecar — and that path holds the RUST backend, which this branch no
        // longer builds or ships. Once the sidecar became the compiled
        // TypeScript backend, any machine that had ever built the Rust one
        // silently ran it instead, against the shell's cluster, and succeeded.
        // That is verbatim the failure `explicit_override` above exists to
        // stop. One producer, one location: `scripts/build-backend.sh` stages
        // the sidecar for dev and packaging alike.

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
             From the repo root run: bash scripts/build-backend.sh \
             desktop/src-tauri/binaries, or set MAGNIS_SERVER_PATH."
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
    /// Spawn magnis-server in Local mode against `data_root` and wait for `/health`.
    ///
    /// Local-mode env contract (see `docs/deployment/local.md`):
    /// The database contract is in [`apply_database_env`], which is where it
    /// is also asserted; the rest of the child's environment is set below.
    /// Compose the command the backend child is spawned with — every variable,
    /// no side effects.
    ///
    /// Split out from [`Self::start`] so the child's environment can be
    /// asserted without a running process. That is not a stylistic
    /// preference: the one shipped boot-stopper on this branch was a
    /// *missing* variable, invisible to any test that could not enumerate
    /// what `start` sets.
    fn build_child_command(
        bin: &std::path::Path,
        data_root: &std::path::Path,
        port: u16,
        database_url: &str,
        runtime_root: &std::path::Path,
    ) -> Result<Command> {
        // Server mode means the backend refuses to invent a signing secret —
        // "no derivation, no random fallback". Ownership moved here with the
        // database, so the shell supplies it or nothing boots.
        let jwt_secret = crate::paths::ensure_jwt_secret(data_root)?;
        let data_root_str = data_root
            .to_str()
            .context("Data root path is not valid UTF-8")?;
        let mut cmd = Command::new(bin);
        // SERVER mode against the cluster the SHELL owns (DEC-18). Not `local`:
        // that branch treats an injected DATABASE_URL as "a harness already
        // applied the schema" and runs NO migrations, so the app would boot on
        // an empty database. `DB_PATH` and `MAGNIS_LOCAL_PG` are retired for
        // the same reason they are no longer true — the backend does not own a
        // database any more, and `MAGNIS_LOCAL_PG` under server mode is not
        // merely unused: the backend throws on it.
        // Where `data/` and `migrations/` actually are. A compiled bun binary
        // resolves `import.meta.url` to the virtual `/$bunfs` filesystem, so
        // the backend cannot find them by looking near itself — the launcher
        // must say where they are.
        //
        // NOT derived from the binary's own directory, which is only right in
        // development. A packaged Linux app puts the sidecar in `/usr/bin` and
        // the payload in `/usr/lib/<product>`; measured from a built `.deb`.
        // The caller passes the resource root, which is the one path that is
        // correct in both.
        let runtime_root = runtime_root
            .to_str()
            .context("Runtime root is not valid UTF-8")?;
        apply_database_env(&mut cmd, data_root_str, database_url, &jwt_secret)
            .env("MAGNIS_RUNTIME_ROOT", runtime_root)
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
            crate::paths::catalog_url(std::env::var("MAGNIS_CATALOG_URL").ok()),
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
        Ok(cmd)
    }

    pub fn start(
        data_root: &std::path::Path,
        port: u16,
        database_url: &str,
        runtime_root: &std::path::Path,
    ) -> Result<Self> {
        // Server mode means the backend refuses to invent a signing secret —
        // "no derivation, no random fallback". Ownership moved here with the
        // database, so the shell supplies it or nothing boots.
        let bin = Self::server_binary_path()?;
        let mut cmd = Self::build_child_command(&bin, data_root, port, database_url, runtime_root)?;

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
        // Default to the file the data root owns. Bailing out here meant the
        // agent silently never spawned in spawn mode — nothing else sets this
        // var — and the app showed "No agents available" with no other clue.
        //
        // It is PROVISIONED, not merely named. The previous comment here said
        // "the file itself is optional: the supervisor treats an absent one as
        // empty", and that is false against this backend: naming a file that
        // does not exist makes it exit 64 before serving anything. An empty
        // file means the same thing and is a file.
        let env_file = match std::env::var("MAGNIS_ENV_FILE") {
            Ok(v) if !v.is_empty() => v,
            _ => match crate::paths::ensure_env_file(data_root) {
                Ok(p) => p.to_string_lossy().into_owned(),
                Err(e) => {
                    eprintln!("[backend-owns-agent] not enabling: {e:#}");
                    return;
                }
            },
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
        let path = crate::paths::agent_path(
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

// `pick_port()` lived here and picked nothing: it returned MAGNIS_BACKEND_PORT
// or a hard-coded default, bound nothing, and so could not tell a busy port
// from a free one. Replaced by `ports::bind_port`, which reserves before
// handing over (DEC-2).

/// The database half of the child contract, in one place so it can be asserted
/// as a whole.
///
/// It was inline, and the cost of that was concrete: the switch to server mode
/// silently transferred ownership of the JWT secret from the backend to the
/// shell, the shell never took it, and no test could see the gap because there
/// was nothing to look at. Three reviewers found it by reading; a test should
/// have.
pub fn apply_database_env<'a>(
    cmd: &'a mut Command,
    data_root: &str,
    database_url: &str,
    jwt_secret: &str,
) -> &'a mut Command {
    cmd.env("MAGNIS_DB_MODE", "server")
        .env("DATABASE_URL", database_url)
        // Server mode refuses to derive or invent a signing secret, so this key
        // is the difference between an app that boots and one that does not.
        .env("AUTH_JWT_SECRET", jwt_secret)
        .env("MAGNIS_HOME", data_root)
        .env("STORAGE_DIR", data_root)
        // Retired with the local branch, and not merely unused: the backend
        // THROWS on MAGNIS_LOCAL_PG under server mode, so an inherited value
        // from an operator shell would stop the app booting.
        .env_remove("MAGNIS_LOCAL_PG")
        .env_remove("DB_PATH")
}

/// What the shell owns: the backend child and the cluster it talks to.
///
/// This was a two-arm enum whose second arm existed only for the launchd
/// service path. DEC-1 removed that path, so the choice is gone and the type
/// says so — a single-arm enum would have been ceremony.
pub struct BackendHandle {
    manager: Box<BackendProcessManager>,
    cluster: Box<crate::postgres::PostgresHandle>,
}

impl BackendHandle {
    pub fn spawned(
        manager: BackendProcessManager,
        cluster: crate::postgres::PostgresHandle,
    ) -> Self {
        Self {
            manager: Box::new(manager),
            cluster: Box::new(cluster),
        }
    }

    pub fn base_url(&self) -> &str {
        self.manager.base_url()
    }

    /// Ordered teardown, and the order is the invariant: the child must be gone
    /// before the database it is connected to goes away. The reverse hands the
    /// backend connection errors on its way out (DEC-9).
    pub fn stop(&mut self) {
        self.manager.stop();
        self.cluster.stop();
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

    // @test-id: tst_desktop_boot_001
    // @invariant: INV-DTR-16, INV-DTR-18
    // @covers: PostgresHandle::start + BackendProcessManager::start, end to end
    // @deterministic: yes, but requires a staged sidecar — hence `ignore`
    //
    // The only test that answers the question the others merely approach: does
    // the environment this shell composes actually boot the real backend?
    // Every other assertion here is about the *shape* of that environment, and
    // the round-1 boot-stopper proved a well-shaped environment can still be
    // missing the one variable that matters.
    //
    // Ignored by default because it needs `scripts/build-backend.sh` to have
    // run and it starts a real PostgreSQL cluster. Run it deliberately:
    //
    //   bash scripts/build-backend.sh desktop/src-tauri/binaries
    //   cd desktop/src-tauri && cargo test tst_desktop_boot_001 -- --ignored --nocapture
    #[test]
    #[ignore = "needs a staged backend sidecar; starts a real PostgreSQL cluster"]
    fn tst_desktop_boot_001_the_composed_environment_boots_the_real_backend() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let data_root = tmp.path();

        let pg_port = crate::ports::bind_port("postgres", None)
            .expect("bind a postgres port")
            .release();
        let cluster =
            crate::postgres::PostgresHandle::start(data_root, pg_port).expect("start PostgreSQL");

        let backend_port = crate::ports::bind_port("backend", None)
            .expect("bind a backend port")
            .release();

        // The payload lives beside the staged sidecar, which is where
        // `build-backend.sh` puts it and where `tauri-build` copies it.
        let runtime_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(PAYLOAD_SUBDIR);
        assert!(
            runtime_root.join("migrations").is_dir(),
            "run scripts/build-backend.sh first: {} has no migrations/",
            runtime_root.display()
        );

        // The resolver looks beside `current_exe()`, which under `cargo test`
        // is `target/debug/deps`. `MAGNIS_SERVER_PATH` is the documented
        // override and is what points it at the staged sidecar.
        let sidecar = runtime_root.join(format!("magnis-server-{}", current_target_triple()));
        assert!(
            sidecar.is_file(),
            "run scripts/build-backend.sh first: no {}",
            sidecar.display()
        );
        // SAFETY: single-threaded test; no other thread reads the environment
        // while this runs.
        std::env::set_var("MAGNIS_SERVER_PATH", &sidecar);

        let mut manager = BackendProcessManager::start(
            data_root,
            backend_port,
            &cluster.database_url(),
            &runtime_root,
        )
        .expect("the backend must become healthy with the environment the shell composes");

        // `start` returns only after /health answers, so reaching here means
        // the child booted, ran its migrations against the shell's cluster and
        // served a request.
        assert_eq!(manager.port(), backend_port);
        manager.stop();
    }

    // @test-id: tst_desktop_payloaddir_001
    // @invariant: INV-DTR-25
    // @covers: backend_process::PAYLOAD_SUBDIR vs tauri.conf.json
    // @deterministic: yes
    //
    // The subdirectory name exists twice — compiled into the shell, and written
    // in the bundler's config — and nothing connects them. A rename on either
    // side produces an app that starts, finds no payload, and says nothing.
    #[test]
    fn tst_desktop_payloaddir_001_the_compiled_name_matches_the_bundled_one() {
        let raw = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"),
        )
        .expect("tauri.conf.json");
        let conf: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

        let server = conf["bundle"]["externalBin"]
            .as_array()
            .expect("externalBin")
            .iter()
            .filter_map(|v| v.as_str())
            .find(|e| e.contains("magnis-server"))
            .expect("the backend sidecar");
        assert_eq!(
            std::path::Path::new(server)
                .parent()
                .and_then(|p| p.to_str()),
            Some(PAYLOAD_SUBDIR),
            "the shell looks under {PAYLOAD_SUBDIR}/ inside the resource root; \
             the bundler stages the sidecar somewhere else"
        );
    }

    // @test-id: tst_desktop_childenv_002
    // @invariant: INV-DTR-16
    // @covers: BackendProcessManager::build_child_command
    // @deterministic: yes
    //
    // The COMPLETE child environment, not the database subset. Round 1 shipped a
    // boot-stopper — `AUTH_JWT_SECRET` unset — that no test could see, because
    // every test asserted the variables someone had remembered to think about.
    // This enumerates what `start` actually sets, so the next omission fails
    // here instead of on a user's machine with no window and no console.
    #[test]
    fn tst_desktop_childenv_002_the_whole_spawn_environment_is_present() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let bin = tmp.path().join("staged").join("magnis-server-test");
        std::fs::create_dir_all(bin.parent().expect("parent")).expect("mkdir");
        // The payload root is NOT the binary's directory — a packaged Linux
        // app splits them (`/usr/bin` vs `/usr/lib/<product>`), so the test
        // passes a distinct path and asserts the distinct path comes back.
        let runtime_root = tmp.path().join("resources").join(PAYLOAD_SUBDIR);
        let cmd = BackendProcessManager::build_child_command(
            &bin,
            tmp.path(),
            3010,
            "postgres://127.0.0.1:5599/magnis",
            &runtime_root,
        )
        .expect("compose the child command");

        let envs: std::collections::HashMap<_, _> = cmd.get_envs().collect();
        let get = |k: &str| {
            envs.get(std::ffi::OsStr::new(k))
                .and_then(|v| v.as_ref())
                .map(|v| v.to_string_lossy().into_owned())
        };

        // Fatal by absence — each of these has a documented failure mode.
        assert_eq!(get("MAGNIS_DB_MODE").as_deref(), Some("server"));
        assert_eq!(
            get("DATABASE_URL").as_deref(),
            Some("postgres://127.0.0.1:5599/magnis")
        );
        assert!(
            get("AUTH_JWT_SECRET").is_some_and(|v| !v.is_empty()),
            "the backend throws in server mode without it — this is the round-1 bug"
        );
        assert_eq!(get("PORT").as_deref(), Some("3010"));
        assert!(
            get("CORS_ALLOWED_ORIGINS").is_some_and(|v| !v.is_empty()),
            "dropping this is the recorded cause of the packaged app's Load failed"
        );

        // The staged payload lives beside the binary, and a compiled bun binary
        // cannot find it by looking near itself.
        assert_eq!(
            get("MAGNIS_RUNTIME_ROOT").map(std::path::PathBuf::from),
            Some(runtime_root.clone()),
            "the launcher must point at the payload, not at the sidecar"
        );
        assert_ne!(
            get("MAGNIS_RUNTIME_ROOT").map(std::path::PathBuf::from),
            bin.parent().map(std::path::Path::to_path_buf),
            "deriving the payload root from the binary is exactly the bug a built \
             .deb exposed: the sidecar is in /usr/bin and the payload is not"
        );

        // One root, both names.
        let root = tmp.path().to_string_lossy().into_owned();
        assert_eq!(get("MAGNIS_HOME").as_deref(), Some(root.as_str()));
        assert_eq!(get("STORAGE_DIR").as_deref(), Some(root.as_str()));

        // Retired, and not merely unused: the backend throws on MAGNIS_LOCAL_PG
        // under server mode. Asserted as an explicit removal, so inheriting one
        // from the desktop's own environment cannot pass.
        for retired in ["DB_PATH", "MAGNIS_LOCAL_PG"] {
            assert_eq!(
                envs.get(std::ffi::OsStr::new(retired)),
                Some(&None),
                "{retired} must be explicitly REMOVED, not merely unset"
            );
        }

        // A model download on first run is a startup hang, not a preference.
        assert!(
            get("EMBEDDINGS_PROVIDER").is_some() || std::env::var("EMBEDDINGS_PROVIDER").is_ok(),
            "unset means the backend downloads a model on first run"
        );
    }

    // @test-id: tst_desktop_childenv_001
    // @invariant: INV-DTR-16
    // @covers: backend_process::apply_database_env
    // @deterministic: yes
    //
    // The test that should have caught a shipped boot-stopper. Switching the
    // child to server mode moved ownership of the JWT secret to the shell; the
    // shell did not take it, and nothing here could see that, because the
    // contract was inline in a 200-line spawn function with no seam.
    #[test]
    fn tst_desktop_childenv_001_the_database_contract_is_complete() {
        use std::collections::HashMap;

        let mut cmd = Command::new("/bin/true");
        // Prove the retirement is a REMOVAL, not an omission: set both first.
        cmd.env("MAGNIS_LOCAL_PG", "embedded")
            .env("DB_PATH", "/old");
        apply_database_env(
            &mut cmd,
            "/data/root",
            "postgresql://x@127.0.0.1:5599/magnis",
            "s3cret",
        );

        let envs: HashMap<String, Option<String>> = cmd
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();

        assert_eq!(envs.get("MAGNIS_DB_MODE"), Some(&Some("server".into())));
        assert_eq!(
            envs.get("DATABASE_URL"),
            Some(&Some("postgresql://x@127.0.0.1:5599/magnis".into()))
        );
        assert_eq!(
            envs.get("AUTH_JWT_SECRET"),
            Some(&Some("s3cret".into())),
            "server mode refuses to invent one — without this the app never boots"
        );
        assert_eq!(envs.get("MAGNIS_HOME"), Some(&Some("/data/root".into())));
        assert_eq!(envs.get("STORAGE_DIR"), Some(&Some("/data/root".into())));

        // `None` is how Command records a REMOVAL, which is what these must be:
        // an inherited MAGNIS_LOCAL_PG makes the backend throw under server mode.
        assert_eq!(
            envs.get("MAGNIS_LOCAL_PG"),
            Some(&None),
            "must be removed from the child, not merely left unset here"
        );
        assert_eq!(envs.get("DB_PATH"), Some(&None));
    }

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
        assert!(
            text.contains("MAGNIS_SERVER_PATH"),
            "names the variable: {text}"
        );
        assert!(
            text.contains("/nowhere/magnis-server"),
            "names the path: {text}"
        );
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
