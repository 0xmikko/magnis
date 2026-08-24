#!/usr/bin/env bash
#
# Build the first-party plugin packages and stage them so Tauri bundles them
# into the .app. The packaged backend points MAGNIS_PLUGINS_DIR /
# MAGNIS_PLUGINS_DIST_DIR at these, so every module (companies, email, telegram,
# …) is presence-seeded at boot and the plugin store/install works offline.
#
#   - plugins/        first-party source packages (manifests + module + ui), tracked
#   - plugins_dist/   built UI bundles (the catalog's scripts/build-plugins.ts), gitignored
#
# NOT on the default DMG path: `tauri.conf.json`'s beforeBuildCommand does not
# call this, because a packaged app installs from the channel like every other
# install. Kept, per docs/plans/mac-dmg-github-catalog.md, for a hybrid build.
#
# Output staged into desktop/src-tauri/{plugins,plugins_dist} (gitignored),
# referenced by tauri.conf.json `bundle.resources`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# The catalog is a separate repository now. This script is kept for the
# hybrid case — bundling packages INTO the .app instead of letting it install
# them from the channel — so it asks where the catalog is instead of assuming
# a submodule directory that no longer exists.
# shellcheck source=scripts/catalog-checkout.sh
. "$REPO_ROOT/scripts/catalog-checkout.sh"
CATALOG="$(catalog_checkout)"

echo "bundle-plugins: building plugin UI bundles → plugins_dist"
( cd "$CATALOG" && bun run scripts/build-plugins.ts )

DEST="$REPO_ROOT/desktop/src-tauri"
rm -rf "$DEST/plugins" "$DEST/plugins_dist"
# rsync, not cp -R, and node_modules is excluded on purpose: a workspace
# install leaves SYMLINKS in there pointing at packages outside the plugin
# tree, and Tauri resolves every resource path at build time — one dangling
# link and the whole app fails to build. The bundle needs manifests, schemas,
# built bundles, icons and READMEs; a package's dev dependencies are not part
# of what ships.
rsync -a --exclude node_modules --exclude .git "$CATALOG/plugins/" "$DEST/plugins/"
rsync -a --exclude node_modules --exclude .git "$CATALOG/plugins_dist/" "$DEST/plugins_dist/"
echo "bundle-plugins: staged $(ls "$DEST/plugins" | wc -l | tr -d ' ') plugin package(s) + plugins_dist"
