# Installation Guide

## System Dependencies (Linux)

Before building the Tauri desktop app, install system dependencies:

### Ubuntu/Debian
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

### Fedora
```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

### Arch Linux
```bash
sudo pacman -S webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  libappindicator-gtk3 \
  librsvg
```

## Quick Start

1. Install system dependencies (see above)
2. Install frontend dependencies:
   ```bash
   cd frontend
   bun install
   ```
3. Build and run:
   ```bash
   cd desktop/src-tauri
   cargo tauri dev
   ```

## Troubleshooting

### "Failed to find libwebkit2gtk"
Install webkit2gtk-4.1-dev (Ubuntu/Debian) or webkit2gtk4.1-devel (Fedora)

### "Failed to link @magnis/core"
Ensure the backend-ts/core symlink exists:
```bash
mkdir -p frontend/node_modules/@magnis
ln -sf ../../backend-ts/core frontend/node_modules/@magnis/core
```

### Port 5173 already in use
Change the port in frontend/vite.config.ts or kill the existing process:
```bash
lsof -ti:5173 | xargs kill -9
```
