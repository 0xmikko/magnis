# Contributing

This repo is the open plugin catalog for [Magnis](https://magnis.ai) — source connectors, domain modules, and the SDKs they build against. The core engine is closed; everything here is TypeScript, run by [bun](https://bun.sh).

## Setup

```bash
git clone https://github.com/0xmikko/magnis
cd magnis
bun install --frozen-lockfile
```

## The gate

Every change must leave the full gate green — the same commands run in pre-commit and CI:

```bash
bun run typecheck        # tsc over modules + sources + packages + scripts
bun run lint             # eslint
bun run test             # vitest — modules + SDK unit tests
bun run test:connectors  # every source connector's own suite
bun run test:scripts     # tooling tests
```

No skipped tests, no weakened assertions, no `eslint-disable` without a documented reason.

## Writing a plugin

Start with the authoring guide: [docs/plugins/README.md](docs/plugins/README.md) — it covers the architecture, the module and source contracts, file structure, and the manifest reference.

- **Module** (domain adapter, runs in a V8 isolate inside the core): scaffold with `bun scripts/plugin-new.ts <id>`, then follow [docs/plugins/module.md](docs/plugins/module.md).
- **Source** (provider connector, a separate stdio process): follow [docs/plugins/source.md](docs/plugins/source.md). The wire contract is frozen — add capabilities and error paths, never change envelope shapes or cursor semantics.

House rules that will come up in review:

- **Tests first.** A behavioral change starts with a RED test that fails on current code.
- **No fallbacks.** A missing credential or a timed-out fetch surfaces a typed error; never fabricate an empty result. The core decides how to recover.
- **No Rust, no binaries.** Every plugin is bun/TS.

## Submitting

1. Branch off `staging`: `git switch -c feat/<topic> staging` (prefixes: `feat/`, `fix/`, `docs/`, `ci/`).
2. Commit with Conventional Commits, scope = the plugin/package touched (`feat(sources): …`, `fix(connector-sdk): …`).
3. Open a PR against `staging`. Maintainers merge feature branches; `main` is the published catalog and only moves by reviewed PR from `staging`.

Maintainer-side branch mechanics live in [docs/git-workflow.md](docs/git-workflow.md).
