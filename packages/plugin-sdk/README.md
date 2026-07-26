# @magnis/plugin-sdk

Shared types and helpers for Magnis **domain modules** — the plugins that shape ingested data into the graph and serve UI, running inside the core in sandboxed V8 isolates under capability manifests.

Type-only at runtime: the package defines the shapes a module is written against; the core provides the live implementations when it loads the module.

Authoring guide: [docs/plugins/module.md](../../docs/plugins/module.md) · manifest reference: [docs/plugins/manifest.md](../../docs/plugins/manifest.md) · scaffold a new module: `bun scripts/plugin-new.ts <id>`.
