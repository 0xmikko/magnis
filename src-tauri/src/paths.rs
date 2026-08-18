use anyhow::{Context, Result};
use std::path::PathBuf;

/// Desktop-side paths. Stage 4: switched from a single-file SQLite
/// `db_path` to a `data_root` directory — Local-mode PGlite uses the
/// whole directory (pgdata/, jwt.secret, magnis.lock, magnis.json,
/// pglite.json, storage/). See `docs/deployment/local.md` for layout.
#[derive(Debug, Clone)]
pub struct AppPaths {
    app_data_dir: PathBuf,
    data_root: PathBuf,
    /// `<data_root>/logs` — the folder both `desktop.<date>.log` (this shell)
    /// and `backend.<date>.log` (the child, via `STORAGE_DIR = data_root`)
    /// land in, also under a `DB_PATH` override (backend-logging-system DEC-16).
    logs_dir: PathBuf,
    // Created on init and retained for future plugin loading; not read yet.
    #[allow(dead_code)]
    plugins_dir: PathBuf,
}

/// Where everything the app owns lives.
///
/// Pure in its inputs so the rule is testable without touching process-global
/// env — the same reason `explicit_override` is pure, and the reason a rule
/// this load-bearing had no test before.
pub fn resolve_home(
    env_override: Option<String>,
    home_dir: Option<PathBuf>,
    legacy_dir: Option<PathBuf>,
) -> Result<PathBuf> {
    // `legacy_dir` is taken and deliberately ignored. It is a parameter so the
    // rule can be STATED — "a legacy directory is never adopted" is not a
    // testable claim about a function that cannot see one, and the previous
    // version of this code adopted it silently.
    let _ = legacy_dir;
    if let Some(raw) = env_override.filter(|v| !v.trim().is_empty()) {
        let p = PathBuf::from(&raw);
        if !p.is_absolute() {
            anyhow::bail!(
                "MAGNIS_HOME={raw:?} must be an absolute path — desktop \
                 bundles do not guarantee a working directory"
            );
        }
        return Ok(p);
    }
    Ok(home_dir
        .context("Failed to get home directory")?
        .join(".magnis"))
}

impl AppPaths {
    pub fn init() -> Result<Self> {
        // ONE ROOT. `MAGNIS_HOME` (default `~/.magnis`) is the single home for
        // data, plugins, logs and secrets.
        //
        // Before this there were three independent roots with three different
        // defaults, and startup was non-deterministic: the same build found its
        // connectors from a terminal and not from Finder, and a "missing
        // database" was really a different root.
        //
        // The legacy adoption branch is DELETED. It used to prefer an existing
        // `com.magnis.desktop` Application Support directory whenever
        // `~/.magnis` did not exist yet — so on any machine carrying one, "the
        // standard path" quietly became a different path. Its stated reason was
        // to avoid starting empty beside existing data, but there is no data
        // migration in either direction: the cluster is created fresh in
        // `pgdata-native`, and the legacy root holds a PGlite tree this build
        // cannot read. Adoption bought the appearance of continuity and cost
        // the one guarantee the root rule exists to give.
        let home = resolve_home(
            std::env::var("MAGNIS_HOME").ok(),
            dirs::home_dir(),
            dirs::data_dir().map(|d| d.join("com.magnis.desktop")),
        )?;
        let app_data_dir = home;

        std::fs::create_dir_all(&app_data_dir).context("Failed to create app data directory")?;

        // Local-mode data root: `app_data_dir` itself. Backend will
        // create `pgdata/`, `storage/`, etc. under it. `DB_PATH` env
        // override kept so operators can redirect (e.g. external
        // drive). If set, it MUST be an absolute directory path —
        // relative paths are resolved against the process CWD, which
        // desktop bundles do not guarantee (plan invariant 8). Reject
        // relative overrides loudly rather than silently resolving
        // against an unknown CWD.
        let data_root = match std::env::var("DB_PATH") {
            Ok(raw) => {
                let p = PathBuf::from(&raw);
                if !p.is_absolute() {
                    anyhow::bail!(
                        "DB_PATH={raw:?} must be an absolute directory path; \
                         desktop bundles do not guarantee CWD, so relative \
                         paths cannot be resolved deterministically"
                    );
                }
                p
            }
            Err(_) => app_data_dir.clone(),
        };
        std::fs::create_dir_all(&data_root).context("Failed to create data root")?;
        // The log folder hangs off the RESOLVED data root for the same reason
        // the plugin tree does: the backend's `STORAGE_DIR` is the data root,
        // so `desktop.*.log` and `backend.*.log` share one folder also when
        // `DB_PATH` moved the root away from `app_data_dir`.
        let logs_dir = data_root.join("logs");
        std::fs::create_dir_all(&logs_dir).context("Failed to create logs directory")?;

        // The plugin tree MUST hang off the RESOLVED data root, not
        // `app_data_dir`: the launchd plist points `MAGNIS_PLUGINS_DIR` at
        // `<data_root>/plugins`, and a `DB_PATH` override moves the data root
        // away from `app_data_dir`. Creating it in the wrong place leaves the
        // backend with a non-canonicalizable path → `build_plugin_installer`
        // returns None → `extensions.install` cannot run at all.
        let plugins_dir = ensure_plugin_tree(&data_root)?;

        Ok(Self {
            app_data_dir,
            data_root,
            logs_dir,
            plugins_dir,
        })
    }

