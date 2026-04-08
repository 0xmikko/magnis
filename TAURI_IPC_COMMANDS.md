# Tauri IPC Commands Implementation

## Overview

Implemented comprehensive Tauri IPC command layer to enable the desktop app to communicate with the RAC backend services through secure IPC instead of HTTP.

## Architecture

```
Frontend (TypeScript)
  ↓ TauriTransport
  ↓ Tauri IPC (invoke)
  ↓ Rust Commands
  ↓ Application Services
  ↓ Storage Repositories
  ↓ SQLite Database
```

## Implemented Commands

### 1. Health Check (`health_check`)
- **Path**: `/health`
- **Method**: GET
- **Response**: `{ status: string, ok: bool }`
- **Location**: `src/commands/health.rs`

### 2. List Entities (`entities_list`)
- **Path**: `/entities`
- **Method**: GET
- **Query Params**: `context` (optional)
- **Response**: `Vec<Entity>`
- **Location**: `src/commands/entities.rs`

### 3. Get Entity (`entity_get`)
- **Path**: `/entities/{id}`
- **Method**: GET
- **Response**: `Entity`
- **Location**: `src/commands/entities.rs`

### 4. List Links (`links_list`)
- **Path**: `/entities/{id}/links`
- **Method**: GET
- **Response**: `Vec<Link>`
- **Location**: `src/commands/links.rs`

### 5. List Events (`events_list`)
- **Path**: `/events`
- **Method**: GET
- **Query Params**: `limit`, `offset` (optional)
- **Response**: `Vec<Event>`
- **Location**: `src/commands/events.rs`

### 6. Vector Search (`search_vector`)
- **Path**: `/search/vector`
- **Method**: POST
- **Body**: `{ query: string, context?: string, limit?: number, object_types?: string[] }`
- **Response**: `{ items: SearchResult[] }`
- **Location**: `src/commands/search.rs`

## Service Initialization

The Tauri app initializes the following services on startup:

1. **Database Connection**: SQLite pool with migrations
2. **Repositories**: Entity, Facet, Link, Event, Canonical, Schema
3. **Application Services**: Entity, Facet, Canonical, Link, Event, Schema
4. **Embedding Service**: For vector search (TF-IDF, FastEmbed, or Deterministic)

## AppState Structure

```rust
pub struct AppState {
    pub entity_service: Arc<EntityService>,
    pub facet_service: Arc<FacetService>,
    pub canonical_service: Arc<CanonicalService>,
    pub link_service: Arc<LinkService>,
    pub event_service: Arc<EventService>,
    pub schema_service: Arc<SchemaService>,
    pub embedding_service: Arc<EmbeddingService>,
}
```

## Transport Interface Compatibility

All commands implement the Transport interface pattern:

```rust
pub struct TransportRequest {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
    pub query: Option<HashMap<String, String>>,
}
```

This ensures that:
- Frontend code is transport-agnostic (works with HTTP or Tauri)
- Commands parse path parameters (e.g., `/entities/123` → extract `123`)
- Commands extract query params (e.g., `?context=abc&limit=10`)
- POST body is deserialized from JSON

## Database Location

The Tauri app stores its database at:
- **Linux**: `~/.local/share/magnis-desktop/magnis.db`
- **macOS**: `~/Library/Application Support/magnis-desktop/magnis.db`
- **Windows**: `%APPDATA%\magnis-desktop\magnis.db`

## Environment Variables

The embedding service respects these environment variables:

- `EMBEDDINGS_PROVIDER`: `tfidf`, `fastembed`, or `deterministic` (default: `tfidf`)
- `EMBEDDING_MODEL`: Model name (default: `tfidf` or `BGESmallENV15`)
- `EMBEDDINGS_DIM`: Embedding dimension (default: `64`)
- `VECTOR_METRIC`: Distance metric (default: `cosine`)
- `EMBEDDING_CACHE_DIR`: Cache directory for FastEmbed models

## Next Steps

To complete Tauri integration:

1. **Install System Dependencies** (Linux):
   ```bash
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libssl-dev \
     libgtk-3-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev \
     libsoup-3.0-dev \
     libjavascriptcoregtk-4.1-dev \
     libatk1.0-dev
   ```

2. **Build Tauri App**:
   ```bash
   cd desktop/src-tauri
   cargo build
   ```

3. **Run Development Mode**:
   ```bash
   # Terminal 1: Frontend dev server
   cd frontend
   bun run dev

   # Terminal 2: Tauri app (loads frontend from dev server)
   cd desktop/src-tauri
   cargo tauri dev
   ```

## Files Created/Modified

### New Files (5):
- `desktop/src-tauri/src/app_state.rs` - AppState definition
- `desktop/src-tauri/src/commands/entities.rs` - Entity IPC commands
- `desktop/src-tauri/src/commands/links.rs` - Link IPC commands
- `desktop/src-tauri/src/commands/events.rs` - Event IPC commands
- `desktop/src-tauri/src/commands/search.rs` - Search IPC commands

### Modified Files (3):
- `desktop/src-tauri/src/main.rs` - Service initialization and command registration
- `desktop/src-tauri/src/commands/mod.rs` - Export new command modules
- `desktop/src-tauri/Cargo.toml` - Add magnis-api dependency

## Testing

Once system dependencies are installed, test the commands:

```bash
# Build to verify compilation
cargo build

# Run with frontend
cargo tauri dev
```

## Status

✅ **Task #8 Complete**: Tauri IPC commands for entities, links, events, and search are fully implemented and ready for testing once system dependencies are installed.
