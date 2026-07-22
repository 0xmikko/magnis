# Plugin development standard

The authoritative standard for building a Magnis plugin: the concepts, the exact
layout, the rules (enforced by lint, not prose), how each kind runs, the
commands to build and test it, and the conformance checklist every plugin must
pass. Use it while developing, and use it to verify — a plugin that fails any
"MUST" here is non-conforming.

One rule, two kinds. Read "Two kinds" first; it explains why everything below
splits the way it does. For the big-picture model start at
[architecture.md](./architecture.md); the end-to-end build guides are
[module.md](./module.md) and [source.md](./source.md); the `manifest.toml` field
reference is [manifest.md](./manifest.md); commands and the dev loop are in
[README.md](./README.md).

---

## 1. Two kinds, and how each runs

Magnis has two kinds of first-party extension. They are genuinely different
things, because they run in different places for different reasons.

### Module — a V8 isolate inside the backend

A module owns a slice of the graph: it registers schemas, reads and writes
entities/facets, and draws UI. The host loads its bundled code into a
**restricted V8 isolate in-process**. The isolate has **no ambient I/O** — no
sockets, no filesystem, no stdio. Every graph operation goes through the host by
RPC. That restriction is the point: a module cannot touch the outside world, so
it cannot leak or misbehave against it.

- SDK: `@magnis/plugin-sdk`
- Idiom: a decorator-declared class handed to `definePlugin`
- Entry: `module/index.ts` → `definePlugin(TheModule)`
- Runs: in-process, restricted isolate, graph via host RPC
- Full guide: [module.md](./module.md)

### Source — a spawned MCP subprocess

A source pulls data from an external service and emits it over the wire. The
host **spawns it as a separate OS process** (`bun run src/main.ts`) and talks to
it over **stdio JSON-RPC** (`runConnector` reads stdin, writes stdout). The
source does its **own network I/O** (OAuth refresh, Gmail pagination, MTProto
sockets) and authenticates as a peer; credentials arrive per-call in `_meta`.

- SDK: `@magnis/connector-sdk`
- Idiom: a `ConnectorConfig` object handed to `runConnector`
- Entry: `src/main.ts` → `runConnector(buildConnectorConfig())`
- Runs: separate process, stdio JSON-RPC (MCP), does real network I/O
- Full guide: [source.md](./source.md)

### Why a source does NOT run in an isolate

This is the tempting simplification, and it is wrong. Three reasons, each on its
own decisive:

1. **A source needs real I/O; an isolate forbids it.** `runConnector` uses
   `process.stdin`/`stdout` and `node:readline`; a source `fetch`es external
   APIs and opens sockets. The module isolate has none of that by design.
   Granting it = removing the isolate's restriction = it is no longer an
   isolate.
2. **The process boundary is the trust boundary.** A source is an authenticated
   MCP peer with entity-level ACL and per-call credentials. In-processing it
   into the backend erases that seam — the external-integration boundary would
   run inside the trusted core.
3. **MCP is language-agnostic.** A source is an MCP server; it can be
   TypeScript, Python, Rust, anything. Forcing isolates forces JS and throws
   that away.

The coherence you want is real, but it lives at the **SDK and launch** level,
not the runtime level:

- **One runtime everywhere: Bun.** Bun executes TS directly — no intermediate
  JS, no dist. Sources spawn under `bun run`; tests run under Bun/vitest.
- **One-line entry both kinds:** `definePlugin(X)` / `runConnector(cfg)`.
- **One manifest-driven launch:** the host loads/spawns each kind from its
  `manifest.toml`.
- **One testkit, no database:** `@magnis/testkit`.
- **Standalone-runnable:** because a source is a plain stdio MCP server, a
  developer can run it by hand — `bun run src/main.ts` and pipe JSON-RPC — and
  drive it without the host at all (see the source recipe below).

So: two execution contexts (in-isolate vs subprocess) because the I/O and trust
boundary demand it — but one runtime, one launch model, one test story on top.

---

## 2. The layout rule: each real part in its own folder

A **part** is a unit with more than one file's worth of concern; it gets a
folder. Everything genuinely shared sits as a loose file in the root. A concern
that is a single file stays a single file — no folder for one file.

| | Module | Source |
|---|---|---|
| part-folders | `module/`, `ui/`, `lifecycle/` (only with a migration) | `surfaces/<name>/` — one per surface it returns |
| shared root | `types.ts`, `schema.ts`, `manifest.toml` | `src/` root: transport, auth, `connector.ts`, `main.ts`, `helpers.ts` |