    pub fn app_data_dir(&self) -> &PathBuf {
        &self.app_data_dir
    }

    pub fn data_root(&self) -> &PathBuf {
        &self.data_root
    }

    pub fn workspace_config_path(&self) -> PathBuf {
        self.app_data_dir.join("workspaces.json")
    }

    pub fn desktop_prefs_path(&self) -> PathBuf {
        self.app_data_dir.join("desktop.json")
    }

    pub fn logs_dir(&self) -> &PathBuf {
        &self.logs_dir
    }

    #[allow(dead_code)]
    pub fn plugins_dir(&self) -> &PathBuf {
        &self.plugins_dir
    }
}

/// Create `<data_root>/plugins` with its `modules/` and `sources/` subdirs and
/// return the root. Pure in its input (no env), so it is directly testable.
///
/// The DMG ships NO plugin payload — packages are installed from the catalog
/// channel into the store — but the directory must still exist: the installer
/// canonicalizes it at construction.
pub fn ensure_plugin_tree(data_root: &std::path::Path) -> Result<PathBuf> {
    let plugins_dir = data_root.join("plugins");
    for sub in ["modules", "sources"] {
        std::fs::create_dir_all(plugins_dir.join(sub))
            .with_context(|| format!("Failed to create plugins/{sub} under {plugins_dir:?}"))?;
    }
    Ok(plugins_dir)
}

