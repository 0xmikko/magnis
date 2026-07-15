# Writing a New Module — End-to-End

A checklist for shipping a module as a plugin. Read
[architecture](architecture.md), [manifest](manifest.md),
[backend-module](backend-module.md), [cross-module-hub](cross-module-hub.md),
and [ui](ui.md) first. Mirror `plugins/modules/contacts` (full: schemas, facets, links,
hub, merge) or `plugins/modules/companies` (simpler). `/write_module` scaffolds steps
1–3.

## 0. Decide the model

- Entity schema id(s): `<id>.<entity>` (e.g. `tasks.task`).
- Facets (typed data blocks) + their canonical `mappings`.
- Links to other modules' entities (kind, from, to).
- RPC surface (list/get/search/create/update/merge/…), which are agent `tools`.
- Cross-module effects → which other module's RPC you'll call (the hub), NOT a
  foreign-schema write.

## 1. `plugins/modules/<id>/manifest.json`

- `id`, `version`, `owns`, `schemas` (entities/facets/links with `mappings`),
  `surfaces` (`rpc_handlers`, `tools`), `entry`.
- `capabilities`: `facet_write_prefixes: ["<id>."]`, plus
  `link_kinds_writable`, `reads_schemas`, `rpc_calls`, `can_merge_schemas`,
  `events_emitted` **only as needed** (least privilege).

## 2. `plugins/modules/<id>/module/` (backend)

- `index.ts`: `definePlugin(<Class>)`.
- `service.ts`: the `@tool`/`@writeTool`-decorated class; constructor takes
  `PluginDeps` (`graph`, `rpc`, `util`, `ctx`).
- Use `graph.*` for own schemas; use `rpc.execute(...)` + `graph.add_link(...)`
  for cross-module effects. Idempotency via `client_id` / `util.uuid_v5`.
- Match the return shapes consumers expect.

## 3. `plugins/modules/<id>/ui/` (frontend)

- `index.tsx`: `defineModule({ ... })` exporting `<Name>Module`.
- Components import host only via `@magnis/host/*`; data via
  `useAppRuntime().transport.rpc`.
- If you use a host symbol not yet exposed, add it to the **three layers**
  (`hostShims/<area>.ts`, `hostModules.ts`, `host_shim.rs`).
- Register in `frontend/src/modules/index.ts` via `loadPluginModule("<id>",
  "index.tsx")` + add to `cachedModules`.
- Raw utility classes are covered by the existing
  `@source "../../plugins/**/ui/**"` in `frontend/src/app.css`.

## 4. Tests (TDD — RED first)

- **Backend:** integration tests via `TestCore`. For tests that only need your
  schemas registered, add an `install_<id>_plugin` helper to
  `tests/integrations/common/bootstrap.rs` (mirrors `install_contacts_plugin`):

  ```rust
  pub async fn install_tasks_plugin(pool: &PgPool) {
      let plugins_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
          .parent().expect("repo root").join("plugins");
      magnis::services::plugin_install::PluginInstaller::new(plugins_root, pool.clone())
          .expect("plugin installer")
          .install("module", "tasks")          // ("module", "<id>")
          .await
          .expect("install tasks plugin (registers schemas + mappings)");
  }
  ```

  Tests that exercise RPC handlers or the cross-module hub need a **real
  dispatcher** — build the state with `core.app_state_with_plugins(...)` (it
  installs the plugin AND spawns the `PluginDispatcher`), not `core.app_state`.
- Unit-test capability gates in `capability.rs` style if you add new ones.
- **Frontend:** `__tests__/` under `ui/` (vitest), importing `@magnis/host/*`.

## 5. Verify (all green, no exceptions)

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p magnis --test integrations          # + --workspace for schema/migration changes
cd frontend && bun run typecheck && bun run lint && bun run test
```

## 6. See it live

```bash
# rebuild the binary first — the demo script runs the PRE-BUILT magnis-server
cargo build -p magnis --bin magnis-server --bin magnis-plugin-seed
BACKEND_PORT=3090 FRONTEND_PORT=5299 SEEDER_PGLITE_PORT=39002 \
PLUGIN_DEMO_DB_PATH=/tmp/magnis-<id>-demo-db RESET_DB=1 \
bash scripts/run-plugin-companies-demo.sh
```

`install_bundled_plugins` picks up every plugin under `MAGNIS_PLUGINS_DIR` at
boot. Sanity-check over HTTP (Open mode): `POST /api/auth/login` → token →
`POST /api/rpc {method, params}`.

## Common traps (learned this migration)

- **Worker DB timeout** (`pool timed out`) → you did DB I/O on the worker
  runtime; wrap it in `on_host`, and don't make plugin workers query the DB at
  boot.
- **"host rpc unavailable"** → hub call on the single-runtime unit path; use the
  full app harness.
- **Capability error / silent no-write** → missing `capabilities` entry in the
  manifest. No fallbacks — add the entry.
- **Flat / unstyled UI** → Tailwind `@source` not covering your plugin, or
  stale dev server.
- **`undefined` host import at runtime** → host symbol missing from one of the
  three layers (usually `hostModules.ts` or `host_shim.rs`).
- **Stale demo behavior** → the demo runs the pre-built binary; rebuild after
  backend changes.
- **Deleting a native module must leave the Rust core compiling** — that's the
  acceptance bar; the core is generic.