---

## 3. Building a module — the recipe

To create a conforming module, produce exactly this. Each step is a MUST unless
marked optional.

1. **`manifest.toml`** — declare the contract: `entry.module = "module/index.ts"`,
   `entry.ui` (optional), `[schemas]` (every entity + facet the module owns),
   capabilities, surfaces. The manifest is the source of truth for registration.
2. **`types.ts`** (root) — the module's shared shapes. One predictable address;
   no `types/index.ts` single-file folder.
3. **`schema.ts`** (root) — schema-id constants for read/write call sites (e.g.
   `export const COMPANY = "companies.company"`). They restate the manifest's
   ids for typed use in code; they are NOT the registration source.
4. **`module/service.ts`** — the class, **and nothing else**. No free functions,
   no constants at module scope. The class body is graph read/write logic.
5. **`module/helpers.ts`** — free functions the service uses. Domain-neutral
   coercers (`str`, `num`) come from `@magnis/plugin-sdk`, not re-declared here.
6. **`module/index.ts`** — `definePlugin(TheModule)`. Nothing else.
7. **`module/__tests__/`** — whole-module tests on `@magnis/testkit/module`
   (mock graph, no DB). The test rule lives with the lint rules below.
8. **`ui/`** (optional) — React surface; `entry.ui` points at its entry.
9. **`lifecycle/`** — OMIT unless the module needs a migration or partial
   registration (see the lifecycle section).

`service.ts` MUST NOT contain constants or free functions. `types/` and
`schema/` MUST NOT be folders.

---

## 4. Lifecycle: a folder only when there is real work

A module's lifecycle hook runs install/upgrade logic. The **default** — register
exactly the schemas the manifest declares — is not logic; it restates the
manifest. So the default carries **no `lifecycle/` folder**; the host
synthesizes it.

A `lifecycle/` folder appears only for:
1. **Partial registration** — enable a subset of manifest schemas
   (`ctx.register({ facets: [...] })`).
2. **A data migration** — a new version changed the schema and rows already in
   the graph must be transformed (`defineMigration` / a `MigrationStep`).

Neither today: all 11 modules carry an identical stub. They lose the folder.
(Sources are standard-installable by construction and never carry a folder —
manifest v3 has no `[lifecycle]` section.)

> Host dependency: "default lifecycle from the manifest" needs the backend to
> treat a missing lifecycle entry as `registerManifestSchemas()`. Coordinated
> host+repo change, tracked separately from this file-structure sweep.

---

## 5. Building a source — the recipe

1. **`manifest.toml`** — package card (`id`/`version`/`title`/`summary`/
   `publisher`) + `surfaces = [...]` top-level; `[auth]` / `[credentials]` as
   the provider needs; `[sync]` with the mode. Spawn is convention
   (`bun run src/main.ts`); write `[spawn]` only to override it.
2. **`src/main.ts`** — the entry the host spawns: `runConnector(buildConnectorConfig())`.
   Nothing else.
3. **`src/connector.ts`** — `buildConnectorConfig(fetchFn = fetch)` wiring the
   surfaces into one `ConnectorConfig`. Taking `fetchFn` as a parameter is a
   MUST — it is how the test harness injects a mock fetch.
4. **`src/surfaces/<name>/`** — one folder **per surface declared in the
   manifest**, always a folder (room to grow: a Twitter source adds DMs,
   profiles, trends as new folders). Each holds the vertical slice for what that
   surface returns: its fetcher, its types, its schema-ids/remote-id builders,
   its unit test.
5. **`src/` root shared files** — only what is shared across surfaces:
   `api.ts`/`http.ts` (transport), `auth.ts`/`oauth.ts`, `helpers.ts`,
   `connector.ts`, `main.ts`. A health `probe`, the API client, auth — shared
   plumbing, not surfaces, so root files even if there is one of each.
6. **Contract test** — `src/__tests__/<name>Contract.test.ts` on
   `@magnis/testkit/source` (bun): asserts `initialize`, per-surface paginated
   drain, the `execute` table, and `429 → -32002 + retry_after`.

Per-surface types and schema-ids MUST live inside the surface folder — they
describe what that surface returns.

---

## 6. Rules, enforced by lint (not by prose)

The standard is machine-checked. `eslint.config.mjs` runs
`strictTypeChecked` + `stylisticTypeChecked` (type-aware) with these as
**errors** (`bun run lint` fails on any):

