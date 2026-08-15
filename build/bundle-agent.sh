#!/usr/bin/env bash
#
# Produce the bundled `agent-server` sidecar binary that Tauri packages
# alongside the desktop app (externalBin in tauri.conf.json).
#
# Contract:
#   - Input: agent/src/index.ts (bun entrypoint)
#   - Output: desktop/src-tauri/binaries/agent-server-<target-triple>
#     Tauri's externalBin convention expects the suffixed name; at runtime the
#     desktop resolves it via MAGNIS_TARGET_TRIPLE (same as magnis-server).
#   - Runs `bun build --compile` to produce a standalone executable
#     (embeds the bun runtime + all deps so end users need no bun installed).
#
# Usage:
#   desktop/build/bundle-agent.sh                # bundle for host triple
#   desktop/build/bundle-agent.sh <triple>       # bundle for explicit triple
#
# Called by the Tauri beforeBuildCommand (and CI) before `cargo tauri build`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO_ROOT/desktop/src-tauri/binaries"

mkdir -p "$OUT_DIR"

triple="${1:-$(rustc -vV | awk '/^host: /{print $2}')}"
if [[ -z "$triple" ]]; then
  echo "bundle-agent: could not resolve target triple (install rustc or pass explicit triple)" >&2
  exit 2
fi

out="$OUT_DIR/agent-server-$triple"

echo "bundle-agent: compiling $REPO_ROOT/agent/src/index.ts → $out"

cd "$REPO_ROOT/agent"
# Deps must be present for `bun build --compile` to bundle them.
bun install --frozen-lockfile
bun build \
  --compile \
  --target="bun" \
  --outfile "$out" \
  src/index.ts

chmod +x "$out"
echo "bundle-agent: wrote $out ($(du -h "$out" | cut -f1))"

# The MCP stdio proxy must ALSO ship. `bun build --compile` embeds the agent's
# own modules, but the proxy is spawned as a SEPARATE process
# (`node <proxy>`, engines/claude.ts + codex.ts) and inside a compiled binary
# `__dirname` no longer resolves to it — the desktop shell therefore passes
# MAGNIS_MCP_PROXY_PATH to the backend, which forwards it to the agent. Without
# this copy that resource does not exist and claude/codex lose EVERY Magnis tool.
PROXY_SRC="$REPO_ROOT/agent/src/mcp-stdio-proxy.mjs"
PROXY_DEST="$REPO_ROOT/desktop/src-tauri/mcp-stdio-proxy.mjs"
[[ -f "$PROXY_SRC" ]] || { echo "bundle-agent: FATAL — missing $PROXY_SRC" >&2; exit 1; }
cp "$PROXY_SRC" "$PROXY_DEST"
echo "bundle-agent: staged $PROXY_DEST"
