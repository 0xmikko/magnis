#!/usr/bin/env bash
#
# Produce the bundled `pglite-server` sidecar binary that Tauri packages
# alongside the desktop app (externalBin in tauri.conf.json).
#
# Contract:
#   - Input: scripts/pglite-server.ts (bun entrypoint at repo root)
#   - Output: desktop/src-tauri/binaries/pglite-server-<target-triple>
#     Tauri's externalBin convention expects the suffixed name; at runtime
#     backend_process.rs resolves it via MAGNIS_TARGET_TRIPLE.
#   - Runs `bun build --compile` to produce a standalone executable
#     (embeds the bun runtime so end users don't need bun installed).
#
# Usage:
#   desktop/build/bundle-pglite.sh                # bundle for host triple
#   desktop/build/bundle-pglite.sh <triple>       # bundle for explicit triple
#
# Called by CI and desktop release builds before `cargo tauri build`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/desktop/src-tauri/binaries"

mkdir -p "$OUT_DIR"

triple="${1:-$(rustc -vV | awk '/^host: /{print $2}')}"
if [[ -z "$triple" ]]; then
  echo "bundle-pglite: could not resolve target triple (install rustc or pass explicit triple)" >&2
  exit 2
fi

out="$OUT_DIR/pglite-server-$triple"

echo "bundle-pglite: compiling $REPO_ROOT/scripts/pglite-server.ts → $out"

cd "$REPO_ROOT"
bun build \
  --compile \
  --target="bun" \
  --outfile "$out" \
  scripts/pglite-server.ts

chmod +x "$out"
echo "bundle-pglite: wrote $out ($(du -h "$out" | cut -f1))"
