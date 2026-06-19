#!/usr/bin/env bash
#
# Build the first-party plugin packages and stage them so Tauri bundles them
# into the .app. The packaged backend points MAGNIS_PLUGINS_DIR /
# MAGNIS_PLUGINS_DIST_DIR at these, so every module (companies, email, telegram,
# …) is presence-seeded at boot and the plugin store/install works offline.
#
#   - plugins/        first-party source packages (manifests + module + ui), tracked
#   - plugins_dist/   built UI bundles (scripts/build-plugins.ts), gitignored
#
# Output staged into desktop/src-tauri/{plugins,plugins_dist} (gitignored),
# referenced by tauri.conf.json `bundle.resources`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "bundle-plugins: building plugin UI bundles → plugins_dist"
cd "$REPO_ROOT"
bun run scripts/build-plugins.ts

DEST="$REPO_ROOT/desktop/src-tauri"
rm -rf "$DEST/plugins" "$DEST/plugins_dist"
cp -R "$REPO_ROOT/plugins" "$DEST/plugins"
cp -R "$REPO_ROOT/plugins_dist" "$DEST/plugins_dist"
echo "bundle-plugins: staged $(ls "$DEST/plugins" | wc -l | tr -d ' ') plugin package(s) + plugins_dist"
