use magnis_core::{Entity, EntityId};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct TransportRequest {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
    pub query: Option<std::collections::HashMap<String, String>>,
}

/// List entities with optional filters
#[tauri::command]
pub async fn entities_list(
    state: tauri::State<'_, AppState>,
    request: TransportRequest,
) -> Result<Vec<Entity>, String> {
    // Extract context from query params
    let context = request
        .query
        .as_ref()
        .and_then(|q| q.get("context"))
        .and_then(|ctx_str| ctx_str.parse().ok());

    // Get entities from service
    let entities = state
        .entity_service
        .list_by_context(context)
        .await
        .map_err(|e| format!("Failed to list entities: {}", e))?;

    Ok(entities)
}

/// Get a single entity by ID
#[tauri::command]
pub async fn entity_get(
    state: tauri::State<'_, AppState>,
    request: TransportRequest,
) -> Result<Entity, String> {
    // Extract entity ID from path: /entities/{id}
    let path_parts: Vec<&str> = request.path.split('/').collect();
    let id_str = path_parts
        .get(2)
        .ok_or_else(|| "Missing entity ID in path".to_string())?;

    let entity_id: EntityId = id_str
        .parse()
        .map_err(|_| format!("Invalid entity ID: {}", id_str))?;

    let entity = state
        .entity_service
        .get(entity_id)
        .await
        .map_err(|e| format!("Failed to get entity: {}", e))?;

    Ok(entity)
}
