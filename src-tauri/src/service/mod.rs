//! macOS background-service management (launchd LaunchAgents).
//!
//! The packaged desktop app does not spawn the backend as a child (that is the
//! dev/`spawn` path). Instead it installs ONE user LaunchAgent —
//! `com.magnis.backend` — so the backend runs 24/7 under launchd, surviving
//! window close (DEC-1/2/3). The backend owns BOTH its embedded PostgreSQL
//! child AND (gated on `MAGNIS_BACKEND_OWNS_AGENT=1`) the `agent-server`
//! sidecar — so the separate `com.magnis.agent` service is gone. On install
//! we boot out + delete any stale `com.magnis.agent.plist` from an older
//! install so launchd doesn't keep the old agent running alongside the
//! backend-owned one (`docs/plans/local-agent-supervision.md`).
//!
//! The install/idempotency logic is platform-independent and unit-tested with a
//! fake `LaunchctlRunner` + an injected `LaunchAgents` dir. Only the real
//! `launchctl` calls and uid/home resolution are macOS-gated.

pub mod plist;

use std::path::{Path, PathBuf};

use plist::{render_plist, ServiceSpec};

/// The bundle is not under `/Applications`, so the background service can't be
/// installed (DEC-16). A typed error so `main` can show the actionable
/// "move to Applications" dialog rather than a generic failure.
#[derive(Debug)]
pub struct NotInApplications {
    pub bundle_root: PathBuf,
}

impl std::fmt::Display for NotInApplications {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Magnis must be in /Applications to run its background service \
             (found {}). Drag Magnis.app to Applications and open it again.",
            self.bundle_root.display()
        )
    }
}

impl std::error::Error for NotInApplications {}

/// Map a startup error to a user-facing dialog (title, body). The
/// install-location guard gets actionable copy; anything else surfaces the
/// underlying message so the failure is never silent.
pub fn startup_error_dialog(err: &anyhow::Error) -> (String, String) {
    if err.downcast_ref::<NotInApplications>().is_some() {
        (
            "Move Magnis to Applications".to_string(),
            "Magnis must be in your Applications folder to run in the background.\n\n\
             Drag Magnis.app to Applications, then open it again."
                .to_string(),
        )
    } else {
        (
            "Magnis couldn't start".to_string(),
            format!("The background service failed to start:\n\n{err}"),
        )
    }
}

/// Show a native macOS alert for a fatal startup error, so a Finder-launched
/// app never just disappears. Best-effort (ignores osascript failure).
#[cfg(target_os = "macos")]
pub fn show_startup_error(err: &anyhow::Error) {
    let (title, body) = startup_error_dialog(err);
    // Escape backslashes and quotes for the AppleScript string literals.
    let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "display alert \"{}\" message \"{}\" as critical",
        esc(&title),
        esc(&body)
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status();
}

/// Side-effecting `launchctl` operations, behind a trait so install logic is
/// testable without touching the real service-management database.
pub trait LaunchctlRunner {
    /// `launchctl bootstrap gui/<uid> <plist>`.
    fn bootstrap(&self, uid: u32, plist_path: &Path) -> anyhow::Result<()>;
    /// `launchctl bootout gui/<uid>/<label>`.
    fn bootout(&self, uid: u32, label: &str) -> anyhow::Result<()>;
}

/// What `ensure_service` did for one service.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceAction {
    /// Plist was absent → written and bootstrapped.
    Installed,
    /// Plist existed but differed (version/path) → rewritten + re-bootstrapped.
    Updated,
    /// Plist already up to date → no launchctl churn.
    Unchanged,
}

/// Aggregate of an `ensure_installed` run over both services.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct InstallReport {
    pub installed: usize,
    pub updated: usize,
    pub unchanged: usize,
}

impl InstallReport {
    fn record(&mut self, action: ServiceAction) {
        match action {
            ServiceAction::Installed => self.installed += 1,
            ServiceAction::Updated => self.updated += 1,
            ServiceAction::Unchanged => self.unchanged += 1,
        }
    }
}

