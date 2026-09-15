# CLAUDE.md — Magnis plugin catalog

## What this repository is

This is the **official public repo** for [Magnis](https://magnis.ai) — the
plugin catalog (connectors, domain modules, SDKs) that plugs into the (closed)
Magnis core, plus the public evals; testable desktop builds ship here via
Releases as local install lands. Think of it the way VS Code splits from its
extensions: the core is private, the ecosystem around it is public and here.

The catalog under `plugins/` and `packages/` is **TypeScript, run by Bun**:
connectors are `bun run src/main.ts` processes the core spawns and talks to
over a small MCP-style stdio protocol. `apps/desktop` is the one exception: it
is the public Rust/Tauri shell that packages one checksum-pinned closed runtime
artifact. It contains no Magnis domain implementation, migrations or private
source build path.

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
apps/
  desktop/             Tauri shell: embedded PostgreSQL, lifecycle and one
                       exact runtime-artifact staging entrypoint.
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

# after MAGNIS_RUNTIME_ARCHIVE, MAGNIS_RUNTIME_REF and MAGNIS_RUNTIME_TARGET
# have selected one exact public runtime asset:
bun apps/desktop/build/stage-runtime.ts
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
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

- **No Rust in the catalog.** `plugins/**` and `packages/**` remain Bun/TS.
  Rust belongs only to `apps/desktop`; do not add a Cargo crate to a plugin or
  package.
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

## Desktop shell policy

- Stage `apps/desktop` only through `build/stage-runtime.ts`, with all three
  explicit `MAGNIS_RUNTIME_*` inputs. It validates the immutable reference,
  archive checksum, manifest and extracted payload before replacing Tauri's
  ignored `src-tauri/binaries/` directory. There is no source-checkout,
  `latest`, host-architecture or stale-sidecar fallback.
- The shell owns embedded PostgreSQL, loopback ports, data roots, tray and
  reverse shutdown. The closed runtime owns backend behavior; the public shell
  must not grow domain queries, migrations or a second backend implementation.
- `apps/desktop/src-tauri/Cargo.lock` is tracked. Change Rust dependencies only
  intentionally, review the lockfile with the manifest, and use `--locked` in
  CI/reproducible builds. Do not vendor dependency sources into the repository.
- Rust changes require `cargo fmt`, `cargo clippy --all-targets -- -D warnings`
  and the crate test suite. Keep `anyhow` at binary/orchestration boundaries;
  library-like shell APIs expose typed errors. Tests begin RED like the Bun
  suites.

## Git workflow

See [docs/git-workflow.md](docs/git-workflow.md). Summary:

- `main` — the published catalog. **Never commit or push to it directly.**
- `staging` — integration. All work lands here (via feature branches → merge).
- Feature branches: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `ci/<topic>`.
- Conventional Commits, scope = the plugin/package touched
  (`fix(sources): …`, `feat(connector-sdk): …`, `docs: …`).
- Every commit must leave `bun run typecheck && lint && test && test:connectors
  && test:scripts` green.
