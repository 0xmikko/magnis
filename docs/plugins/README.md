# Magnis Plugins — Developer Guide

This directory documents how Magnis **domain modules** are built as plugins:
TypeScript that runs in an embedded V8 isolate on the backend, plus a React UI
served at runtime to the frontend. The Rust core stays **generic** — it owns
storage, the graph, sync, and the agent runtime, but knows nothing about
"contacts" or "companies". Each module ships its schemas, RPC surface, agent
tools, and UI as a self-contained plugin under `plugins/modules/<id>/`.

`companies` and `contacts` are the two reference implementations. Read their
code alongside these docs.

## Read in this order

1. **[architecture.md](architecture.md)** — the runtime model: V8 isolates, the
   one-thread-per-plugin dispatcher, why all DB I/O marshals to the host
   runtime, and the install/bootstrap lifecycle.
2. **[manifest.md](manifest.md)** — `manifest.json` reference: schemas (with
   canonical `mappings`), capabilities, surfaces, entry points.
3. **[backend-module.md](backend-module.md)** — writing the backend module:
   `definePlugin`, `@tool`/`@writeTool`, `PluginDeps`, the `graph` API, and how
   capabilities are enforced.
4. **[cross-module-hub.md](cross-module-hub.md)** — the cross-module RPC "hub":
   how a module calls **another** module (`rpc.execute`) instead of writing a
   foreign schema, plus `graph.add_link`.
5. **[ui.md](ui.md)** — the React UI: `plugins/modules/<id>/ui`, the `@magnis/host/*`
   surface (and its three-layer wiring), Tailwind `@source`, and how the
   frontend loads it.
6. **[write-a-module.md](write-a-module.md)** — end-to-end checklist for a new
   module. Start here once you understand the model.

The **`/write_module`** skill (`.claude/skills/write_module/SKILL.md`, tracked in
the repo) automates the scaffold + walks an agent through these steps and the
verification gates.

## Directory layout of a plugin

```
plugins/modules/<id>/
  manifest.json          # schemas + capabilities + surfaces + entry points
  module/                # backend module (V8 isolate)
    index.ts             #   definePlugin(<Class>)
    service.ts           #   the @tool/@writeTool-decorated class
    helpers.ts, types/   #   view builders, DTOs
  ui/                    # React UI (served at /api/plugins/modules/<id>/ui/<file>)
    index.tsx            #   defineModule({ ... }) — the ModuleDefinition
    *.tsx, queries.ts, types.ts, __tests__/
```

`packages/plugin-sdk/index.ts` is the **single SDK** both halves import as
`@magnis/plugin-sdk` (backend) and provides the UI's `@magnis/host/*` types.

## The decisions that shaped this (don't re-litigate without reason)

| # | Decision | Where |
|---|----------|-------|
| Rust is generic | No domain schemas in Rust; modules own their schemas via the manifest. Deleting a native module must leave the core compiling. | [architecture](architecture.md) |
| One thread per plugin | deno_core aborts if two `JsRuntime`s live on one thread; each plugin gets its own OS thread + isolate. | [architecture](architecture.md) |
| Workers are DB-free | PGlite allows exactly ONE connection, bound to the host runtime. Plugin workers never touch the DB on their own runtime — discovery is handed in, and every op marshals its DB future to the host via `on_host`. | [architecture](architecture.md) |
| Manifest carries schemas + mappings (DEC-16) | Canonical `mappings` travel in `FacetSchema.mappings`; the installer persists them. The manifest is the single source of a module's schemas. | [manifest](manifest.md) |
| Manifest-driven capabilities (DEC-10) | `ModuleContext` is built from the manifest's `capabilities`, not hard-coded. Every write/read/link/rpc is capability-checked. | [backend-module](backend-module.md) |
| Cross-module RPC hub (DEC-1..9) | A module with the `rpc_calls` capability calls another module's RPC (`rpc.execute`) instead of writing its schema. Synchronous, native-only in v0, runs on the host runtime, inherits the caller's user. | [cross-module-hub](cross-module-hub.md) |
| `graph.add_link` gated by `link_kinds_writable` (DEC-8) | Plugins create typed links only for declared kinds. | [cross-module-hub](cross-module-hub.md) |
| UI is a runtime-loaded plugin | `plugins/modules/<id>/ui` is served by the backend and dynamic-imported by the frontend (`loadPluginModule`). It imports the host via `@magnis/host/*`, never deep frontend paths. | [ui](ui.md) |
| Host surface = three synced layers | Every value a UI imports from `@magnis/host/*` must appear in `hostShims/<area>.ts` (typecheck), `hostModules.ts` (runtime registry), AND `host_shim.rs` (allowlist). Drift = runtime crash. | [ui](ui.md) |
| Plugin UIs need Tailwind `@source` | Tailwind v4 only scans `frontend/`; `frontend/src/app.css` has `@source "../../plugins/**/ui/**"` so plugin utility classes aren't purged. | [ui](ui.md) |

The full spec with rationale for the hub decisions is
`docs/plans/plugin-cross-module-rpc-hub.md`.