/// Ensure the operator env file exists, and return its path.
///
/// The backend distinguishes two cases, and the shell was on the wrong side of
/// the line. An *unnamed* env file is existence-checked and skipped when
/// absent; a file the caller *names* — which is what `MAGNIS_ENV_FILE` does —
/// must be readable, and the backend exits 64 when it is not. Measured against
/// a compiled `magnis-server`:
///
/// ```text
/// magnis-server: read --env-file <path>: ENOENT   exit=64
/// ```
///
/// So the shell must not name a file it has not provisioned. It creates an
/// empty one, which is semantically identical to no file — the operator adds
/// credentials later by editing it — and keeps the agent gate, which requires a
/// named env file, switchable on. This is the same provisioning the data root
/// already gets for `jwt.secret` and the plugin tree, in the same directory the
/// shell owns.
pub fn ensure_env_file(data_root: &std::path::Path) -> Result<std::path::PathBuf> {
    std::fs::create_dir_all(data_root)
        .with_context(|| format!("creating {}", data_root.display()))?;
    let path = data_root.join("magnis.env");
    if !path.exists() {
        std::fs::write(&path, b"").with_context(|| format!("creating {}", path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                .with_context(|| format!("securing {}", path.display()))?;
        }
    }
    Ok(path)
}

/// Read or create the JWT signing secret for this data root.
///
/// The backend used to do this itself — but only in local database mode. The
/// shell now starts it in **server** mode, where the backend deliberately
/// refuses to invent one: "AUTH_JWT_SECRET must be set (no derivation, no
/// random fallback)". So ownership moved here with the database, and this is
/// the port of those semantics: 32 random bytes, base64, `<data_root>/
/// jwt.secret`, created exclusively at 0600, and read back unchanged on every
/// later start.
///
/// Persistence is the point. A secret regenerated per launch invalidates every
/// session the user had, silently, on a restart.
pub fn ensure_jwt_secret(data_root: &std::path::Path) -> Result<String> {
    use std::io::Write;

    std::fs::create_dir_all(data_root)
        .with_context(|| format!("creating {}", data_root.display()))?;
    let path = data_root.join("jwt.secret");

    match std::fs::read_to_string(&path) {
        Ok(existing) => {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
            // An empty file is a half-finished write from a previous run, not a
            // secret. Replacing it is correct; keeping it would hand the
            // backend an empty string it will reject anyway.
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e).with_context(|| format!("reading {}", path.display())),
    }

    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| anyhow::anyhow!("generating a JWT secret: {e}"))?;
    let secret = base64_encode(&bytes);

    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .with_context(|| format!("creating {}", path.display()))?;
    file.write_all(secret.as_bytes())
        .with_context(|| format!("writing {}", path.display()))?;

    Ok(secret)
}

/// Minimal base64, so a 32-byte secret does not pull in a dependency.
fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[((n >> (18 - 6 * i)) & 0x3F) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// The public plugin catalog channel: the `catalog` branch of the plugins repo,
/// served raw. A BASE url — never suffixed with `index.json`, because the
/// fetcher appends the relative path itself.
///
/// Rehomed here from `service/plist.rs`, which the tray topology deletes. It
/// was only ever a launchd concern by accident of where it lived: the spawn
/// path in `backend_process.rs` reads it too, and that is the path that
/// survives.
/// The STABLE channel: whatever the newest non-prerelease release holds.
///
/// `releases/latest/download` resolves to that release's assets and
/// redirects to the signed url, so a shipped app carries no tag and never
/// needs a new build to see a new catalog.
pub const STABLE_CATALOG_URL: &str = "https://github.com/0xmikko/magnis/releases/latest/download";

/// The STAGING channel: a release attached to a `staging` tag that moves,
/// marked pre-release so it can never be picked up as `latest`. Assets are
/// replaced in place, which is what "always fresh from this branch" costs —
/// the index carries the archive hashes, so a stale read fails closed.
pub const STAGING_CATALOG_URL: &str =
    "https://github.com/0xmikko/magnis/releases/download/staging";

/// Resolve the catalog channel for THIS build.
///
/// Three inputs in priority order, and the order is the point: an ambient
/// override wins (a fork, or a `file://` mirror in tests), then the build kind
/// decides. A debug build talks to the channel CI built from `staging`,
/// because a developer wants to see what that branch publishes rather than
/// what shipped months ago; a release build talks to stable.
///
/// Pure in its inputs so the rule is testable without touching process env,
/// which is global and would race every other test.
pub fn catalog_url(ambient: Option<String>, debug_build: bool) -> String {
    ambient
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            if debug_build {
                STAGING_CATALOG_URL.to_string()
            } else {
                STABLE_CATALOG_URL.to_string()
            }
        })
}

/// The user's REAL `PATH`, asked from their login shell.
///
/// A Finder-launched app inherits a minimal environment — it never sources
/// `.zshrc`/`.zprofile` — so `which claude` from inside the app finds nothing
/// even when the CLI is installed and logged in. That is exactly how a working
/// Claude Code install surfaced as "Not logged in · Please run /login": the
/// agent could not see the binary at all.
///
/// Best-effort: on any failure the caller falls back to the known locations.
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let out = std::process::Command::new(&shell)
        .args(["-ilc", "printf %s \"$PATH\""])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() || !path.contains('/') {
        return None;
    }
    Some(path)
}