| Rule | Meaning |
|---|---|
| `@typescript-eslint/no-explicit-any` | **No `any`, anywhere.** Model the type or use `unknown` + narrow. |
| `explicit-function-return-type` | Every function annotates its return type. |
| `explicit-module-boundary-types` | Exported functions annotate params + return. |
| `no-floating-promises` | Every promise is awaited or explicitly voided. |
| `consistent-type-imports` + `no-import-type-side-effects` | Type-only imports use `import type`. |
| `eqeqeq: always` | `===` / `!==` only. |
| `no-unused-vars` (`^_` exempt) | No dead bindings; prefix intentional discards `_`. |
| `no-var`, `prefer-const` | `const`/`let` only. |

Plus the whole `strictTypeChecked` set (`no-unsafe-*`, `no-misused-promises`,
`restrict-template-expressions`, …). If the type system can catch it, it is an
error.

**Type lies are fixed, not silenced.** A cast or `eslint-disable` that hides a
real type mismatch is a defect, not a fix. The rare justified disable carries a
one-line reason.

**Tests are lint-ignored on purpose.** Test files exercise error paths and
partial fixtures that fight strict typing for no safety gain; they are excluded
from the lint globs (still typechecked).

---

## 7. Commands

One runtime: **Bun**. No deno, no node build, no intermediate JS.

Repo-level (run from the repo root):

```bash
bun run typecheck        # tsc across every plugin + package (scripts/typecheck-all.sh)
bun run lint             # eslint, --max-warnings 0 (the lint-rule table above)
bun run test             # vitest — module + package tests
bun run test:connectors  # bun test — source contract + testkit/source (scripts/test-connectors.sh)
bun run test:scripts     # bun test scripts/
bun run build:plugins    # Bun.build every module UI bundle
bun scripts/build-catalog-index.ts   # regenerate the catalog index
```

Why two test lanes: **module tests run under vitest, source tests under
`bun test`.** A source runs under Bun at spawn time, so its tests must run in
the same runtime that hosts it — not vitest. `@magnis/testkit/module` is a
vitest kit; `@magnis/testkit/source` is a Bun kit.

Run one plugin's tests:

```bash
bun run test plugins/modules/<name>            # vitest path filter (module)
bun test plugins/sources/<name>/src            # bun test (source)
```

Run a source standalone (no host) — it is a plain stdio MCP server:

```bash
cd plugins/sources/<name>
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | bun run src/main.ts
```

Pipe successive JSON-RPC lines to drive `fetch`/`execute` by hand — exactly what
the host does over the spawn pipe.

---

## 8. Conformance checklist

Every plugin MUST satisfy all of these. This list is the verification contract —
a plugin is "done" only when each holds. (A `check-plugin` script will automate
it; until then it is a review gate.)

**Both kinds**
- [ ] `bun run typecheck` clean; `bun run lint` clean (0 warnings, no `any`, no
      unjustified disable).
- [ ] Layout matches the layout rule: each real part in its folder, no
      single-file folders.
- [ ] Tests on `@magnis/testkit`, no database stood up; green in the correct lane.
- [ ] `manifest.toml` is the sole registration/spawn source of truth.

**Module**
- [ ] `service.ts` is the class only — no constants, no free functions.
- [ ] `schema.ts` + `types.ts` are loose root files.
- [ ] `module/index.ts` is `definePlugin(...)` and nothing else.
- [ ] No `lifecycle/` folder unless it carries a real migration/partial
      registration (see the lifecycle section).
- [ ] Whole-module tests in `module/__tests__/`, unit tests co-located.

**Source**
- [ ] One `surfaces/<name>/` folder per manifest surface; per-surface types +
      schema-ids inside it.
- [ ] `src/` root holds only cross-surface shared plumbing.
- [ ] `buildConnectorConfig(fetchFn = fetch)` takes an injectable fetch.
- [ ] `main.ts` is `runConnector(buildConnectorConfig())` and nothing else.
- [ ] A `runSourceContract` test covering every surface + rate-limit mapping.

---

## 9. Scaffolding (planned)

A `create-module` / `create-surface` generator emits the empty skeleton in the
shapes above — folder, stub files, manifest entry — so an author (or an agent)
fills in behavior instead of remembering layout. The generator is the executable
form of this document; if they disagree, the generator is the bug. The
`check-plugin` conformance script (see the conformance checklist) is its
mirror on the verification side.
