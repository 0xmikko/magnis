//! Pure launchd plist generation + bundle-path resolution for the macOS
//! background services. No IO, no platform calls — every function here is a
//! deterministic string/path transform, so the unit tests run on any host.
//!
//! ONE service is described now (`docs/plans/local-agent-supervision.md`):
//! `com.magnis.backend` runs the bundled `magnis-server`, which owns its
//! embedded PostgreSQL child AND — gated on `MAGNIS_BACKEND_OWNS_AGENT=1` —
//! spawns + supervises the bundled `agent-server` itself (so both ports are
//! wired from one owner and can't desync). The separate `com.magnis.agent`
//! launchd service is removed. Plists carry ONLY non-secret env
//! (DEC-7/INV-3); secrets live in the bundled `magnis.env` that
//! `MAGNIS_ENV_FILE` points at — AND the backend filters every `*_API_KEY`
//! out of that file before the agent loads it (subscription-only).

use std::path::{Path, PathBuf};

/// launchd Label for the backend service.
pub const BACKEND_LABEL: &str = "com.magnis.backend";
/// launchd Label for the legacy standalone agent service. The backend now
/// owns the agent (`MAGNIS_BACKEND_OWNS_AGENT`), so this service is NO
/// LONGER installed — the constant is retained only so the install path
/// can boot out + delete any stale plist left by an older install
/// (migration cleanup).
pub const LEGACY_AGENT_LABEL: &str = "com.magnis.agent";
/// Fixed backend HTTP port (matches `backend_process::DEFAULT_PORT`).
pub const BACKEND_PORT: u16 = 3765;
/// Fixed agent HTTP port (the backend wires both ends).
pub const AGENT_PORT: u16 = 3002;

/// Rendered inputs for one LaunchAgent. Pure data.
#[derive(Debug, Clone)]
pub struct ServiceSpec {
    pub label: String,
    /// Absolute path to the executable launchd runs.
    pub program: PathBuf,
    /// Ordered, non-secret env vars rendered into `EnvironmentVariables`.
    pub env: Vec<(String, String)>,
    pub stdout_path: PathBuf,
    pub stderr_path: PathBuf,
    /// Opaque content stamp (app version) — rendered as a comment so a version
    /// bump changes the plist body and triggers a re-bootstrap (INV-4).
    pub stamp: String,
}

/// Paths needed to build both specs, resolved from the running bundle.
#[derive(Debug, Clone)]
pub struct ServiceLayout {
    /// `Magnis.app/Contents/MacOS` — where Tauri drops externalBin sidecars.
    pub macos_dir: PathBuf,
    /// `Magnis.app/Contents/Resources` — where `magnis.env` is bundled.
    pub resources_dir: PathBuf,
    /// Backend data root (`~/Library/Application Support/com.magnis.desktop`).
    pub data_root: PathBuf,
    /// Directory for service stdout/stderr logs.
    pub logs_dir: PathBuf,
    /// User home directory — used to build the agent `PATH` so the
    /// supervised `agent-server` can reach `node` and `claude`/`codex`
    /// (which live under `~/.bun/bin`, `~/.local/bin`). launchd plists
    /// can't expand `$HOME`, so it is resolved into an absolute PATH here.
    pub home_dir: PathBuf,
    /// App version, used as the plist content stamp.
    pub version: String,
}

/// `Magnis.app` bundle layout resolved from the main executable path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundlePaths {
    pub bundle_root: PathBuf,
    pub macos_dir: PathBuf,
    pub resources_dir: PathBuf,
}

/// Resolve the `.app` layout from the desktop main exe path
/// (`Magnis.app/Contents/MacOS/magnis-desktop`). Returns `None` if the path is
/// too shallow to be a bundle exe.
pub fn bundle_paths_from_exe(exe: &Path) -> Option<BundlePaths> {
    let macos_dir = exe.parent()?; // Contents/MacOS
    let contents = macos_dir.parent()?; // Contents
    let bundle_root = contents.parent()?; // Magnis.app
    Some(BundlePaths {
        bundle_root: bundle_root.to_path_buf(),
        macos_dir: macos_dir.to_path_buf(),
        resources_dir: contents.join("Resources"),
    })
}