/// Platform-specific package-manager bin dirs worth having on the agent's
/// `PATH`. Kept `cfg`-scoped rather than listed unconditionally: `/opt/homebrew`
/// is macOS-only, and carrying it on Linux would be a directory that exists
/// nowhere, in a variable whose whole job is finding real binaries.
fn extra_tool_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![PathBuf::from("/opt/homebrew/bin")]
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![PathBuf::from("/usr/local/bin")]
    }
}

/// Build the `PATH` the backend hands the supervised agent. It must reach
/// `node` + the MCP stdio proxy, the `claude`/`codex` CLI (subscription login
/// state), and the bundled connector sidecars.
///
/// `sidecar_dir` comes first regardless — it is ours, and the login shell knows
/// nothing about it. Everything the user's shell knows follows, then the known
/// locations as a floor so a stripped profile still works.
pub fn agent_path(home_dir: &std::path::Path, sidecar_dir: &std::path::Path) -> String {
    let mut known = vec![home_dir.join(".local/bin")];
    known.extend(extra_tool_dirs());
    known.push(home_dir.join(".bun/bin"));
    known.push(sidecar_dir.to_path_buf());
    known.extend(
        ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
            .iter()
            .map(PathBuf::from),
    );
    let known = known
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

    let mut out: Vec<String> = vec![sidecar_dir.to_string_lossy().into_owned()];
    for candidate in login_shell_path()
        .unwrap_or_default()
        .split(':')
        .map(str::to_string)
        .chain(known)
    {
        if !candidate.is_empty() && !out.contains(&candidate) {
            out.push(candidate);
        }
    }
    out.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    // @test-id: tst_desktop_paths_010
    // The plugin tree hangs off the data root the plist actually points at.
    #[test]
    fn tst_desktop_paths_010_plugin_tree_under_data_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("custom-data-root");
        std::fs::create_dir_all(&root).unwrap();

        let plugins = ensure_plugin_tree(&root).unwrap();

        assert_eq!(plugins, root.join("plugins"));
        assert!(plugins.join("modules").is_dir(), "modules/ must exist");
        assert!(plugins.join("sources").is_dir(), "sources/ must exist");
        // Canonicalizable — PluginInstaller::new canonicalizes and returns
        // None on failure, which silently disables extensions.install.
        assert!(plugins.canonicalize().is_ok());
    }

    // @test-id: tst_desktop_paths_011
    // Idempotent: a second launch must not fail on an existing tree.
    #[test]
    fn tst_desktop_paths_011_plugin_tree_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_path_buf();
        let first = ensure_plugin_tree(&root).unwrap();
        let second = ensure_plugin_tree(&root).unwrap();
        assert_eq!(first, second);
        assert!(second.join("modules").is_dir());
    }
}

#[cfg(test)]
mod root_tests {
    use super::resolve_home;
    use std::path::PathBuf;

    // @test-id: tst_desktop_dataroot_001
    // @invariant: INV-DTR-24 (one root), DEC-29 (no legacy adoption)
    // @covers: paths::resolve_home
    // @deterministic: yes
    //
    // The rule the whole data-root guarantee rests on, and which had no test
    // while the code shipped its opposite: an existing legacy Application
    // Support directory used to WIN over `~/.magnis`, so on any machine that
    // had ever run an older build, "the standard path" was silently a
    // different path.
    #[test]
    fn tst_desktop_dataroot_001_home_relative_default_and_absolute_override() {
        let home = PathBuf::from("/home/tester");

        let legacy = PathBuf::from("/home/tester/Library/Application Support/com.magnis.desktop");

        // The assertion DEC-29 exists for: a legacy root is present and the
        // default still wins. The previous code returned `legacy` here.
        assert_eq!(
            resolve_home(None, Some(home.clone()), Some(legacy.clone())).expect("default"),
            home.join(".magnis"),
            "a legacy directory must never be adopted in place of the standard root"
        );
        assert_eq!(
            resolve_home(Some("   ".into()), Some(home.clone()), Some(legacy.clone()))
                .expect("blank is unset"),
            home.join(".magnis")
        );
        assert_eq!(
            resolve_home(
                Some("/mnt/data/magnis".into()),
                Some(home.clone()),
                Some(legacy.clone())
            )
            .expect("absolute"),
            PathBuf::from("/mnt/data/magnis"),
            "an absolute override is honoured verbatim"
        );

        let err = resolve_home(Some("relative/path".into()), Some(home), Some(legacy))
            .expect_err("a relative override must be refused");
        let text = format!("{err:#}");
        assert!(
            text.contains("absolute"),
            "the refusal must say why: {text}"
        );

        // No home directory and no override is not a place to guess at.
        assert!(resolve_home(None, None, None).is_err());
    }
}

