use serde::Serialize;

use crate::BackendState;

/// A stable connection URL seed. The frontend owns saved connections,
/// selection, discovered workspace identity and every session fact.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSeed {
    pub id: String,
    pub url: String,
    pub source: String,
}

fn managed_cloud_api_url() -> String {
    std::env::var("MAGNIS_CLOUD_API_URL").unwrap_or_else(|_| "https://api.magnis.ai".to_string())
}

#[tauri::command]
pub async fn get_workspace_seeds(
    state: tauri::State<'_, BackendState>,
) -> Result<Vec<WorkspaceSeed>, String> {
    let guard = state.inner().0.lock().map_err(|error| error.to_string())?;
    Ok(vec![
        WorkspaceSeed {
            id: "local".to_string(),
            url: guard.base_url().to_string(),
            source: "local".to_string(),
        },
        WorkspaceSeed {
            id: "magnisCloud".to_string(),
            url: managed_cloud_api_url(),
            source: "cloud".to_string(),
        },
    ])
}
