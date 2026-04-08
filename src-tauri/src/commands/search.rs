use magnis_core::ContextId;
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

#[derive(Debug, Deserialize)]
struct SearchVectorRequest {
    query: String,
    context: Option<String>,
    limit: Option<usize>,
    object_types: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub object_type: String,
    pub object_id: String,
    pub score: f64,
    pub snippet: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchVectorResponse {
    pub items: Vec<SearchResult>,
}

/// Vector search across entities
#[tauri::command]
pub async fn search_vector(
    state: tauri::State<'_, AppState>,
    request: TransportRequest,
) -> Result<SearchVectorResponse, String> {
    // Parse request body
    let body = request
        .body
        .ok_or_else(|| "Missing request body".to_string())?;

    let req: SearchVectorRequest =
        serde_json::from_value(body).map_err(|e| format!("Invalid request body: {}", e))?;

    let limit = req.limit.unwrap_or(10);

    // Guard against empty query
    let query_text = req.query.trim();
    if query_text.is_empty() {
        return Ok(SearchVectorResponse { items: vec![] });
    }

    // Parse context if provided
    let context: Option<ContextId> = match req.context {
        Some(ctx_str) => Some(
            ctx_str
                .parse()
                .map_err(|_| format!("Invalid context ID: {}", ctx_str))?,
        ),
        None => None,
    };

    // Get entities to search
    let entities = state
        .entity_service
        .list_by_context(context)
        .await
        .map_err(|e| format!("Failed to list entities: {}", e))?;

    // Apply filter if specified
    let filter_types = req.object_types.as_ref();
    let mut candidates = Vec::new();

    for entity in entities {
        // Apply object type filter
        if let Some(types) = filter_types {
            if !types.contains(&"entity".to_string()) {
                continue;
            }
        }

        if let Some(name) = &entity.name {
            candidates.push((entity.id.to_string(), name.clone()));
        }
    }

    // If no entities to search, return empty
    if candidates.is_empty() {
        return Ok(SearchVectorResponse { items: vec![] });
    }

    // Use embedding service for search
    let search_results = state
        .embedding_service
        .search(query_text, &candidates, limit)
        .await
        .map_err(|e| format!("Embedding search failed: {}", e))?;

    // Convert to response format
    let items = search_results
        .into_iter()
        .map(|r| SearchResult {
            object_type: "entity".to_string(),
            object_id: r.id,
            score: r.score,
            snippet: Some(r.text),
        })
        .collect();

    Ok(SearchVectorResponse { items })
}
