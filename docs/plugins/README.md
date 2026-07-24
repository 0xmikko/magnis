# Magnis plugins

A **plugin** is how a domain enters Magnis. The Rust backend owns the graph and
stays generic — it knows nothing about "contacts" or "email"; every domain ships
as a plugin that declares its schemas, exposes tools, and (for a module) draws
its own UI. There are two kinds:

- **Module** — owns a slice of the graph: it registers entity/facet schemas,
  reads and writes them, exposes tools to the agent and UI, and draws the
  frontend. → [module.md](./module.md)
- **Source** — connects to an external service (Gmail, X, Telegram) and streams
  what it finds into the graph as envelopes; it owns no schema.
  → [source.md](./source.md)

`companies` / `contacts` (modules) and `google` / `x` (sources) are the
reference implementations — read their code beside these docs.

## Start here

1. **[architecture.md](./architecture.md)** — the top-down model: the graph, the
   two kinds, and how data flows external service → source → module → graph →
   UI. Read this first.
2. **[module.md](./module.md)** — build a module end to end.
3. **[source.md](./source.md)** — build a source end to end.
4. **[structure.md](./structure.md)** — the file-structure standard both kinds
   follow, plus the lint-enforced code rules and the full conformance checklist.
5. **[manifest.md](./manifest.md)** — the `manifest.toml` reference for both
   kinds.

Or don't write it yourself: **[building-with-an-agent.md](./building-with-an-agent.md)**
— describe the integration in a sentence and let an agent build it to the
same contract. Measured in the [integration-authoring eval](../../evals/integration-authoring/README.md).

## Shared rules (both kinds)

- **One runtime: Bun.** Bun runs TypeScript directly — no build step for a
  source, one bundling step for a module's UI.
- **Strict lint, no `any`.** `bun run lint` runs type-aware `strictTypeChecked`
  at zero warnings; a type lie is fixed, not silenced. Full rule list in
  [structure.md](./structure.md).
- **One testkit, no database.** `@magnis/testkit` — module tests run under
  vitest, source tests under `bun test`.

## Commands

Run from the repo root:

```bash
bun run typecheck        # tsc across every plugin + package
bun run lint             # eslint, zero warnings
bun run test             # vitest — module + package tests
bun run test:connectors  # bun test — source contract tests
bun run build:plugins    # bundle every module's UI
```

Run one plugin's tests:

```bash
bun run test plugins/modules/<name>     # a module (vitest)
bun test plugins/sources/<name>/src     # a source (bun test)
```

## Dev loop — no rebuild while you write

Point the backend at your working checkout and just edit files:

```bash
MAGNIS_PLUGINS_DIR=/path/to/your/plugins
```

- **Module code** (`module/*.ts`, `manifest.toml`): the next call re-transpiles
  your change on the fly — no rebuild, no reinstall.
- **UI** (`ui/*.tsx`): served on the fly; refresh the browser tab.

## Conformance

A plugin is "done" only when it passes the conformance checklist. The per-kind
checklists close [module.md](./module.md) and [source.md](./source.md); the
combined, machine-checkable standard is in [structure.md](./structure.md).
