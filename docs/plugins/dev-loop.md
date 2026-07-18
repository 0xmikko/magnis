# Plugin dev loop — no GitHub round-trips

Three modes, from fastest to most production-like. All on the same disk;
the GitHub `catalog` branch is only the PUBLISHED end state.

## 1. Tree dev (hot reload) — the default while writing code

Point the backend at your working checkout and just edit files:

```bash
MAGNIS_PLUGINS_DIR=/path/to/magnis/plugins   # this checkout
```

- **Module code** (`module/*.ts`): the plugins watcher evicts the V8 isolate
  on every `.ts`/`manifest.toml` change — next call re-transpiles on the fly.
- **UI** (`ui/*.tsx`): served on-the-fly (no-store) by the dev fallback —
  refresh the browser tab.
- No catalog, no index, no rebuild. In magnis-app the submodule checkout
  (`plugins-public/`) IS such a working tree — edit it in place, commit here.

## 2. Local file:// catalog — developing the INSTALL flow itself

Build the catalog on disk and point the app's channel at it:

```bash
bun scripts/build-plugins.ts && bun scripts/build-catalog-index.ts
MAGNIS_CATALOG_URL=file://$PWD/catalog       # same-disk "releases"
```

Then in the app: `extensions.catalog.refresh` → the local index is the
channel. Re-run the two builds after edits — same integrity pipeline
(per-file sha256) as production, zero network.

## 3. GitHub catalog — the published channel

Merge to `main`; CI rebuilds and force-pushes the `catalog` branch:

```bash
MAGNIS_CATALOG_URL=https://raw.githubusercontent.com/0xmikko/magnis/catalog
```

Mode 1 is where you live; mode 2 when touching install/verify/store logic;
mode 3 is what users get.
