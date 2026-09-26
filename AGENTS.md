# AGENTS.md

The rulebook for every coding agent in this repository; `CLAUDE.md` imports
it. Everything else lives in `docs/`.

## Project

Magnis plugin catalog: connectors (`plugins/sources/`), domain modules
(`plugins/modules/`) and SDKs (`packages/`), all TypeScript on Bun, plus the
public Tauri shell in `apps/desktop/`. The closed core consumes this repo as
a pinned submodule. Map: [docs/architecture.md](docs/architecture.md).

## Process

Plans and execution go through the planctl tools; the skills `/blueprint`,
`/blueprint-start` and `/end-work` say when to call what. The owner approves
the SPEC and the contract with a word; the plan file is never edited by hand.

## Commands

```bash
bun run agent:install                         # exact workspace after a merge
bun run agent:test:backend -- <file>          # one scoped target; the Task's RED command
bun run agent:verify:commit                   # the pre-commit hook runs it
bun run agent:verify:pr                       # the whole gate, once per PR
```

## Rules

- No fallbacks: a missing credential, a timed-out fetch or a dropped response
  surfaces as an error; never an empty result.
- TDD: every behavior change starts with a RED test at the connector or
  module level; the live bugs here were all found by a reproduction first.
- The connector wire is frozen: envelopes, cursors and error codes change
  only with a deliberate contract bump ([docs/plugins/source.md](docs/plugins/source.md)).
- No Rust outside `apps/desktop`; the shell's own rules are in
  [apps/desktop/README.md](apps/desktop/README.md).
- Explore before editing: a second copy of an existing mechanism is a defect.

## Git

PRs into `staging` from a `feat|fix|docs/<topic>` branch; `main` is the
published catalog and moves only by the owner. Conventional Commits, merge
commits only, never rewrite history: [docs/git-workflow.md](docs/git-workflow.md).
