//! Selects how the desktop shell obtains its backend.
//!
//! - `Spawn` (dev): the GUI spawns `magnis-server` as a child and stops it on
//!   window exit — the historical behaviour, unchanged.
//! - `Service` (packaged macOS release): the backend + agent run as launchd
//!   LaunchAgents; the GUI only installs/refreshes them and connects (DEC-4).

/// Backend acquisition strategy for the desktop shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopMode {
    Spawn,
    Service,
}

/// Resolve the mode. Precedence:
/// 1. an explicit `MAGNIS_DESKTOP_MODE=service|spawn` always wins;
/// 2. a release build on macOS that is PROPERLY SIGNED → `Service`;
/// 3. otherwise → `Spawn`.
///
/// # Why signing decides this
///
/// Service mode installs a LaunchAgent. On macOS 13+ a LaunchAgent belonging
/// to an app without a Developer ID lands in Background Task Management
/// DISABLED, and launchd silently refuses to run it: the job registers, but
/// `launchctl print` reports `runs = 0`, `last exit code = (never exited)`, and
/// not a single byte reaches the service's stdout. From the user's side the app
/// only ever says "backend service did not become healthy within 45s" — no log,
/// no crash, nothing to debug — until they find the toggle in
/// System Settings → General → Login Items & Extensions themselves.
///
/// An unsigned build handed to someone else must therefore NOT depend on
/// launchd. Spawn mode runs the backend as a child of the app, which needs no
/// approval and no background item. The trade-off is deliberate: background
/// sync stops when the window closes. That is strictly better than an app that
/// cannot start at all.
///
/// Pure for unit-testing — the caller passes `cfg!(debug_assertions)`,
/// `cfg!(target_os = "macos")`, the raw env value, and whether the running
/// bundle carries a real signature.
pub fn resolve_mode(
    is_debug: bool,
    is_macos: bool,
    env_override: Option<&str>,
    is_signed: bool,
) -> DesktopMode {
    if let Some(v) = env_override {
        match v.trim().to_ascii_lowercase().as_str() {
            "service" => return DesktopMode::Service,
            "spawn" => return DesktopMode::Spawn,
            _ => {}
        }
    }
    if !is_debug && is_macos && is_signed {
        DesktopMode::Service
    } else {
        DesktopMode::Spawn
    }
}

/// Whether the running bundle carries a real (non-adhoc) signature.
///
/// `codesign -dv` reports `Signature=adhoc` for a locally built, unsigned app;
/// a Developer ID build names an authority instead. Anything we cannot verify
/// counts as unsigned — the safe direction, since guessing "signed" would put
/// the app back on the launchd path that silently never starts.
#[cfg(target_os = "macos")]
pub fn bundle_is_signed() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Ok(out) = std::process::Command::new("/usr/bin/codesign")
        .args(["-dv", "--verbose=2"])
        .arg(&exe)
        .output()
    else {
        return false;
    };
    // codesign writes its report to stderr.
    let report = String::from_utf8_lossy(&out.stderr);
    out.status.success() && report.contains("Authority=") && !report.contains("Signature=adhoc")
}

#[cfg(not(target_os = "macos"))]
pub fn bundle_is_signed() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // @test-id: tst_desktop_mode_010
    // An UNSIGNED release build must never choose Service. Its LaunchAgent
    // lands in Background Task Management disabled and launchd never runs it —
    // observed as runs=0, "(never exited)", an empty service log, and only
    // "did not become healthy within 45s" on screen.
    #[test]
    fn tst_desktop_mode_010_unsigned_release_falls_back_to_spawn() {
        assert_eq!(resolve_mode(false, true, None, false), DesktopMode::Spawn);
        // Signing is what earns Service.
        assert_eq!(resolve_mode(false, true, None, true), DesktopMode::Service);
        // An explicit override still wins, so the path stays testable.
        assert_eq!(
            resolve_mode(false, true, Some("service"), false),
            DesktopMode::Service
        );
    }

    // @test-id: tst_desktop_mode_001  @invariant: INV-7
    #[test]
    fn tst_desktop_mode_001_resolution_table() {
        // release + macOS + SIGNED, no override → Service
        assert_eq!(resolve_mode(false, true, None, true), DesktopMode::Service);
        // debug on macOS → Spawn (dev workflow preserved)
        assert_eq!(resolve_mode(true, true, None, true), DesktopMode::Spawn);
        // release on non-macOS → Spawn (service is macOS-only)
        assert_eq!(resolve_mode(false, false, None, true), DesktopMode::Spawn);
        // explicit spawn override wins even on release macOS
        assert_eq!(
            resolve_mode(false, true, Some("spawn"), true),
            DesktopMode::Spawn
        );
        // explicit service override wins even in debug
        assert_eq!(
            resolve_mode(true, true, Some("service"), true),
            DesktopMode::Service
        );
        // override is case/whitespace-insensitive
        assert_eq!(
            resolve_mode(true, false, Some(" SERVICE "), true),
            DesktopMode::Service
        );
        // unknown override value → fall through to the defaulting rule
        assert_eq!(
            resolve_mode(false, true, Some("bogus"), true),
            DesktopMode::Service
        );
        assert_eq!(
            resolve_mode(true, true, Some("bogus"), true),
            DesktopMode::Spawn
        );
    }
}
