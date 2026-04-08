use magnis_core::Event;
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

/// List events with pagination
#[tauri::command]
pub async fn events_list(
    state: tauri::State<'_, AppState>,
    request: TransportRequest,
) -> Result<Vec<Event>, String> {
    // Extract limit and offset from query params
    let limit = request
        .query
        .as_ref()
        .and_then(|q| q.get("limit"))
        .and_then(|l| l.parse().ok())
        .unwrap_or(50);

    let offset = request
        .query
        .as_ref()
        .and_then(|q| q.get("offset"))
        .and_then(|o| o.parse().ok())
        .unwrap_or(0);

    let events = state
        .event_service
        .list(limit, offset)
        .await
        .map_err(|e| format!("Failed to list events: {}", e))?;

    Ok(events)
}
