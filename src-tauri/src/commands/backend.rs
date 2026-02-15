use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BackendConfig {
    pub base_url: String,
}

/// Returns the base URL of the backend server (spawned as a separate process).
/// Frontend uses this for HTTP transport (RPC) to the Rust backend.
#[tauri::command]
pub async fn get_backend_config(
    state: tauri::State<'_, crate::BackendState>,
) -> Result<BackendConfig, String> {
    let guard = state.inner().0.lock().map_err(|e| e.to_string())?;
    Ok(BackendConfig {
        base_url: guard.base_url().to_string(),
    })
}
