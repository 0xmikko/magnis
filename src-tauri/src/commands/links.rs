use rac_core::{EntityId, Link};
use serde::Deserialize;
use serde_json::Value;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct TransportRequest {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
    pub query: Option<std::collections::HashMap<String, String>>,
}

/// List links from an entity
#[tauri::command]
pub async fn links_list(
    state: tauri::State<'_, AppState>,
    request: TransportRequest,
) -> Result<Vec<Link>, String> {
    // Extract entity ID from path: /entities/{id}/links
    let path_parts: Vec<&str> = request.path.split('/').collect();
    let id_str = path_parts
        .get(2)
        .ok_or_else(|| "Missing entity ID in path".to_string())?;

    let entity_id: EntityId = id_str
        .parse()
        .map_err(|_| format!("Invalid entity ID: {}", id_str))?;

    let links = state
        .link_service
        .list_from_entity(entity_id)
        .await
        .map_err(|e| format!("Failed to list links: {}", e))?;

    Ok(links)
}
