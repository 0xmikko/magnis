use magnis_api::embeddings::EmbeddingService;
use magnis_application::services::*;
use std::sync::Arc;

/// Tauri application state containing all services
#[derive(Clone)]
pub struct AppState {
    pub entity_service: Arc<EntityService>,
    pub facet_service: Arc<FacetService>,
    pub canonical_service: Arc<CanonicalService>,
    pub link_service: Arc<LinkService>,
    pub event_service: Arc<EventService>,
    pub schema_service: Arc<SchemaService>,
    pub embedding_service: Arc<EmbeddingService>,
}

impl AppState {
    pub fn new(
        entity_service: Arc<EntityService>,
        facet_service: Arc<FacetService>,
        canonical_service: Arc<CanonicalService>,
        link_service: Arc<LinkService>,
        event_service: Arc<EventService>,
        schema_service: Arc<SchemaService>,
        embedding_service: Arc<EmbeddingService>,
    ) -> Self {
        Self {
            entity_service,
            facet_service,
            canonical_service,
            link_service,
            event_service,
            schema_service,
            embedding_service,
        }
    }
}
