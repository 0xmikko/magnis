# Plugin structure

How every Magnis plugin is laid out on disk, and why. One rule, applied to two
different kinds of extension.

## Two kinds, on purpose

Magnis has two kinds of first-party extension, and they are genuinely different
things — not two styles of the same thing:

- A **module** runs as a V8 isolate **inside** the backend. It owns a slice of
  the graph: it registers schemas, reads and writes entities/facets, and draws
  UI. SDK: `@magnis/plugin-sdk`. Idiom: a decorator-declared class handed to
  `definePlugin`.
- A **source** runs as a **separate MCP process**, spawned by the host. It pulls
  data from an external service and **emits it over the wire** per its surface
  contract; it owns no graph schema (the host module for that surface does).
  SDK: `@magnis/connector-sdk`. Idiom: a `ConnectorConfig` object handed to
  `runConnector`.

Do not try to make a source look like a module. A source has no service class,
no UI, no install-time graph lifecycle. Its shape is simpler because it *is*
simpler.

## The one rule: each real part in its own folder

A **part** is a unit of the plugin with more than one file's worth of concern.
Every part gets a folder; everything genuinely shared sits as a loose file in
the root. A concern that is a single file stays a single file — no folder for
one file.

The parts differ by kind, because the kinds differ:

| | Module | Source |
|---|---|---|
| part-folders | `module/`, `ui/`, `lifecycle/` (only with a migration) | `surfaces/<name>/` — one per surface it returns |
| shared root files | `types.ts`, `schema.ts`, `manifest.toml`, `package.json`, `tsconfig.json` | `src/` root: transport, auth, `connector.ts`, `main.ts`, `helpers.ts` |

### Module layout

```
<module>/
  manifest.toml          # the declared contract: entry, schemas, capabilities
  types.ts               # the module's shared shapes (one predictable address)
  schema.ts              # schema-id constants for read/write call sites
  module/                # backend part (V8)
    index.ts             # definePlugin entry (manifest entry.module points here)
    service.ts           # the class ONLY — no free functions, no constants
    helpers.ts           # free functions used by service
    __tests__/           # whole-module tests, on @magnis/testkit
  ui/                    # frontend part (React) — manifest entry.ui points here
  lifecycle/             # ONLY if the module ships a data migration (see below)
```

Rules:
- `service.ts` is **the class and nothing else**. Schema-id constants live in
  `schema.ts`; free functions live in `helpers.ts`.
- `types.ts` and `schema.ts` are single loose files at the root — a module has
  one shared shape-vocabulary and one shared id-vocabulary, so one file each.
- No single-file folders. `types/index.ts` is wrong; `types.ts` is right.

### Source layout

A source is grouped by **what it returns** — its surfaces. Each surface is a
vertical slice: how it fetches, how it maps to the graph, its types, its
schema-ids, its test. All of that lives in the surface's folder. Only what is
shared *across* surfaces stays in the `src/` root.

```
<source>/
  manifest.toml          # [source], [spawn] (bun run src/main.ts), [auth]...
  src/
    main.ts              # entry: runConnector(buildConnectorConfig())  — manifest [spawn] points here
    connector.ts         # buildConnectorConfig(fetchFn) — wires surfaces together
    api.ts / http.ts     # shared HTTP client to the external service
    auth.ts / oauth.ts   # shared authentication
    helpers.ts           # cross-surface utilities
    surfaces/
      <surface-a>/       # e.g. tweets/  — fetcher + its types + its schema-ids + its test
      <surface-b>/       # e.g. contacts/
```

Rules:
- One folder per surface **declared in the manifest** (`surfaces = [...]`).
  Always a folder, regardless of current size — a source grows by surface (a
  Twitter source will add DMs, profiles, trends), and the folder is where that
  growth lands without reshaping anything.
- Per-surface `types` and `schema-ids` live **inside** the surface folder — they
  describe what that surface returns, so they belong to the surface, not the
  root.
- The `src/` root holds only what is shared across surfaces: transport, auth,
  the connector wiring, `main.ts`, cross-surface helpers.
- Things that are not surfaces are not folders: a health `probe`, the API
  client, auth — these are shared plumbing in the root, even if the plugin has
  one of each.

## Lifecycle: folder only when there is real work

A module's lifecycle hook exists to run install/upgrade logic. The **default**
— "register exactly the schemas the manifest declares" — is not logic, it is a
restatement of the manifest. So the default carries **no** `lifecycle/` folder;
the host synthesizes it from the manifest.

A `lifecycle/` folder appears only when the module needs one of:
1. **Partial registration** — enable a subset of the manifest's schemas
   (`ctx.register({ facets: [...] })` instead of all of them).
2. **A data migration** — the module shipped a new version whose schema changed,
   and rows already in the graph must be transformed/backfilled
   (`defineMigration` / a `MigrationStep`).

If neither applies, there is nothing to put in a folder — so there is no folder.
(Sources declare their lifecycle entirely in the manifest `[lifecycle]` section;
they never carry a lifecycle folder.)

> Host dependency: the "default lifecycle comes from the manifest" behavior
> requires the backend to treat a missing lifecycle entry as
> `registerManifestSchemas()`. That is a coordinated host+repo change, tracked
> separately from the file-structure sweep.

## Tests

- **Unit test** — verifies one file. Co-located next to it: `fetch.ts` ↔
  `fetch.test.ts`. The name matches the file it covers.
- **Whole-module / integration test** — exercises the module through its public
  surface with a mocked graph. Lives in `__tests__/`, has no single matching
  source file. A `service.test.ts` sitting next to `service.ts` while actually
  testing the whole module is the wrong signal — that belongs in `__tests__/`.
- Both are written against **`@magnis/testkit`**: `@magnis/testkit/module`
  (vitest, mock graph) for modules, `@magnis/testkit/source` (bun, mock fetch +
  `runSourceContract`) for sources. A plugin author never stands up a database.

## Compilation is transparent to layout

Reshaping folders never changes a build output. All three build lanes start
from a fixed entry and follow imports:

- **Source**: the host spawns `bun run src/main.ts` — Bun executes the TS
  directly, no bundle, no intermediate JS. Moving a fetcher into a surface
  folder only changes an import path.
- **Module UI**: `build:plugins` (`Bun.build`) bundles `ui/index.tsx` into one
  hashed ESM, externals rewritten to host shims.
- **Module backend**: bundled host-side from `module/index.ts`.

As long as the manifest entries (`entry.ui`, `entry.module`, `[spawn]` args) and
`main.ts` stay put and imports resolve, internal folder layout is invisible to
every bundle. The surface folders are pure import-graph rearrangement.

## Scaffolding (planned)

A `create-surface` / `create-module` generator emits the empty skeleton for a
new part — the folder, the stub files in the shapes above, the manifest entry —
so an author (or an agent) fills in behavior instead of remembering layout. The
generator is the executable form of this document: if the two ever disagree, the
generator is the bug.
