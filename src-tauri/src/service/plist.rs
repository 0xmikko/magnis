//! Pure launchd plist generation + bundle-path resolution for the macOS
//! background services. No IO, no platform calls — every function here is a
//! deterministic string/path transform, so the unit tests run on any host.
//!
//! Two services are described (DEC-2): `com.magnis.backend` (runs the bundled
//! `magnis-server`, which owns its embedded PostgreSQL child) and
//! `com.magnis.agent` (runs the bundled `agent-server`). Plists carry ONLY
//! non-secret env (DEC-7/INV-3); secrets live in the bundled `magnis.env` that
//! `MAGNIS_ENV_FILE` points at.

use std::path::{Path, PathBuf};

/// launchd Label for the backend service.
pub const BACKEND_LABEL: &str = "com.magnis.backend";
/// launchd Label for the agent service.
pub const AGENT_LABEL: &str = "com.magnis.agent";
/// Fixed backend HTTP port (matches `backend_process::DEFAULT_PORT`).
pub const BACKEND_PORT: u16 = 3765;
/// Fixed agent HTTP port.
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
pub fn env_file_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join("magnis.env")
}

/// Is the bundle installed under `/Applications`? Services reference absolute
/// in-bundle paths, so running from the DMG (`/Volumes/...`) or a translocated
/// quarantine path is refused (DEC-16/INV-14).
pub fn is_under_applications(bundle_root: &Path) -> bool {
    bundle_root.starts_with("/Applications")
}

/// Build the backend service spec from the resolved layout.
pub fn backend_spec(l: &ServiceLayout) -> ServiceSpec {
    let env_file = env_file_path(&l.resources_dir);
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
            ("RUST_LOG".into(), "info".into()),
            (
                "MAGNIS_ENV_FILE".into(),
                env_file.to_string_lossy().into_owned(),
            ),
        ],
        stdout_path: l.logs_dir.join("magnis-backend.out.log"),
        stderr_path: l.logs_dir.join("magnis-backend.err.log"),
        stamp: l.version.clone(),
    }
}

/// Build the agent service spec from the resolved layout.
pub fn agent_spec(l: &ServiceLayout) -> ServiceSpec {
    let env_file = env_file_path(&l.resources_dir);
    ServiceSpec {
        label: AGENT_LABEL.to_string(),
        program: sidecar_path(&l.macos_dir, "agent-server"),
        env: vec![
            ("AGENT_PORT".into(), AGENT_PORT.to_string()),
            ("AGENT_HOST".into(), "127.0.0.1".into()),
            (
                "BACKEND_URL".into(),
                format!("http://127.0.0.1:{BACKEND_PORT}"),
            ),
            (
                "MAGNIS_ENV_FILE".into(),
                env_file.to_string_lossy().into_owned(),
            ),
        ],
        stdout_path: l.logs_dir.join("magnis-agent.out.log"),
        stderr_path: l.logs_dir.join("magnis-agent.err.log"),
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
            version: "0.1.0".into(),
        }
    }

    // @test-id: tst_desktop_plist_001  @invariant: INV-1, INV-2
    #[test]
    fn tst_desktop_plist_001_both_plists_shape() {
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
            "RUST_LOG",
            "MAGNIS_ENV_FILE",
        ] {
            assert!(
                backend.contains(&format!("<key>{key}</key>")),
                "backend missing {key}"
            );
        }

        let agent = render_plist(&agent_spec(&l));
        assert!(agent.contains("<string>com.magnis.agent</string>"));
        assert!(
            agent.contains("<string>/Applications/Magnis.app/Contents/MacOS/agent-server</string>")
        );
        assert!(
            !agent.contains("agent-server-"),
            "program path must NOT carry the triple suffix (Tauri strips it)"
        );
        for (k, v) in [
            ("AGENT_PORT", "3002"),
            ("AGENT_HOST", "127.0.0.1"),
            ("BACKEND_URL", "http://127.0.0.1:3765"),
        ] {
            assert!(
                agent.contains(&format!("<key>{k}</key>")),
                "agent missing {k}"
            );
            assert!(
                agent.contains(&format!("<string>{v}</string>")),
                "agent missing val {v}"
            );
        }
        assert!(agent.contains("<key>MAGNIS_ENV_FILE</key>"));
    }

    // @test-id: tst_desktop_plist_002  @invariant: INV-3 (no secrets in plist)
    #[test]
    fn tst_desktop_plist_002_no_secret_literals() {
        let l = fixture_layout();
        // A secret value that lives in the bundled magnis.env, NOT the plist.
        let secret = "super-secret-google-client-secret-value";
        let backend = render_plist(&backend_spec(&l));
        let agent = render_plist(&agent_spec(&l));
        assert!(!backend.contains(secret));
        assert!(!agent.contains(secret));
        // Only the env-file PATH is present, never its contents.
        assert!(backend.contains("magnis.env"));
        assert!(agent.contains("magnis.env"));
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
            env_file_path(&bp.resources_dir),
            Path::new("/Applications/Magnis.app/Contents/Resources/magnis.env")
        );
        assert!(is_under_applications(&bp.bundle_root));
        assert!(!is_under_applications(Path::new(
            "/Volumes/Magnis/Magnis.app"
        )));
    }
}
