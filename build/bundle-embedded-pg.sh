#!/usr/bin/env bash
# Build magnis-server with the PostgreSQL archive BUNDLED into the binary
# (offline desktop build — no runtime download). Replaces bundle-pglite.sh.
#
# The postgresql_embedded `bundled` build script downloads the theseus archive
# at COMPILE time into the binary; its own reqwest downloader is unreliable in
# our sandbox, so we pre-seed the archive into the crate's build cache with curl
# (which works) and pin an EXACT POSTGRESQL_VERSION so the build script reuses
# the cached file instead of fetching. Then we stage the binary into Tauri's
# `externalBin` location (target-triple-suffixed name).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_VERSION="${PG_VERSION:-16.13.0}" # exact theseus 16.x release
TARGET="${TARGET:-$(rustc -vV | sed -n 's/host: //p')}"
ASSET="postgresql-${PG_VERSION}-${TARGET}.tar.gz"
CACHE="${HOME}/.theseus/postgresql"

mkdir -p "$CACHE"
if [ ! -f "$CACHE/$ASSET" ]; then
  echo "Pre-seeding theseus PostgreSQL archive → $CACHE/$ASSET"
  curl -fSL -o "$CACHE/$ASSET" \
    "https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/${ASSET}"
fi

echo "Building magnis-server (--features embedded-pg,bundled, offline from cache)…"
cd "$REPO_ROOT"
POSTGRESQL_VERSION="=${PG_VERSION}" \
  cargo build --release -p magnis --bin magnis-server --features embedded-pg,bundled

DEST="$REPO_ROOT/desktop/src-tauri/binaries"
mkdir -p "$DEST"
cp "$REPO_ROOT/target/release/magnis-server" "$DEST/magnis-server-${TARGET}"
echo "Staged Tauri externalBin: $DEST/magnis-server-${TARGET}"
