//! Two startup decisions, kept pure so they can be wrong loudly in a test
//! rather than quietly on a user's machine.
//!
//! Both read process-global state in production — argv, an install path, a
//! marker file — which is exactly why the *rules* take their inputs as
//! arguments. A test that has to set env or move a bundle to assert a rule is a
//! test nobody writes.

use std::path::Path;

/// The flag Login Items passes so the app comes up in the status bar with no
/// window. Not a heuristic about how we were launched: the launcher states it.
pub const QUIET_FLAG: &str = "--quiet";

/// Should this launch create a window?
pub fn should_create_window<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    !args.into_iter().any(|a| a.as_ref() == QUIET_FLAG)
}

/// Is this bundle somewhere it will still be after a reboot?
///
/// Stated positively, as an allowlist, because the two ways of being
/// non-persistent do not partition cleanly:
///
/// * `/Volumes/…` — running straight from the mounted disk image;
/// * a *translocated* path — macOS moves a quarantined app to a random
///   read-only mount under `AppTranslocation`, so an app opened from
///   `~/Downloads` is just as temporary while looking nothing like a DMG.
///
/// Because it is an allowlist, both are excluded without naming either: a
/// mounted image and a translocated path match neither entry. Explicit checks
/// for them were written first and then removed — mutation testing showed the
/// translocation branch could be deleted with every test still green, which
/// means it was defending nothing. A denylist would have needed both, and
/// missing the second is the documented way to ship this bug.
///
/// `~/Applications` is allowed: the original guard checked `/Applications` only
/// because it served a LaunchAgent holding absolute in-bundle paths, and a
/// Login Item has no such constraint.
pub fn is_persistent_location(bundle_path: &Path) -> bool {
    if bundle_path.starts_with("/Applications") {
        return true;
    }
    // `~/Applications` — resolved rather than pattern-matched, so a literal
    // "/Applications" appearing anywhere else in the path cannot pass.
    dirs::home_dir()
        .map(|home| bundle_path.starts_with(home.join("Applications")))
        .unwrap_or(false)
}

/// Should the app turn on Start-at-Login for the user, right now?
///
/// Three inputs, three distinct reasons to say no:
///
/// * `already_decided` — we have enabled it once before. The user's later
///   choice, whatever it was, is theirs; we never re-enable.
/// * `currently_enabled` — nothing to do.
/// * `bundle_is_persistent` — enabling from a temporary location records a
///   login item pointing at a path that stops existing on eject. Combined with
///   "never re-enable", that breakage would be permanent.
pub fn should_enable_autostart(
    already_decided: bool,
    currently_enabled: bool,
    bundle_is_persistent: bool,
) -> bool {
    !already_decided && !currently_enabled && bundle_is_persistent
}

/// Show or hide the app in the Dock (macOS) or the taskbar (elsewhere).
///
/// The one place in this crate where platforms genuinely diverge, and it is a
/// `cfg` at the call site rather than a trait: the two APIs are documented as
/// unsupported on each other's platform, so a seam would need `cfg` inside it
/// anyway — and a `cfg` mismatch is a compile error where a seam with an
/// unimplemented arm is a panic in a shipped binary.
pub fn apply_dock_visibility(app: &tauri::AppHandle, show: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if show {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        if let Err(e) = app.set_activation_policy(policy) {
            tracing::warn!(target: "shell", error = %e, "could not change Dock visibility");
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_skip_taskbar(!show);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_persistent_location, should_create_window, should_enable_autostart};
    use std::path::PathBuf;

    // @test-id: tst_desktop_quiet_001
    // @invariant: INV-DTR-6
    // @covers: startup::should_create_window
    // @deterministic: yes
    #[test]
    fn tst_desktop_quiet_001_quiet_suppresses_the_window() {
        assert!(should_create_window(["magnis"]));
        assert!(should_create_window(["magnis", "--other"]));
        assert!(!should_create_window(["magnis", "--quiet"]));
        assert!(
            !should_create_window(["magnis", "--quiet", "--extra"]),
            "position must not matter — Login Items may append its own arguments"
        );
    }

    // @test-id: tst_desktop_prefs_001
    // @invariant: INV-DTR-7
    // @covers: startup::should_enable_autostart, startup::is_persistent_location
    // @deterministic: yes
    #[test]
    fn tst_desktop_prefs_001_autostart_is_enabled_once_and_only_from_a_stable_home() {
        // First run from a real install: yes.
        assert!(should_enable_autostart(false, false, true));

        // The user unticked it. `already_decided` is what stops us silently
        // undoing that on the next launch.
        assert!(!should_enable_autostart(true, false, true));

        // Already on: nothing to do.
        assert!(!should_enable_autostart(false, true, true));

        // A temporary location: enabling here writes a login item that breaks
        // on eject, and "never re-enable" makes it permanent.
        assert!(!should_enable_autostart(false, false, false));

        // The classifier itself — the half that actually decides.
        assert!(is_persistent_location(&PathBuf::from(
            "/Applications/Magnis.app"
        )));
        assert!(
            !is_persistent_location(&PathBuf::from("/Volumes/Magnis/Magnis.app")),
            "running from the mounted image is not a home"
        );
        assert!(
            !is_persistent_location(&PathBuf::from(
                "/private/var/folders/aa/bb/T/AppTranslocation/1234/d/Magnis.app"
            )),
            "a translocated quarantine path is temporary and looks nothing like a DMG — \
             a /Volumes-only check would pass it and ship the bug"
        );

        // `~/Applications` is deliberately allowed: the deleted guard required
        // `/Applications` because it served a LaunchAgent, not a Login Item.
        if let Some(home) = dirs::home_dir() {
            assert!(is_persistent_location(
                &home.join("Applications/Magnis.app")
            ));
            assert!(
                !is_persistent_location(&home.join("Downloads/Magnis.app")),
                "a download is not an install"
            );
        }
    }
}
