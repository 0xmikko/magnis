// NOTE: items are consumed by `main.rs` starting in Stage 4 (mode wiring);
// until then only `#[cfg(test)]` uses them. The allow is removed in Stage 4.
#![allow(dead_code)]
//! macOS background-service management (launchd LaunchAgents).
//!
//! The packaged desktop app does not spawn the backend as a child (that is the
//! dev/`spawn` path). Instead it installs two user LaunchAgents —
//! `com.magnis.backend` and `com.magnis.agent` — so the backend (and its
//! embedded PostgreSQL child) and the agent run 24/7 under launchd, surviving
//! window close (DEC-1/2/3).
//!
//! The install/idempotency logic is platform-independent and unit-tested with a
//! fake `LaunchctlRunner` + an injected `LaunchAgents` dir. Only the real
//! `launchctl` calls and uid/home resolution are macOS-gated.

pub mod plist;

use std::path::{Path, PathBuf};

use plist::{render_plist, ServiceSpec};

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

    /// Install/refresh both services. Refuses unless the bundle is under
    /// `/Applications` (DEC-16/INV-14): launchd points at absolute in-bundle
    /// paths, which are unstable from the DMG or a translocated path.
    pub fn ensure_installed(
        &self,
        layout: &plist::ServiceLayout,
        bundle_root: &Path,
    ) -> anyhow::Result<InstallReport> {
        if !plist::is_under_applications(bundle_root) {
            anyhow::bail!(
                "Magnis must be installed in /Applications to run its background \
                 service (found {}). Drag Magnis.app to Applications and reopen.",
                bundle_root.display()
            );
        }
        let mut report = InstallReport::default();
        report.record(self.ensure_service(&plist::backend_spec(layout))?);
        report.record(self.ensure_service(&plist::agent_spec(layout))?);
        Ok(report)
    }

    /// Boot out and remove one service's plist (INV-10). Idempotent.
    pub fn uninstall_service(&self, label: &str) -> anyhow::Result<()> {
        let _ = self.runner.bootout(self.uid, label);
        std::fs::remove_file(self.plist_path(label)).ok();
        Ok(())
    }

    /// Tear down both services (INV-10).
    pub fn uninstall(&self) -> anyhow::Result<()> {
        self.uninstall_service(plist::BACKEND_LABEL)?;
        self.uninstall_service(plist::AGENT_LABEL)?;
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
            triple: "aarch64-apple-darwin".into(),
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
    #[test]
    fn tst_desktop_service_002_uninstall_both() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());
        let (layout, bundle_root) = layout_in("/Applications", "0.1.0");
        mgr.ensure_installed(&layout, &bundle_root).unwrap();
        assert!(tmp.path().join("com.magnis.backend.plist").exists());
        assert!(tmp.path().join("com.magnis.agent.plist").exists());

        mgr.uninstall().unwrap();
        let booted: Vec<String> = mgr.runner.bootouts.borrow().clone();
        assert!(booted.contains(&"com.magnis.backend".to_string()));
        assert!(booted.contains(&"com.magnis.agent".to_string()));
        assert!(!tmp.path().join("com.magnis.backend.plist").exists());
        assert!(!tmp.path().join("com.magnis.agent.plist").exists());
    }

    // @test-id: tst_desktop_pathguard_001  @invariant: INV-14 (install-location)
    #[test]
    fn tst_desktop_pathguard_001_guard_and_rebootstrap() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = ServiceManager::new(tmp.path().to_path_buf(), 501, FakeLaunchctl::default());

        // From the DMG: refuse, write no plist.
        let (vol_layout, vol_root) = layout_in("/Volumes/Magnis", "0.1.0");
        let refused = mgr.ensure_installed(&vol_layout, &vol_root);
        assert!(refused.is_err());
        assert!(refused.unwrap_err().to_string().contains("/Applications"));
        assert!(!tmp.path().join("com.magnis.backend.plist").exists());

        // Installed under /Applications: both services bootstrapped.
        let (app_layout, app_root) = layout_in("/Applications", "0.1.0");
        let r1 = mgr.ensure_installed(&app_layout, &app_root).unwrap();
        assert_eq!(r1.installed, 2);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 2);

        // Same again: no churn.
        let r2 = mgr.ensure_installed(&app_layout, &app_root).unwrap();
        assert_eq!(r2.unchanged, 2);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 2);

        // Bundle moved to a DIFFERENT /Applications path → plist program path
        // differs → both re-bootstrapped.
        let (moved_layout, moved_root) = layout_in("/Applications/Sub", "0.1.0");
        let r3 = mgr.ensure_installed(&moved_layout, &moved_root).unwrap();
        assert_eq!(r3.updated, 2);
        assert_eq!(mgr.runner.bootstraps.borrow().len(), 4);
        assert_eq!(mgr.runner.bootouts.borrow().len(), 2);
    }
}
