use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub ok: bool,
}

/// Health check command - verifies the app is running
#[tauri::command]
pub async fn health_check() -> Result<HealthResponse, String> {
    Ok(HealthResponse {
        status: "healthy".to_string(),
        ok: true,
    })
}
