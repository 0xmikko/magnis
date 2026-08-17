use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const LOCAL_WORKSPACE_ID: &str = "local";
pub const MANAGED_CLOUD_WORKSPACE_ID: &str = "managed_cloud";
pub const PRIVATE_WORKSPACE_ID: &str = "private_workspace";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedWorkspaceConfig {
    pub selected_workspace_id: String,
}

impl Default for PersistedWorkspaceConfig {
    fn default() -> Self {
        Self {
            selected_workspace_id: LOCAL_WORKSPACE_ID.to_string(),
        }
    }
}

pub fn is_persistable_workspace_id(workspace_id: &str) -> bool {
    matches!(
        workspace_id,
        LOCAL_WORKSPACE_ID | MANAGED_CLOUD_WORKSPACE_ID
    )
}

pub fn load_workspace_config(path: &Path) -> Result<PersistedWorkspaceConfig> {
    if !path.exists() {
        return Ok(PersistedWorkspaceConfig::default());
    }

    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read workspace config {}", path.display()))?;
    let parsed: PersistedWorkspaceConfig = serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse workspace config {}", path.display()))?;
    if !is_persistable_workspace_id(&parsed.selected_workspace_id) {
        return Err(anyhow!(
            "unsupported workspace selection '{}'",
            parsed.selected_workspace_id
        ));
    }
    Ok(parsed)
}

pub fn save_workspace_config(path: &Path, config: &PersistedWorkspaceConfig) -> Result<()> {
    if !is_persistable_workspace_id(&config.selected_workspace_id) {
        return Err(anyhow!(
            "unsupported workspace selection '{}'",
            config.selected_workspace_id
        ));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to create workspace config parent directory {}",
                parent.display()
            )
        })?;
    }

    let raw =
        serde_json::to_string_pretty(config).context("failed to serialize workspace config")?;
    std::fs::write(path, raw)
        .with_context(|| format!("failed to write workspace config {}", path.display()))?;
    Ok(())
}

/// Desktop-owned preferences. Deliberately in this file rather than a new one:
/// it already owns "a small JSON document in the app data dir", including the
/// load/save/validate shape and its tests.
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

#[cfg(test)]
mod tests {
    use super::{
        load_workspace_config, save_workspace_config, PersistedWorkspaceConfig, LOCAL_WORKSPACE_ID,
        MANAGED_CLOUD_WORKSPACE_ID, PRIVATE_WORKSPACE_ID,
    };
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_config_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "magnis-desktop-{test_name}-{}-{nanos}.json",
            std::process::id()
        ))
    }

    #[test]
    fn tst_desktop_workspace_001_missing_config_defaults_to_local() {
        let path = temp_config_path("default");
        let loaded = load_workspace_config(&path).expect("load missing config");
        assert_eq!(
            loaded,
            PersistedWorkspaceConfig {
                selected_workspace_id: LOCAL_WORKSPACE_ID.to_string()
            }
        );
    }

    #[test]
    fn tst_desktop_workspace_002_save_roundtrips_and_rejects_private_workspace() {
        let path = temp_config_path("roundtrip");
        let config = PersistedWorkspaceConfig {
            selected_workspace_id: MANAGED_CLOUD_WORKSPACE_ID.to_string(),
        };
        save_workspace_config(&path, &config).expect("save config");
        let loaded = load_workspace_config(&path).expect("load saved config");
        assert_eq!(loaded, config);

        let private = PersistedWorkspaceConfig {
            selected_workspace_id: PRIVATE_WORKSPACE_ID.to_string(),
        };
        let error = save_workspace_config(&path, &private).expect_err("reject private workspace");
        assert!(error
            .to_string()
            .contains("unsupported workspace selection"));

        let _ = std::fs::remove_file(path);
    }
}
