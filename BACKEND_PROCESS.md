# Backend Process Architecture

The Tauri desktop app launches the Rust backend (`magnis-server`) as a **separate process** and connects to it via **HTTP (RPC)**.

## Architecture

```
┌─────────────────┐
│  Tauri Desktop  │
│   (Frontend)     │
│  React + Vite   │
└────────┬────────┘
         │ HTTP (RPC)
         │ http://127.0.0.1:3765
         ▼
┌─────────────────┐
│  magnis-server     │
│  (Backend)      │
│  Axum HTTP API  │
└─────────────────┘
```

## How It Works

1. **Desktop app starts** (`desktop/src-tauri/src/main.rs`):
   - Initializes app paths (database location, logs, plugins)
   - Spawns `magnis-server` as a child process with `DB_PATH` and `PORT` env vars
   - Waits for backend to become healthy (polls `/health` endpoint)
   - Exposes `get_backend_config` Tauri command that returns `{ base_url: "http://127.0.0.1:3765" }`

2. **Frontend connects** (`frontend/src/core/transport.ts`):
   - In Tauri mode, calls `invoke("get_backend_config")` to get backend URL
   - Creates `HttpClient` transport with that URL
   - All API calls go over HTTP to the spawned backend process

3. **On app exit**:
   - Tauri window close event triggers backend process shutdown
   - Backend process is killed gracefully

## Building & Running

### Prerequisites

Build the backend server first:

```bash
# From repo root
cargo build -p magnis-server --release
```

This creates `target/release/magnis-server`.

### Running Desktop App

```bash
# From repo root
cd desktop
cargo tauri dev
```

The desktop app will:
1. Look for `magnis-server` binary in:
   - Same directory as desktop executable (`target/release/magnis-server` or `target/debug/magnis-server`)
   - Repo root `target/release/magnis-server` or `target/debug/magnis-server`
   - Or use `MAGNIS_SERVER_PATH` environment variable

2. Spawn the backend on port 3765 (default)

3. Frontend connects via HTTP to `http://127.0.0.1:3765`

## Configuration

- **Port**: Default is `3765`. Change in `desktop/src-tauri/src/backend_process.rs` → `pick_port()`
- **Backend binary path**: Set `MAGNIS_SERVER_PATH` env var to override auto-detection
- **Database**: Backend uses `DB_PATH` env var (set by desktop app to `~/.local/share/com.magnis.desktop/magnis.db`)

## CORS

The backend API (`backend/api/src/server.rs`) includes CORS middleware allowing requests from:
- `http://localhost:*` (dev mode)
- `tauri://localhost` (production Tauri app)

## Benefits

- **Separation**: Backend runs independently, can be debugged separately
- **Flexibility**: Backend can be reused by other clients (CLI, web, etc.)
- **Isolation**: Frontend crashes don't affect backend, and vice versa
- **Development**: Can run backend standalone for testing
