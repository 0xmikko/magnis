# Plugin Runtime Architecture

How a TypeScript module runs inside the Rust backend, and the constraints that
shaped the design. Source of truth: `backend/src/plugin_runtime/`.

## The big picture

```
                        ┌─────────────────────── magnis-server (host) ───────────────────────┐
  WS /ws ─┐             │  RpcRouter::dispatch(&AppState, ctx, method, params)                │
  /api/rpc├─ method ───▶│   ├─ native module handler? run it (DB on host runtime)             │
          │             │   └─ plugin route? → PluginDispatcher.dispatch_with_state(.., state) │
          │             │                              │ mpsc                                  │
          │             │   ┌──────────────────────────▼─────────────── plugin worker thread ─┐│
          │             │   │ current-thread tokio rt + ONE V8 isolate (deno_core)            ││
          │             │   │  PluginRegistry::dispatch_with_host → invoke JS handler         ││
          │             │   │   JS calls Deno.core.ops.op_graph_* / op_plugin_rpc_call        ││
          │             │   │     └─ on_host(fut) ── marshals the DB future ───┐              ││
          │             │   └───────────────────────────────────────────────── │ ────────────┘│
          │             │   host runtime runs the DB future on its single PGlite connection ◀──┘│
          └─────────────┴──────────────────────────────────────────────────────────────────────┘
```

## Why one thread per plugin

`deno_core` / `rusty_v8` aborts the process if a second `JsRuntime` is created
while another is alive **on the same OS thread** ("Cannot create a handle
without a HandleScope"). So `PluginDispatcher` (`dispatcher.rs`) runs each
plugin on its **own dedicated OS thread** with a current-thread tokio runtime
and exactly one isolate. The dispatcher holds only `mpsc::Sender`s + the
`method → plugin_id` routing table, so it is `Clone + Send + Sync` and lives
inside `AppState`. Cross-plugin calls run in parallel; one plugin's calls
serialize through its own channel.

## Why workers never touch the DB (the PGlite constraint)

In Local/desktop mode the database is **PGlite**: a single WASM backend that
permits **exactly one** sqlx connection. That connection is bound to the
**host** runtime's reactor. A plugin worker, on its own current-thread runtime,
**cannot** drive that connection — acquiring it cross-runtime times out
(`pool timed out while waiting for an open connection`).

Therefore **plugin workers do no DB I/O on their own runtime**. Two mechanisms:

1. **Discovery is handed in, not queried.** `PluginDispatcher::spawn` discovers
   the routing table + each plugin's manifest capabilities **once on the host
   runtime** (`PluginRegistry::discover_with_graph`), then hands each worker its
   `PluginRoute` table via `PluginRegistry::from_routes` — the worker performs
   **no** `SELECT`.
2. **Ops marshal their futures to the host.** Every graph/rpc op wraps its DB
   work in `on_host(&state, fut)` (`ops/graph.rs`), which does
   `host_runtime.spawn(fut).await`. The future runs on the host runtime (where
   the connection lives); the worker just awaits the join handle. The bootstrap
   "completed" stamp marshals the same way. `on_host` falls back to an inline
   `await` when no host runtime is registered (single-runtime unit tests).

The boot handshake is **async** (`tokio::sync::oneshot`), not a blocking recv —
otherwise the host thread would block waiting for the worker while the worker
waits for the host to poll its marshaled future → deadlock on a current-thread
host runtime.

> **Rule for op authors:** never `.await` a DB future directly on the worker.
> Read what you need from `OpState` synchronously, then run the DB call inside
> `on_host(&state, async move { ... })`. All captured values must be owned and
> `move`d (the future must be `Send + 'static`).

## Per-dispatch identity + host handle

Each RPC carries the calling `user_id`. `PluginRegistry::dispatch_with_host`
stamps it onto `OpState`'s `ModuleContext` (`set_dispatch_user`, DEC-12) before
the handler runs — the isolate is cached per-plugin, not per-user. The owned
`AppState` for the cross-module hub is installed the same way
(`set_dispatch_host`) and cleared after the handler returns, so a worker never
retains `AppState` (no `AppState ⇄ dispatcher` reference cycle). See
[cross-module-hub.md](cross-module-hub.md).

## Install + bootstrap lifecycle

- **Install** (`services/plugin_install`): reads `plugins/modules/<id>/manifest.json`,
  validates it, persists the manifest + a row in `installed_extensions`
  (`implementation_kind = 'deno_plugin'`), and registers the module's schemas
  (entities/facets/links) **and canonical mappings** (DEC-16) into the graph.
  `install_bundled_plugins` installs every plugin under `MAGNIS_PLUGINS_DIR` at
  server boot. **A module ships NO SQL migrations.** Entities, facets, and links
  are generic rows in the shared graph tables; "registering a schema" inserts a
  schema *definition* (+ its canonical mappings) that the core validates writes
  against. You only touch migrations if you change the generic graph storage
  itself — never per module.
- **Discover** (`PluginRegistry::discover_with_graph`): joins
  `installed_extensions` to `plugin_manifests` for enabled `deno_plugin` rows,
  parses each manifest, and builds the `rpc_method → plugin_id` routes + the
  `PluginRoute` table (which carries the parsed `capabilities`).
- **Dispatch fallback** (`api/websocket/router.rs`): the router runs native
  handlers first; if no native handler owns `method` but
  `state.plugin_dispatcher.has_route(method)`, it delegates to the dispatcher.

## Layering rule

`plugin_runtime` may depend on `crate::state::AppState` (single crate, the hub
needs the router) but the DEPENDENCY DIRECTION of the domain logic still holds:
plugins are clients of the host's storage, never direct DB drivers. The Rust
core carries no domain schemas — deleting a native module must leave the core
compiling (that is the migration's acceptance bar).
