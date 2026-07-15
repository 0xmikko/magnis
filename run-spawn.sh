#!/usr/bin/env bash
#
# ONE-COMMAND spawn-mode launch for local testing — runs EVERYTHING the app
# needs, so we stop hitting the same gaps every time. Starts:
#   • magnis-desktop (GUI) + magnis-server (backend, embedded Postgres) on :3765
#   • agent-server (subscription Claude) on :3002, wired to the backend MCP
# and puts the source-connector + claude + node binaries on the right PATHs.
#
# Builds the connector binaries + plugin UI bundles on first run.
#
# Usage:  bash desktop/run-spawn.sh
# Stop:   pkill -f "Magnis.app/Contents/MacOS/magnis"; pkill -f agent-server
#
# DO NOT replace this with ad-hoc manual launches — that is what kept breaking.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO/desktop/src-tauri/target/release/bundle/macos/Magnis.app"
ENV_FILE="${MAGNIS_DOTENV:-/Users/mikko/Coding/magnis-app/.env}"
TRIPLE="$(rustc -vV | awk '/^host: /{print $2}')"

# bun + claude live outside the default non-interactive PATH.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

# ── prerequisites ──────────────────────────────────────────────────────────
command -v claude >/dev/null || { echo "✗ 'claude' CLI not found (needed for the agent — SUBSCRIPTION, not API key)"; exit 1; }
command -v node   >/dev/null || { echo "✗ 'node' not found (needed for the MCP stdio proxy)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "✗ .env not found at $ENV_FILE — set MAGNIS_DOTENV"; exit 1; }
for k in SOURCE_GOOGLE_CLIENT_ID SOURCE_GOOGLE_CLIENT_SECRET SOURCE_TELEGRAM_API_ID SOURCE_TELEGRAM_API_HASH; do
  grep -qE "^$k=" "$ENV_FILE" || echo "⚠ $ENV_FILE missing $k (source connect will fail — these are the MIGRATED names)"
done
[ -d "$APP" ] || { echo "✗ $APP not built. Run: cd desktop && cargo tauri build"; exit 1; }

# ── build connector binaries + plugin bundles if missing ───────────────────
if [ ! -x "$REPO/target/release/magnis-google" ] || [ ! -x "$REPO/target/release/magnis-telegram" ]; then
  echo "▶ building source connectors…"
  # Connectors build in the plugin workspace (plugins-public-repo DEC-3),
  # shared target keeps target/release paths stable.
  ( cd "$REPO" && cargo build --release --manifest-path plugins-public/Cargo.toml --target-dir target -p magnis-source-google -p magnis-source-telegram )
fi
[ -d "$REPO/plugins_dist" ] || { echo "▶ building plugin UI bundles…"; ( cd "$REPO" && bun run scripts/build-plugins.ts ); }

# ── stop any previous run ──────────────────────────────────────────────────
pkill -f "Magnis.app/Contents/MacOS/magnis" 2>/dev/null || true
pkill -f "agent-server" 2>/dev/null || true
sleep 2

# ── 1. GUI + backend (spawn mode); backend inherits PATH (connectors) ──────
MAGNIS_DESKTOP_MODE=spawn \
  PATH="$REPO/target/release:$PATH" \
  "$APP/Contents/MacOS/magnis-desktop" >/tmp/magnis-desktop.log 2>&1 &
echo "▶ desktop+backend pid $!  (log: /tmp/magnis-desktop.log)"

for i in $(seq 1 60); do curl -fsS -m 2 http://127.0.0.1:3765/health >/dev/null 2>&1 && break; sleep 0.5; done

# ── 2. agent (subscription Claude); needs claude + node + the MCP proxy ────
AGENT_PORT=3002 AGENT_HOST=127.0.0.1 BACKEND_URL=http://127.0.0.1:3765 \
  DEFAULT_ENGINE=claude \
  MAGNIS_MCP_PROXY_PATH="$REPO/agent/src/mcp-stdio-proxy.mjs" \
  MAGNIS_ENV_FILE="$ENV_FILE" \
  PATH="$HOME/.local/bin:/opt/homebrew/bin:$REPO/target/release:$HOME/.bun/bin:$PATH" \
  "$APP/Contents/MacOS/agent-server" >/tmp/magnis-agent.log 2>&1 &
echo "▶ agent pid $!  (log: /tmp/magnis-agent.log)"

for i in $(seq 1 30); do curl -fsS -m 2 http://127.0.0.1:3002/health >/dev/null 2>&1 && break; sleep 0.5; done

echo
echo "  backend  $(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:3765/health)  http://127.0.0.1:3765"
echo "  agent    $(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:3002/health)  http://127.0.0.1:3002 (engine: claude)"
echo
echo "✓ up. Reminders: Telegram works; Gmail needs http://127.0.0.1:3765/oauth/callback in Google Cloud."