/// Absolute path to a bundled externalBin sidecar next to the main exe.
///
/// IMPORTANT: Tauri **strips the target-triple suffix** when bundling
/// `externalBin` into the `.app` — the source `binaries/magnis-server-<triple>`
/// lands at `Contents/MacOS/magnis-server` (plain). launchd must point at the
/// plain name, or it cannot find the executable (`runs = 0`). Regression:
/// `tst_desktop_paths_001` / `tst_desktop_plist_001`.
pub fn sidecar_path(macos_dir: &Path, name: &str) -> PathBuf {
    macos_dir.join(name)
}

/// Path to the bundled secrets file (`Contents/Resources/magnis.env`).
/// The optional operator env file. It lives under the WRITABLE data root, not
/// in the app bundle: the supervisor writes its filtered twin next to the
/// source (`.magnis.env.agent-filtered`), and `Contents/Resources` inside an
/// installed `.app` is not writable. It need not exist — an absent file means
/// "no baked config", which the supervisor treats as empty.
pub fn env_file_path(data_root: &Path) -> PathBuf {
    data_root.join("magnis.env")
}

/// Is the bundle installed under `/Applications`? Services reference absolute
/// in-bundle paths, so running from the DMG (`/Volumes/...`) or a translocated
/// quarantine path is refused (DEC-16/INV-14).
pub fn is_under_applications(bundle_root: &Path) -> bool {
    bundle_root.starts_with("/Applications")
}

/// Build the `PATH` the backend hands the supervised `agent-server`. It
/// must reach `node` + the MCP stdio proxy, the `claude`/`codex` CLI
/// (subscription login state), and the bundled connector sidecars. launchd
/// can't expand `$HOME`, so we resolve the user paths into absolutes here.
/// Order mirrors `desktop/run-spawn.sh`: user bins first, then Homebrew,
/// then the bundle's `MacOS` dir (connectors), then the system minimum.
pub fn agent_path(home_dir: &Path, macos_dir: &Path) -> String {
    let parts = [
        home_dir.join(".local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        home_dir.join(".bun/bin"),
        macos_dir.to_path_buf(),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/usr/sbin"),
        PathBuf::from("/sbin"),
    ];
    parts
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":")
}

/// Build the backend service spec from the resolved layout.
///
/// The backend OWNS the agent now: the plist sets
/// `MAGNIS_BACKEND_OWNS_AGENT=1` plus the COMPLETE agent spawn spec
/// (command, ports, `BACKEND_URL`, env file, default engine, MCP proxy,
/// PATH). The backend reads these and spawns + supervises `agent-server`
/// itself — wiring both ports from one place so they can't desync. Never
/// any `*_API_KEY` here (subscription-only).
/// The public plugin catalog channel: the `catalog` branch of the plugins
/// repo, served raw. A BASE url — never suffixed with `index.json`.
pub const DEFAULT_CATALOG_URL: &str = "https://raw.githubusercontent.com/0xmikko/magnis/catalog";

pub fn backend_spec(l: &ServiceLayout) -> ServiceSpec {
    backend_spec_with_catalog(l, None)
}