/// Installs/updates/uninstalls the LaunchAgents via a `LaunchctlRunner`.
pub struct ServiceManager<R: LaunchctlRunner> {
    launch_agents_dir: PathBuf,
    uid: u32,
    runner: R,
}

impl<R: LaunchctlRunner> ServiceManager<R> {
    pub fn new(launch_agents_dir: PathBuf, uid: u32, runner: R) -> Self {
        Self {
            launch_agents_dir,
            uid,
            runner,
        }
    }

    fn plist_path(&self, label: &str) -> PathBuf {
        self.launch_agents_dir.join(format!("{label}.plist"))
    }

    /// Ensure one service is installed and current. Idempotent: an unchanged
    /// plist causes no `bootout`/`bootstrap` (INV-4). A changed body (version
    /// stamp or in-bundle program path) triggers `bootout`→`bootstrap`.
    pub fn ensure_service(&self, spec: &ServiceSpec) -> anyhow::Result<ServiceAction> {
        let path = self.plist_path(&spec.label);
        let desired = render_plist(spec);
        let existing = std::fs::read_to_string(&path).ok();
        if existing.as_deref() == Some(desired.as_str()) {
            return Ok(ServiceAction::Unchanged);
        }
        let is_update = existing.is_some();
        std::fs::create_dir_all(&self.launch_agents_dir)?;
        std::fs::write(&path, &desired)?;
        if is_update {
            // Ignore "service not loaded" — bootstrap below re-establishes it.
            let _ = self.runner.bootout(self.uid, &spec.label);
        }
        self.runner.bootstrap(self.uid, &path)?;
        Ok(if is_update {
            ServiceAction::Updated
        } else {
            ServiceAction::Installed
        })
    }

    /// Install/refresh the backend service. Refuses unless the bundle is
    /// under `/Applications` (DEC-16/INV-14): launchd points at absolute
    /// in-bundle paths, which are unstable from the DMG or a translocated
    /// path. First runs the migration cleanup so a stale standalone
    /// `com.magnis.agent` from an older install can't keep running
    /// alongside the now backend-owned agent.
    pub fn ensure_installed(
        &self,
        layout: &plist::ServiceLayout,
        bundle_root: &Path,
    ) -> anyhow::Result<InstallReport> {
        if !plist::is_under_applications(bundle_root) {
            return Err(NotInApplications {
                bundle_root: bundle_root.to_path_buf(),
            }
            .into());
        }
        // Migration: older installs ran a separate com.magnis.agent
        // LaunchAgent. The backend now owns the agent, so boot out + delete
        // any stale plist before bootstrapping the backend.
        self.cleanup_legacy_agent_service();
        let mut report = InstallReport::default();
        report.record(self.ensure_service(&plist::backend_spec(layout))?);
        Ok(report)
    }

    /// Boot out + delete a stale standalone `com.magnis.agent` LaunchAgent
    /// left by an older install. Idempotent: when no stale plist is present
    /// it does NOTHING (no launchctl churn on every install) — the common
    /// case for a fresh backend-owns-agent install. When a stale plist IS
    /// found it boots the service out of launchd and deletes the file.
    /// Returns `true` iff a stale plist was present and cleaned up.
    pub fn cleanup_legacy_agent_service(&self) -> bool {
        let path = self.plist_path(plist::LEGACY_AGENT_LABEL);
        if !path.exists() {
            return false;
        }
        // Boot it out of launchd first (it may be loaded), then delete.
        let _ = self.runner.bootout(self.uid, plist::LEGACY_AGENT_LABEL);
        std::fs::remove_file(&path).ok();
        true
    }

    /// Boot out and remove one service's plist (INV-10). Idempotent.
    pub fn uninstall_service(&self, label: &str) -> anyhow::Result<()> {
        let _ = self.runner.bootout(self.uid, label);
        std::fs::remove_file(self.plist_path(label)).ok();
        Ok(())
    }

    /// Tear down the backend service (INV-10). Also cleans up any stale
    /// standalone agent service from an older install.
    pub fn uninstall(&self) -> anyhow::Result<()> {
        self.uninstall_service(plist::BACKEND_LABEL)?;
        self.cleanup_legacy_agent_service();
        Ok(())
    }
}

