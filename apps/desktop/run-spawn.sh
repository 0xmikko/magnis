#!/usr/bin/env bash
#
# ONE-COMMAND spawn-mode launch for local testing — runs EVERYTHING the app
# needs, so we stop hitting the same gaps every time. Starts:
#   • magnis-desktop (GUI) + magnis-server (backend, embedded Postgres) on :3765
# and puts the source-connector + claude binaries on the right PATHs. The
# agent runs INSIDE the backend now, so there is no second server to start:
# the backend spawns the `claude` CLI itself and that child calls back into
# the backend's own /mcp route.
#
# Builds the connector binaries + plugin UI bundles on first run.
#
# Usage:  bash desktop/run-spawn.sh
# Stop:   pkill -f "Magnis.app/Contents/MacOS/magnis"
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
[ -f "$ENV_FILE" ] || { echo "✗ .env not found at $ENV_FILE — set MAGNIS_DOTENV"; exit 1; }
for k in SOURCE_GOOGLE_CLIENT_ID SOURCE_GOOGLE_CLIENT_SECRET SOURCE_TELEGRAM_API_ID SOURCE_TELEGRAM_API_HASH; do
  grep -qE "^$k=" "$ENV_FILE" || echo "⚠ $ENV_FILE missing $k (source connect will fail — these are the MIGRATED names)"
done
[ -d "$APP" ] || { echo "✗ $APP not built. Run: cd desktop && cargo tauri build"; exit 1; }

# No connector build, and no plugin bundles. Both steps predate the catalog
# split twice over: the connectors stopped being Rust binaries (the catalog is
# bun/TypeScript and has no Cargo.toml at all), and packages now reach the app
# through the channel rather than being staged beside it.

# ── stop any previous run ──────────────────────────────────────────────────
pkill -f "Magnis.app/Contents/MacOS/magnis" 2>/dev/null || true
sleep 2

# ── GUI + backend (spawn mode). The backend inherits PATH so it finds both
# the source connectors and the `claude` CLI it spawns for a Claude turn. ──
MAGNIS_DESKTOP_MODE=spawn \
  MAGNIS_ENV_FILE="$ENV_FILE" \
  PATH="$REPO/target/release:$HOME/.local/bin:/opt/homebrew/bin:$HOME/.bun/bin:$PATH" \
  "$APP/Contents/MacOS/magnis-desktop" >/tmp/magnis-desktop.log 2>&1 &
echo "▶ desktop+backend pid $!  (log: /tmp/magnis-desktop.log)"

for i in $(seq 1 60); do curl -fsS -m 2 http://127.0.0.1:3765/health >/dev/null 2>&1 && break; sleep 0.5; done

echo
echo "  backend  $(curl -s -o /dev/null -w '%{http_code}' -m 2 http://127.0.0.1:3765/health)  http://127.0.0.1:3765"
echo
echo "✓ up. Reminders: Telegram works; Gmail needs http://127.0.0.1:3765/oauth/callback in Google Cloud."
