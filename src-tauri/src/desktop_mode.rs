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
/// 2. otherwise a release build on macOS → `Service`;
/// 3. otherwise (debug, or non-macOS) → `Spawn`.
///
/// Pure for unit-testing — the caller passes `cfg!(debug_assertions)`,
/// `cfg!(target_os = "macos")`, and the raw env value.
pub fn resolve_mode(is_debug: bool, is_macos: bool, env_override: Option<&str>) -> DesktopMode {
    if let Some(v) = env_override {
        match v.trim().to_ascii_lowercase().as_str() {
            "service" => return DesktopMode::Service,
            "spawn" => return DesktopMode::Spawn,
            _ => {}
        }
    }
    if !is_debug && is_macos {
        DesktopMode::Service
    } else {
        DesktopMode::Spawn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // @test-id: tst_desktop_mode_001  @invariant: INV-7
    #[test]
    fn tst_desktop_mode_001_resolution_table() {
        // release + macOS, no override → Service
        assert_eq!(resolve_mode(false, true, None), DesktopMode::Service);
        // debug on macOS → Spawn (dev workflow preserved)
        assert_eq!(resolve_mode(true, true, None), DesktopMode::Spawn);
        // release on non-macOS → Spawn (service is macOS-only)
        assert_eq!(resolve_mode(false, false, None), DesktopMode::Spawn);
        // explicit spawn override wins even on release macOS
        assert_eq!(resolve_mode(false, true, Some("spawn")), DesktopMode::Spawn);
        // explicit service override wins even in debug
        assert_eq!(
            resolve_mode(true, true, Some("service")),
            DesktopMode::Service
        );
        // override is case/whitespace-insensitive
        assert_eq!(
            resolve_mode(true, false, Some(" SERVICE ")),
            DesktopMode::Service
        );
        // unknown override value → fall through to the defaulting rule
        assert_eq!(
            resolve_mode(false, true, Some("bogus")),
            DesktopMode::Service
        );
        assert_eq!(resolve_mode(true, true, Some("bogus")), DesktopMode::Spawn);
    }
}