/// `backend_spec` with an explicit channel override — an operator env var, a
/// fork, or a `file://` mirror in tests. `None` uses [`DEFAULT_CATALOG_URL`].
pub fn backend_spec_with_catalog(l: &ServiceLayout, catalog_override: Option<&str>) -> ServiceSpec {
    let catalog_url = catalog_override.unwrap_or(DEFAULT_CATALOG_URL);
    let env_file = env_file_path(&l.data_root);
    ServiceSpec {
        label: BACKEND_LABEL.to_string(),
        program: sidecar_path(&l.macos_dir, "magnis-server"),
        env: vec![
            ("MAGNIS_DB_MODE".into(), "local".into()),
            ("DB_PATH".into(), l.data_root.to_string_lossy().into_owned()),
            (
                "STORAGE_DIR".into(),
                l.data_root.to_string_lossy().into_owned(),
            ),
            ("PORT".into(), BACKEND_PORT.to_string()),
            ("AGENT_URL".into(), format!("http://127.0.0.1:{AGENT_PORT}")),
            (
                "CORS_ALLOWED_ORIGINS".into(),
                crate::backend_process::DESKTOP_CORS_ORIGINS.into(),
            ),
            // Local desktop uses the Claude Code SUBSCRIPTION (engine `claude`),
            // not the cloud billable path — disable the billable-only gate so
            // `claude`/`codex` are allowed locally (release default is `true`).
            ("BILLABLE_ENGINES_ONLY".into(), "false".into()),
            // Plugins are NOT bundled — they are installed from the catalog
            // channel into the store under the data root. The dir must still
            // EXIST and be canonicalizable: `build_plugin_installer` returns
            // None without `MAGNIS_PLUGINS_DIR`, and without an installer
            // `extensions.install` cannot run at all. `paths` creates it.
            // MAGNIS_PLUGINS_DIST_DIR is intentionally absent: bootstrap
            // derives the `plugins_dist` sibling and no-ops when missing.
            (
                "MAGNIS_PLUGINS_DIR".into(),
                l.data_root.join("plugins").to_string_lossy().into_owned(),
            ),
            // The catalog channel is a BASE url — `remote_catalog::fetch_bytes`
            // appends `index.json` / `packages/...` itself, so a URL ending in
            // `/index.json` here would produce `.../index.json/index.json`.
            ("MAGNIS_CATALOG_URL".into(), catalog_url.to_string()),
            // Boot must never download. The backend's default embedding
            // provider is FastEmbed multilingual-e5-small — ~500 MB fetched
            // from HuggingFace during startup, which no fresh machine can
            // finish inside the health budget. Start on the zero-download
            // keyword index; setup offers the heavier models explicitly, with
            // their size shown and their download visible.
            ("EMBEDDINGS_PROVIDER".into(), "tfidf".into()),
            ("RUST_LOG".into(), "info".into()),
            (
                "MAGNIS_ENV_FILE".into(),
                env_file.to_string_lossy().into_owned(),
            ),
            // ── Backend-owns-agent: the COMPLETE agent spawn spec ──────
            ("MAGNIS_BACKEND_OWNS_AGENT".into(), "1".into()),
            (
                "MAGNIS_AGENT_COMMAND".into(),
                sidecar_path(&l.macos_dir, "agent-server")
                    .to_string_lossy()
                    .into_owned(),
            ),
            ("AGENT_PORT".into(), AGENT_PORT.to_string()),
            ("AGENT_HOST".into(), "127.0.0.1".into()),
            (
                "BACKEND_URL".into(),
                format!("http://127.0.0.1:{BACKEND_PORT}"),
            ),
            ("DEFAULT_ENGINE".into(), "claude".into()),
            (
                "MAGNIS_MCP_PROXY_PATH".into(),
                l.resources_dir
                    .join("mcp-stdio-proxy.mjs")
                    .to_string_lossy()
                    .into_owned(),
            ),
            ("PATH".into(), agent_path(&l.home_dir, &l.macos_dir)),
        ],
        stdout_path: l.logs_dir.join("magnis-backend.out.log"),
        stderr_path: l.logs_dir.join("magnis-backend.err.log"),
        stamp: l.version.clone(),
    }
}

