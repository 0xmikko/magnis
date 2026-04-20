use serde::Serialize;

use crate::paths::AppPaths;
use crate::workspace_config::{
    load_workspace_config, save_workspace_config, PersistedWorkspaceConfig, LOCAL_WORKSPACE_ID,
    MANAGED_CLOUD_WORKSPACE_ID, PRIVATE_WORKSPACE_ID,
};
use crate::BackendState;

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceEntry {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub api_base_url: Option<String>,
    pub auth_method: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceConfigResponse {
    pub selected_workspace_id: String,
    pub workspaces: Vec<WorkspaceEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceSelectionResponse {
    pub selected_workspace_id: String,
}

fn managed_cloud_api_url() -> String {
    std::env::var("MAGNIS_CLOUD_API_URL").unwrap_or_else(|_| "https://api.magnis.ai".to_string())
}

fn build_workspaces(local_api_base_url: String) -> Vec<WorkspaceEntry> {
    vec![
        WorkspaceEntry {
            id: LOCAL_WORKSPACE_ID.to_string(),
            label: "Local Workspace".to_string(),
            kind: "local".to_string(),
            api_base_url: Some(local_api_base_url),
            auth_method: Some("open".to_string()),
        },
        WorkspaceEntry {
            id: MANAGED_CLOUD_WORKSPACE_ID.to_string(),
            label: "Magnis Cloud (magnis.ai)".to_string(),
            kind: "managed_cloud".to_string(),
            api_base_url: Some(managed_cloud_api_url()),
            auth_method: Some("google".to_string()),
        },
        WorkspaceEntry {
            id: PRIVATE_WORKSPACE_ID.to_string(),
            label: "Private Workspace...".to_string(),
            kind: "private_preview".to_string(),
            api_base_url: None,
            auth_method: None,
        },
    ]
}

#[tauri::command]
pub async fn get_workspace_config(
    state: tauri::State<'_, BackendState>,
    app_paths: tauri::State<'_, AppPaths>,
) -> Result<WorkspaceConfigResponse, String> {
    let selected_workspace_id = load_workspace_config(&app_paths.workspace_config_path())
        .map(|config| config.selected_workspace_id)
        .map_err(|error| error.to_string())?;
    let guard = state.inner().0.lock().map_err(|error| error.to_string())?;

    Ok(WorkspaceConfigResponse {
        selected_workspace_id,
        workspaces: build_workspaces(guard.base_url().to_string()),
    })
}

#[tauri::command]
pub async fn set_selected_workspace(
    app_paths: tauri::State<'_, AppPaths>,
    workspace_id: String,
) -> Result<WorkspaceSelectionResponse, String> {
    let config = PersistedWorkspaceConfig {
        selected_workspace_id: workspace_id,
    };
    save_workspace_config(&app_paths.workspace_config_path(), &config)
        .map_err(|error| error.to_string())?;
    Ok(WorkspaceSelectionResponse {
        selected_workspace_id: config.selected_workspace_id,
    })
}
