use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Desktop-owned cosmetic preferences. Workspace connection selection and
/// sessions belong exclusively to the frontend's persisted connection store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DesktopPrefs {
    /// Whether the app appears in the Dock (macOS) or the taskbar elsewhere.
    pub show_in_dock: bool,
    /// Set once, the first time the app turned Start-at-Login on for the user.
    /// Its whole job is to stop us re-enabling something they later switched
    /// off — so it records that a decision was MADE, not what it was.
    pub autostart_decided: bool,
}

impl Default for DesktopPrefs {
    fn default() -> Self {
        Self {
            show_in_dock: true,
            autostart_decided: false,
        }
    }
}

pub fn load_desktop_prefs(path: &Path) -> DesktopPrefs {
    // Unreadable or malformed preferences are not worth failing a launch over:
    // they are two booleans with obvious defaults, and the alternative is an
    // app that will not start because a cosmetic file got corrupted.
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_desktop_prefs(path: &Path, prefs: &DesktopPrefs) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    let raw = serde_json::to_string_pretty(prefs).context("serialize desktop prefs")?;
    std::fs::write(path, raw).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}
