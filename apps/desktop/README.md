# RAC Desktop - Tauri Application

Tauri desktop application for RAC (Relational Agent Core).

## Architecture

- **Rust backend** (src-tauri): Tauri IPC commands, app paths, integration with RAC backend crates
- **React frontend** (../frontend): UI shell, modules, transport abstraction

## Development

### Prerequisites

- Rust 1.93+ with Cargo
- Bun 1.2+
- System dependencies for Tauri:

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- Install Microsoft Visual Studio C++ Build Tools
- Install WebView2 (usually pre-installed on Windows 11)

For complete prerequisites, see: https://v2.tauri.app/start/prerequisites/

### Running in Development Mode

From the `desktop/src-tauri` directory:

```bash
# Install frontend dependencies first
cd ../../frontend
bun install

# Run Tauri dev mode (starts frontend dev server automatically)
cd ../desktop/src-tauri
cargo tauri dev
```

This will:
1. Start the frontend dev server on http://localhost:5173
2. Build and run the Tauri application
3. Load the frontend inside the Tauri window
4. Enable hot-reload for both frontend and backend changes

### Running Frontend Standalone (HTTP Mode)

For frontend-only development without Tauri:

```bash
cd frontend
bun install
bun run dev
```

Then open http://localhost:5173 in your browser. The app will use HTTP transport to connect to the backend server.

### Building for Production

```bash
cd desktop/src-tauri
cargo tauri build
```

Output will be in `target/release/bundle/`.

## IPC Commands

Currently implemented Tauri commands:

- `health_check`: Returns health status

See `src/commands/` for implementation details.

## App Paths

On first run, the app creates directories:

- **macOS**: `~/Library/Application Support/com.magnis.desktop/`
- **Linux**: `~/.local/share/com.magnis.desktop/`
- **Windows**: `%APPDATA%\com.magnis.desktop\`

This directory is the **Local-mode `data_root`** — the backend owns everything
inside it. Contents:

- `pgdata/` — PGlite (embedded Postgres) data directory
- `storage/` — file uploads, attachments
- `magnis.lock` — POSIX fcntl lockfile enforcing single-instance semantics
- `magnis.json` — instance identity record (pid, started_at, data_dir)
- `pglite.json` — sidecar identity (port, pid) written by PGlite runtime
- `jwt.secret` — per-instance auth signing key
- `logs/` — application logs
- `plugins/` — plugin directory

Override the data root with `DB_PATH=/absolute/path` (must be an absolute
directory — relative paths are rejected because bundled desktop builds do not
guarantee the process CWD).

See `docs/deployment/local.md` for the full Local-mode layout contract.
