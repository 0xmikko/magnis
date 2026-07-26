# CLAUDE.md — Magnis plugin catalog

## What this repository is

This is the **official public repo** for [Magnis](https://magnis.ai) — the
plugin catalog (connectors, domain modules, SDKs) that plugs into the (closed)
Magnis core, plus the public evals; testable desktop builds ship here via
Releases as local install lands. Think of it the way VS Code splits from its
extensions: the core is private, the ecosystem around it is public and here.

Everything in this repo is **TypeScript, run by bun**. There is no Rust here —
connectors are `bun run src/main.ts` processes the core spawns and talks to over
a small MCP-style stdio protocol. That is the whole portability story: one
runtime, no per-platform binaries.

The core consumes this repo as a **pinned git submodule**. `main` is the
published catalog; day-to-day work lands on `staging` (see Git workflow).

## Layout

```
plugins/
  sources/     provider connectors — pull data from an external service into the
               graph over the connector contract (google, telegram, x, x-mcp,
               anysite, local, + dev mocks). Each: manifest.toml + src/main.ts +
               *.test.ts.
  modules/     domain adapters — shape ingested data into the graph and serve the
               UI (contacts, email, meetings, telegram, companies, projects, …).
packages/
  connector-sdk        the wire contract a source implements (fetch cursors, push,
                       auth flows, magnis.execute, rate-limit signalling).
  plugin-sdk           the module/plugin runtime surface (definePlugin, graph ops).
  host-stubs           TYPES ONLY — the host surface a plugin compiles against.
  source-statemachine  the auth/sync state machine shared by source connectors.
  testkit              dev-only test doubles + builders; never ships in a bundle.
docs/          architecture, plugin authoring, git workflow.
scripts/       typecheck / test / bundle tooling.
```

## Dev commands (bun only — no cargo)

```bash
bun install --frozen-lockfile
bun run typecheck        # tsc over modules + sources + packages + scripts
bun run lint             # eslint (also enforced by pre-commit and CI)
bun run test             # vitest — modules + SDK unit tests
bun run test:connectors  # each source connector's own suite
bun run test:scripts     # tooling tests
bun run build:plugins    # bundle each plugin's UI (build-time, dependency-closed)
```

## The connector contract (non-negotiable)

A source connector is an MCP-over-stdio process. It implements, via
`@magnis/connector-sdk`:
- `initialize` → declared surfaces + capabilities (sync mode: poll or push).
- `magnis.sync.fetch` → envelopes + a JSON cursor (`direction`,
  `total`/`discovered` for progress). Cursors are opaque JSON, round-tripped
  verbatim — never coerced.
- `magnis.execute` → the connector's action table (send, backfill, …).
- `magnis.auth.begin/step/exchange/revoke` → the auth ceremony (oauth2 /
  phone_code / api_key / shared_provider).
- push: `listen_start`/`listen_stop` + stamped `notifications/magnis/envelope`.
- rate limits: surface `-32002` with `retry_after`; **never** hang silently on a
  dropped or throttled provider response — bound every network read with a
  timeout and surface a typed error the host can retry.

The host cannot tell one connector implementation from another as long as the
wire is identical. Preserve it.

## Rules

- **No Rust.** Every source and module is bun/TS. Do not reintroduce a
  `Cargo.toml`.
- **No fallbacks.** A missing credential, a timed-out fetch, a dropped response
  → surface the error. Never fabricate an empty result or swallow an exception
  to "keep things working". The core decides how to recover.
- **TDD.** A behavioural change starts with a RED test (it must fail on current
  code) at the connector/module level, then the minimum code to make it green.
  The live bugs this catalog has hit (gramjs null-vs-undefined fields, cursor
  expiry, dropped-response hangs, dead-routing) were all things unit tests
  missed until a test reproduced them — write the reproduction first.
- **Wire parity is frozen.** Add error/timeout paths and new capabilities;
  do not change envelope shapes, cursor semantics, or error codes without a
  deliberate contract bump.
- **Explore before editing.** Grep the SDK and adjacent connectors before adding
  code — most of what a new connector needs already exists.

## Git workflow

See [docs/git-workflow.md](docs/git-workflow.md). Summary:

- `main` — the published catalog. **Never commit or push to it directly.**
- `staging` — integration. All work lands here (via feature branches → merge).
- Feature branches: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `ci/<topic>`.
- Conventional Commits, scope = the plugin/package touched
  (`fix(sources): …`, `feat(connector-sdk): …`, `docs: …`).
- Every commit must leave `bun run typecheck && lint && test && test:connectors
  && test:scripts` green.
