//! Tauri command to tear down the macOS background LaunchAgents.

/// Boot out and remove the `com.magnis.backend` + `com.magnis.agent`
/// LaunchAgents (macOS only). Exposed so a menu item / settings action can
/// fully uninstall the background service without leaving launchd entries.
#[tauri::command]
pub async fn uninstall_background_service() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::service::uninstall_all().map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("background service is only available on macOS".to_string())
    }
}
