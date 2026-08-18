#!/usr/bin/env bash
#
# Build the first-party plugin packages and stage them so Tauri bundles them
# into the .app. The packaged backend points MAGNIS_PLUGINS_DIR /
# MAGNIS_PLUGINS_DIST_DIR at these, so every module (companies, email, telegram,
# …) is presence-seeded at boot and the plugin store/install works offline.
#
#   - plugins/        first-party source packages (manifests + module + ui), tracked
#   - plugins_dist/   built UI bundles (plugins/scripts/build-plugins.ts), gitignored
#
# Output staged into desktop/src-tauri/{plugins,plugins_dist} (gitignored),
# referenced by tauri.conf.json `bundle.resources`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "bundle-plugins: building plugin UI bundles → plugins_dist"
cd "$REPO_ROOT"
bun run plugins-public/scripts/build-plugins.ts

DEST="$REPO_ROOT/desktop/src-tauri"
rm -rf "$DEST/plugins" "$DEST/plugins_dist"
# rsync, not cp -R, and node_modules is excluded on purpose: a workspace
# install leaves SYMLINKS in there pointing at packages outside the plugin
# tree, and Tauri resolves every resource path at build time — one dangling
# link and the whole app fails to build. The bundle needs manifests, schemas,
# built bundles, icons and READMEs; a package's dev dependencies are not part
# of what ships.
rsync -a --exclude node_modules --exclude .git "$REPO_ROOT/plugins-public/plugins/" "$DEST/plugins/"
rsync -a --exclude node_modules --exclude .git "$REPO_ROOT/plugins-public/plugins_dist/" "$DEST/plugins_dist/"
echo "bundle-plugins: staged $(ls "$DEST/plugins" | wc -l | tr -d ' ') plugin package(s) + plugins_dist"