#[cfg(test)]
mod jwt_tests {
    use super::ensure_jwt_secret;

    // @test-id: tst_desktop_jwt_001
    // @invariant: INV-DTR-23
    // @covers: paths::ensure_jwt_secret
    // @deterministic: yes
    // @fixtures: a temporary data root
    //
    // The backend refuses to invent a signing secret in server mode — "no
    // derivation, no random fallback" — so the shell owning one is what makes
    // the packaged app boot at all. Persistence is the second half: a secret
    // regenerated per launch silently invalidates every session on a restart.
    #[test]
    fn tst_desktop_jwt_001_generated_once_then_read_back() {
        let dir = std::env::temp_dir().join(format!("magnis-jwt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let first = ensure_jwt_secret(&dir).expect("first call generates");
        assert!(
            first.len() >= 40,
            "32 random bytes, base64: {}",
            first.len()
        );

        let second = ensure_jwt_secret(&dir).expect("second call reads back");
        assert_eq!(first, second, "a restart must not invalidate every session");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("jwt.secret"))
                .expect("stat")
                .permissions()
                .mode();
            assert_eq!(
                mode & 0o077,
                0,
                "the secret must not be group/world readable"
            );
        }

        // A half-written empty file is not a secret; it must be replaced rather
        // than handed to a backend that will reject an empty string.
        std::fs::write(dir.join("jwt.secret"), "").expect("truncate");
        let third = ensure_jwt_secret(&dir).expect("regenerates over an empty file");
        assert!(!third.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod catalog_tests {
    use super::{catalog_url, STABLE_CATALOG_URL, STAGING_CATALOG_URL};

    // @test-id: tst_desktop_catalog_001
    // @covers: paths::catalog_url
    // @deterministic: yes
    // Re-pins the two value properties `tst_desktop_plist_010/011` were the only
    // cover for; DEC-1 deletes that file, and the spawn path reads the same
    // constant.
    #[test]
    fn tst_desktop_catalog_001_base_url_and_ambient_override() {
        assert_eq!(
            catalog_url(None, false),
            STABLE_CATALOG_URL,
            "a release build with no override resolves to the stable channel"
        );
        assert!(
            !catalog_url(None, false).ends_with("/index.json"),
            "MUST be a BASE url — the fetcher appends the relative path itself"
        );
        assert_eq!(
            catalog_url(Some("file:///tmp/cat".to_string()), false),
            "file:///tmp/cat",
            "an operator-supplied channel wins over the default"
        );
    }

    // @test-id: tst_desktop_catalog_002
    // @covers: paths::catalog_url
    // @deterministic: yes
    // INV-8: the build kind chooses the channel, and an explicit one still
    // outranks it. A developer who cannot see what `staging` publishes has no
    // way to test the thing this whole channel exists for.
    #[test]
    fn tst_desktop_catalog_002_build_kind_selects_the_channel() {
        assert_eq!(
            catalog_url(None, true),
            STAGING_CATALOG_URL,
            "a development build reads the channel CI built from staging"
        );
        assert_ne!(
            STAGING_CATALOG_URL, STABLE_CATALOG_URL,
            "the two channels must be different urls, or the choice is decoration"
        );
        assert_eq!(
            catalog_url(Some("file:///tmp/cat".to_string()), true),
            "file:///tmp/cat",
            "an explicit channel outranks the build kind too"
        );
    }
}

