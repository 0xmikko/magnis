use tauri::{AppHandle, Manager};

/// Open a new webview window for OAuth authentication.
/// Called from the frontend when window.open() is not available (Tauri).
#[tauri::command]
pub async fn open_oauth_window(app: AppHandle, url: String) -> Result<(), String> {
    // Close existing OAuth window if any
    if let Some(existing) = app.get_webview_window("google-oauth") {
        let _ = existing.close();
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        "google-oauth",
        tauri::WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {e}"))?),
    )
    .title("Sign in with Google")
    .inner_size(520.0, 720.0)
    .center()
    .build()
    .map_err(|e| format!("Failed to create OAuth window: {e}"))?;

    Ok(())
}