/// Real `launchctl` runner (macOS).
#[cfg(target_os = "macos")]
pub struct RealLaunchctl;

#[cfg(target_os = "macos")]
impl LaunchctlRunner for RealLaunchctl {
    fn bootstrap(&self, uid: u32, plist_path: &Path) -> anyhow::Result<()> {
        let out = std::process::Command::new("launchctl")
            .arg("bootstrap")
            .arg(format!("gui/{uid}"))
            .arg(plist_path)
            .output()?;
        if !out.status.success() {
            anyhow::bail!(
                "launchctl bootstrap failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        Ok(())
    }

    fn bootout(&self, uid: u32, label: &str) -> anyhow::Result<()> {
        let out = std::process::Command::new("launchctl")
            .arg("bootout")
            .arg(format!("gui/{uid}/{label}"))
            .output()?;
        if !out.status.success() {
            anyhow::bail!(
                "launchctl bootout failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        Ok(())
    }
}

/// Current user's uid (for `gui/<uid>` launchctl domains).
#[cfg(unix)]
pub fn current_uid() -> u32 {
    // SAFETY: getuid is always-succeeds and thread-safe.
    unsafe { libc::getuid() }
}

/// `~/Library/LaunchAgents`, created if missing (macOS).
#[cfg(target_os = "macos")]
pub fn user_launch_agents_dir() -> anyhow::Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("no home dir"))?;
    let dir = home.join("Library").join("LaunchAgents");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// How long to wait for the backend service `/health` after (re)bootstrapping.
/// Longer than the spawn path's 15s because a cold boot may extract/initialise
/// the embedded PostgreSQL cluster on first run.
#[cfg(target_os = "macos")]
const SERVICE_HEALTH_TIMEOUT_SECS: u64 = 45;

/// Build the real `ServiceManager` (user LaunchAgents dir + real launchctl).
#[cfg(target_os = "macos")]
fn real_manager() -> anyhow::Result<ServiceManager<RealLaunchctl>> {
    Ok(ServiceManager::new(
        user_launch_agents_dir()?,
        current_uid(),
        RealLaunchctl,
    ))
}

/// Resolve the running bundle's `ServiceLayout` from the desktop exe path and
/// the app's data/log dirs.
#[cfg(target_os = "macos")]
fn layout_for(
    app_paths: &crate::paths::AppPaths,
    version: &str,
) -> anyhow::Result<(plist::ServiceLayout, std::path::PathBuf)> {
    let exe = std::env::current_exe()?;
    let bundle = plist::bundle_paths_from_exe(&exe)
        .ok_or_else(|| anyhow::anyhow!("cannot resolve .app bundle from {}", exe.display()))?;
    let home_dir =
        dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve user home directory"))?;
    let layout = plist::ServiceLayout {
        macos_dir: bundle.macos_dir.clone(),
        resources_dir: bundle.resources_dir.clone(),
        data_root: app_paths.data_root().clone(),
        logs_dir: app_paths.logs_dir().clone(),
        home_dir,
        version: version.to_string(),
    };
    Ok((layout, bundle.bundle_root))
}

/// Install/refresh both LaunchAgents for the running bundle, then block until
/// the backend `/health` is green. Returns the backend base URL the GUI uses.
/// This is the `Service`-mode entry point called from `main` (DEC-3).
#[cfg(target_os = "macos")]
pub fn install_and_wait_healthy(
    app_paths: &crate::paths::AppPaths,
    version: &str,
) -> anyhow::Result<String> {
    let (layout, bundle_root) = layout_for(app_paths, version)?;
    let mgr = real_manager()?;
    let report = mgr.ensure_installed(&layout, &bundle_root)?;
    println!("background services ensured: {report:?}");
    let base_url = format!("http://127.0.0.1:{}", plist::BACKEND_PORT);
    wait_for_health(&base_url)?;
    Ok(base_url)
}

/// Tear down both LaunchAgents (used by the `uninstall_background_service`
/// command). Idempotent.
#[cfg(target_os = "macos")]
pub fn uninstall_all() -> anyhow::Result<()> {
    real_manager()?.uninstall()
}

/// Poll the backend `/health` until it succeeds or the timeout elapses.
#[cfg(target_os = "macos")]
fn wait_for_health(base_url: &str) -> anyhow::Result<()> {
    use std::time::{Duration, Instant};
    let url = format!("{base_url}/health");
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()?;
    let deadline = Instant::now() + Duration::from_secs(SERVICE_HEALTH_TIMEOUT_SECS);
    while Instant::now() < deadline {
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    anyhow::bail!(
        "backend service did not become healthy at {url} within {SERVICE_HEALTH_TIMEOUT_SECS}s"
    )
}

#[cfg(test)]
mod tests {
    use super::plist::{ServiceLayout, ServiceSpec};
    use super::*;
    use std::cell::RefCell;

    /// Records every launchctl call for assertions; never touches the OS.
    #[derive(Default)]
    struct FakeLaunchctl {
        bootstraps: RefCell<Vec<PathBuf>>,
        bootouts: RefCell<Vec<String>>,
    }
    impl LaunchctlRunner for FakeLaunchctl {
        fn bootstrap(&self, _uid: u32, plist_path: &Path) -> anyhow::Result<()> {
            self.bootstraps.borrow_mut().push(plist_path.to_path_buf());
            Ok(())
        }
        fn bootout(&self, _uid: u32, label: &str) -> anyhow::Result<()> {
            self.bootouts.borrow_mut().push(label.to_string());
            Ok(())
        }
    }

    fn spec_with_stamp(label: &str, program: &str, stamp: &str) -> ServiceSpec {
        ServiceSpec {
            label: label.into(),
            program: PathBuf::from(program),
            env: vec![("PORT".into(), "3765".into())],
            stdout_path: PathBuf::from("/tmp/out.log"),
            stderr_path: PathBuf::from("/tmp/err.log"),
            stamp: stamp.into(),
        }
    }

    fn layout_in(root: &str, version: &str) -> (ServiceLayout, PathBuf) {
        let bundle_root = PathBuf::from(format!("{root}/Magnis.app"));
        let macos = bundle_root.join("Contents/MacOS");
        let resources = bundle_root.join("Contents/Resources");
        let layout = ServiceLayout {
            macos_dir: macos,
            resources_dir: resources,
            data_root: PathBuf::from("/tmp/magnis-data"),
            logs_dir: PathBuf::from("/tmp/magnis-data/logs"),
            home_dir: PathBuf::from("/Users/x"),
            version: version.into(),
        };
        (layout, bundle_root)
    }

    // @test-id: tst_desktop_service_001  @invariant: INV-4 (idempotency)
    #[test]
    fn tst_desktop_service_001_install_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());

        let v1 = spec_with_stamp("com.magnis.backend", "/Applications/Magnis.app/x", "0.1.0");

        // First install: writes plist + one bootstrap, no bootout.
        assert_eq!(mgr.ensure_service(&v1).unwrap(), ServiceAction::Installed);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 1);
        assert_eq!(mgr.runner.bootouts.borrow().len(), 0);
        assert!(tmp.path().join("com.magnis.backend.plist").exists());

        // Same content again: no churn.
        assert_eq!(mgr.ensure_service(&v1).unwrap(), ServiceAction::Unchanged);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 1);
        assert_eq!(mgr.runner.bootouts.borrow().len(), 0);

        // Bumped version: rewrite + one bootout + one more bootstrap.
        let v2 = spec_with_stamp("com.magnis.backend", "/Applications/Magnis.app/x", "0.2.0");
        assert_eq!(mgr.ensure_service(&v2).unwrap(), ServiceAction::Updated);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 2);
        assert_eq!(mgr.runner.bootouts.borrow().len(), 1);
    }

    // @test-id: tst_desktop_service_002  @invariant: INV-10 (uninstall)
    // ONE service now: install writes only com.magnis.backend; uninstall
    // boots it out (and best-effort cleans any legacy agent service).
    #[test]
    fn tst_desktop_service_002_uninstall_single_service() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());
        let (layout, bundle_root) = layout_in("/Applications", "0.1.0");
        mgr.ensure_installed(&layout, &bundle_root).unwrap();
        assert!(tmp.path().join("com.magnis.backend.plist").exists());
        // No standalone agent plist is ever written — the backend owns it.
        assert!(!tmp.path().join("com.magnis.agent.plist").exists());

        mgr.uninstall().unwrap();
        let booted: Vec<String> = mgr.runner.bootouts.borrow().clone();
        assert!(booted.contains(&"com.magnis.backend".to_string()));
        assert!(!tmp.path().join("com.magnis.backend.plist").exists());
    }

    // @test-id: tst_desktop_service_003 — migration cleanup: on install, a
    // stale standalone com.magnis.agent.plist from an older install is
    // booted out + deleted, so launchd doesn't keep running it alongside
    // the now backend-owned agent.
    #[test]
    fn tst_desktop_service_003_install_cleans_stale_agent_plist() {
        let tmp = tempfile::tempdir().unwrap();
        // Simulate an older install: a stale agent plist on disk.
        let stale = tmp.path().join("com.magnis.agent.plist");
        std::fs::write(&stale, "<plist>old standalone agent</plist>").unwrap();

        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());
        let (layout, bundle_root) = layout_in("/Applications", "0.1.0");
        let report = mgr.ensure_installed(&layout, &bundle_root).unwrap();

        // Backend installed; stale agent plist deleted + booted out.
        assert_eq!(report.installed, 1);
        assert!(
            !stale.exists(),
            "stale agent plist must be deleted on install"
        );
        assert!(
            mgr.runner
                .bootouts
                .borrow()
                .contains(&"com.magnis.agent".to_string()),
            "stale agent service must be booted out of launchd"
        );
    }

    // @test-id: tst_desktop_pathguard_001  @invariant: INV-14 (install-location)
    #[test]
    fn tst_desktop_pathguard_001_guard_and_rebootstrap() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());

        // From the DMG: refuse, write no plist.
        let (vol_layout, vol_root) = layout_in("/Volumes/Magnis", "0.1.0");
        let refused = mgr.ensure_installed(&vol_layout, &vol_root);
        let err = refused.expect_err("must refuse outside /Applications");
        assert!(
            err.downcast_ref::<NotInApplications>().is_some(),
            "guard must return the typed NotInApplications error"
        );
        assert!(err.to_string().contains("/Applications"));
        assert!(!tmp.path().join("com.magnis.backend.plist").exists());

        // Installed under /Applications: the ONE backend service bootstrapped.
        let (app_layout, app_root) = layout_in("/Applications", "0.1.0");
        let r1 = mgr.ensure_installed(&app_layout, &app_root).unwrap();
        assert_eq!(r1.installed, 1);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 1);

        // Same again: no churn.
        let r2 = mgr.ensure_installed(&app_layout, &app_root).unwrap();
        assert_eq!(r2.unchanged, 1);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 1);

        // Bundle moved to a DIFFERENT /Applications path → plist program path
        // differs → the backend service re-bootstrapped.
        let (moved_layout, moved_root) = layout_in("/Applications/Sub", "0.1.0");
        let r3 = mgr.ensure_installed(&moved_layout, &moved_root).unwrap();
        assert_eq!(r3.updated, 1);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 2);
        assert_eq!(mgr.runner.bootouts.borrow().len(), 1);
    }

    // @test-id: tst_desktop_dialog_001  @invariant: INV-17 — startup failures map
    // to a user-facing dialog (no silent exit). The guard gets actionable copy.
    #[test]
    fn tst_desktop_dialog_001_startup_error_text() {
        let guard: anyhow::Error = NotInApplications {
            bundle_root: PathBuf::from("/Volumes/Magnis/Magnis.app"),
        }
        .into();
        let (title, body) = startup_error_dialog(&guard);
        assert!(title.to_lowercase().contains("applications"));
        assert!(body.contains("Applications"));

        let generic = anyhow::anyhow!("backend service did not become healthy at …");
        let (gtitle, gbody) = startup_error_dialog(&generic);
        assert!(!gtitle.to_lowercase().contains("applications"));
        assert!(gbody.contains("healthy"));
    }
}