/// Minimal XML text escape for plist string values.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Render a launchd plist (XML) for `spec`, with `RunAtLoad` + `KeepAlive`
/// true. Deterministic: env order follows `spec.env`.
pub fn render_plist(spec: &ServiceSpec) -> String {
    let mut env_block = String::new();
    for (k, v) in &spec.env {
        env_block.push_str(&format!(
            "        <key>{}</key>\n        <string>{}</string>\n",
            xml_escape(k),
            xml_escape(v),
        ));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- magnis-stamp: {stamp} -->
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{program}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
{env_block}    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{stdout}</string>
    <key>StandardErrorPath</key>
    <string>{stderr}</string>
</dict>
</plist>
"#,
        stamp = xml_escape(&spec.stamp),
        label = xml_escape(&spec.label),
        program = xml_escape(&spec.program.to_string_lossy()),
        env_block = env_block,
        stdout = xml_escape(&spec.stdout_path.to_string_lossy()),
        stderr = xml_escape(&spec.stderr_path.to_string_lossy()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_layout() -> ServiceLayout {
        ServiceLayout {
            macos_dir: PathBuf::from("/Applications/Magnis.app/Contents/MacOS"),
            resources_dir: PathBuf::from("/Applications/Magnis.app/Contents/Resources"),
            data_root: PathBuf::from("/Users/x/Library/Application Support/com.magnis.desktop"),
            logs_dir: PathBuf::from("/Users/x/Library/Application Support/com.magnis.desktop/logs"),
            home_dir: PathBuf::from("/Users/x"),
            version: "0.1.0".into(),
        }
    }

    // @test-id: tst_desktop_plist_001  @invariant: INV-1, INV-2
    // The ONE service plist (com.magnis.backend) now carries the flag +
    // the COMPLETE agent spawn spec — the backend owns the agent. There is
    // no separate com.magnis.agent plist anymore.
    #[test]
    fn tst_desktop_plist_001_backend_plist_owns_agent() {
        let l = fixture_layout();

        let backend = render_plist(&backend_spec(&l));
        assert!(backend.contains("<string>com.magnis.backend</string>"));
        // PLAIN name — Tauri strips the triple suffix when bundling externalBin.
        // A suffixed path here is the bug that left launchd with runs=0.
        assert!(backend
            .contains("<string>/Applications/Magnis.app/Contents/MacOS/magnis-server</string>"));
        assert!(
            !backend.contains("magnis-server-"),
            "program path must NOT carry the triple suffix (Tauri strips it)"
        );
        assert!(backend.contains("<key>RunAtLoad</key>\n    <true/>"));
        assert!(backend.contains("<key>KeepAlive</key>\n    <true/>"));
        for key in [
            "MAGNIS_DB_MODE",
            "DB_PATH",
            "STORAGE_DIR",
            "PORT",
            "AGENT_URL",
            "CORS_ALLOWED_ORIGINS",
            "MAGNIS_PLUGINS_DIR",
            "MAGNIS_CATALOG_URL",
            "RUST_LOG",
            "MAGNIS_ENV_FILE",
        ] {
            assert!(
                backend.contains(&format!("<key>{key}</key>")),
                "backend missing {key}"
            );
        }

        // The gate flag + the COMPLETE agent spawn spec live on THIS plist.
        assert!(backend.contains("<key>MAGNIS_BACKEND_OWNS_AGENT</key>"));
        assert!(backend.contains("<string>1</string>"));
        for (k, v) in [
            (
                "MAGNIS_AGENT_COMMAND",
                "/Applications/Magnis.app/Contents/MacOS/agent-server",
            ),
            ("AGENT_PORT", "3002"),
            ("AGENT_HOST", "127.0.0.1"),
            ("BACKEND_URL", "http://127.0.0.1:3765"),
            ("DEFAULT_ENGINE", "claude"),
            (
                "MAGNIS_MCP_PROXY_PATH",
                "/Applications/Magnis.app/Contents/Resources/mcp-stdio-proxy.mjs",
            ),
        ] {
            assert!(
                backend.contains(&format!("<key>{k}</key>")),
                "backend missing agent-spec key {k}"
            );
            assert!(
                backend.contains(&format!("<string>{v}</string>")),
                "backend missing agent-spec val {v} (for {k})"
            );
        }
        // The agent-server command path must NOT carry the triple suffix.
        assert!(
            !backend.contains("agent-server-"),
            "agent command must be the plain name (Tauri strips the suffix)"
        );
        // PATH reaches node/claude (~/.bun/bin, ~/.local/bin), Homebrew, and
        // the bundle's connector sidecars (MacOS dir).
        assert!(backend.contains("<key>PATH</key>"));
        assert!(backend.contains("/Users/x/.bun/bin"));
        assert!(backend.contains("/Users/x/.local/bin"));
        assert!(backend.contains("/opt/homebrew/bin"));
        assert!(backend.contains("/Applications/Magnis.app/Contents/MacOS"));

        // No separate agent service exists: there is no com.magnis.agent
        // label anywhere in the generated plist.
        assert!(
            !backend.contains("com.magnis.agent"),
            "the standalone agent service is removed"
        );
    }

    // @test-id: tst_desktop_plist_013
    // A fresh install must not try to download a ~500 MB model while the
    // desktop counts down its health timeout.
    #[test]
    fn tst_desktop_plist_013_boot_uses_the_zero_download_index() {
        let l = fixture_layout();
        let backend = render_plist(&backend_spec(&l));
        assert!(backend.contains("<key>EMBEDDINGS_PROVIDER</key>"));
        assert!(backend.contains("<string>tfidf</string>"));
    }

    // @test-id: tst_desktop_plist_012
    // MAGNIS_ENV_FILE must point INTO the data root. The supervisor writes the
    // agent's filtered copy next to the source, and Contents/Resources in an
    // installed .app is read-only — pointing it at the bundle made the backend
    // exit(1) at boot with an empty stderr.
    #[test]
    fn tst_desktop_plist_012_env_file_lives_in_the_writable_data_root() {
        let l = fixture_layout();
        let backend = render_plist(&backend_spec(&l));
        assert!(backend.contains(
            "<string>/Users/x/Library/Application Support/com.magnis.desktop/magnis.env</string>"
        ));
        assert!(
            !backend.contains("Contents/Resources/magnis.env"),
            "the bundle is not writable — the filtered twin cannot be written there"
        );
    }

    // @test-id: tst_desktop_plist_010  @invariant: dmg-github-catalog INV-2, INV-3
    // The DMG delivers plugins from the GitHub catalog, so the launchd env must
    // (a) carry MAGNIS_CATALOG_URL as a BASE url — remote_catalog appends
    // "/index.json" itself — and (b) point MAGNIS_PLUGINS_DIR at the writable
    // data root, NOT at bundle resources that no longer ship a plugin payload.
    // MAGNIS_PLUGINS_DIST_DIR is gone: bootstrap derives the sibling and no-ops.
    #[test]
    fn tst_desktop_plist_010_catalog_url_and_data_root_plugins() {
        let l = fixture_layout();
        let backend = render_plist(&backend_spec(&l));

        assert!(
            backend.contains("<key>MAGNIS_CATALOG_URL</key>"),
            "launchd env must carry the catalog channel"
        );
        assert!(
            !backend.contains("/index.json"),
            "MAGNIS_CATALOG_URL must be the BASE url — fetch_bytes appends the rel path"
        );
        assert!(
            backend.contains(
                "<string>/Users/x/Library/Application Support/com.magnis.desktop/plugins</string>"
            ),
            "MAGNIS_PLUGINS_DIR must live under the data root"
        );
        assert!(
            !backend.contains("Contents/Resources/plugins"),
            "must not point at bundle resources — the DMG ships no plugin payload"
        );
        assert!(
            !backend.contains("<key>MAGNIS_PLUGINS_DIST_DIR</key>"),
            "dist dir is derived by the backend; nothing is bundled to point at"
        );
    }

    // @test-id: tst_desktop_plist_011  @invariant: dmg-github-catalog INV-2
    // An operator-supplied channel (a fork, or a file:// mirror in tests) wins
    // over the default, so the same build can be pointed at a test catalog.
    #[test]
    fn tst_desktop_plist_011_ambient_catalog_url_overrides() {
        let l = fixture_layout();
        let spec = backend_spec_with_catalog(&l, Some("file:///tmp/cat"));
        let backend = render_plist(&spec);
        assert!(backend.contains("<string>file:///tmp/cat</string>"));
        assert!(!backend.contains("raw.githubusercontent.com"));
    }

    // @test-id: tst_desktop_plist_002  @invariant: INV-3 (no secrets in plist)
    #[test]
    fn tst_desktop_plist_002_no_secret_literals() {
        let l = fixture_layout();
        // A secret value that lives in the bundled magnis.env, NOT the plist.
        let secret = "super-secret-google-client-secret-value";
        let backend = render_plist(&backend_spec(&l));
        assert!(!backend.contains(secret));
        // Only the env-file PATH is present, never its contents.
        assert!(backend.contains("magnis.env"));
        // Subscription-only: NO API-key env var on the plist.
        assert!(
            !backend.contains("ANTHROPIC_API_KEY") && !backend.contains("OPENAI_API_KEY"),
            "the agent is subscription-only; no API key may appear in the plist"
        );
    }

    // @test-id: tst_desktop_paths_001  @invariant: INV-15
    #[test]
    fn tst_desktop_paths_001_resolution() {
        let exe = Path::new("/Applications/Magnis.app/Contents/MacOS/magnis-desktop");
        let bp = bundle_paths_from_exe(exe).expect("resolves bundle");
        assert_eq!(bp.bundle_root, Path::new("/Applications/Magnis.app"));
        assert_eq!(
            bp.macos_dir,
            Path::new("/Applications/Magnis.app/Contents/MacOS")
        );
        assert_eq!(
            bp.resources_dir,
            Path::new("/Applications/Magnis.app/Contents/Resources")
        );
        // Tauri strips the triple suffix in the bundle → plain names.
        assert_eq!(
            sidecar_path(&bp.macos_dir, "magnis-server"),
            Path::new("/Applications/Magnis.app/Contents/MacOS/magnis-server")
        );
        assert_eq!(
            sidecar_path(&bp.macos_dir, "agent-server"),
            Path::new("/Applications/Magnis.app/Contents/MacOS/agent-server")
        );
        assert_eq!(
            env_file_path(Path::new(
                "/Users/x/Library/Application Support/com.magnis.desktop"
            )),
            Path::new("/Users/x/Library/Application Support/com.magnis.desktop/magnis.env")
        );
        assert!(is_under_applications(&bp.bundle_root));
        assert!(!is_under_applications(Path::new(
            "/Volumes/Magnis/Magnis.app"
        )));
    }
}
