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

echo "Pre-seed complete. The desktop crate embeds this archive itself:"
echo "  - postgresql_embedded/bundled compiles it into magnis-desktop"
echo "  - .cargo/config.toml pins POSTGRESQL_VERSION so the"
echo "    build script reuses THIS file instead of resolving 'latest' online"
echo
echo "This script no longer builds a backend. The shell owns the cluster now,"
echo "and the backend is the checksum-verified binary staged from the public runtime artifact."
