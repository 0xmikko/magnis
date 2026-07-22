# Magnis

A system for turning communication into context, memory, and action.

→ Live demo: [magnis.ai](https://magnis.ai/?utm_source=github&utm_medium=readme&utm_campaign=demo) (early prototype)

---

## About

I’m building Gearbox Protocol — onchain credit infrastructure for DeFi.

Over time, I ran into a different kind of problem.

Not in code — but in how systems are coordinated.

Most of the work doesn’t live in logic.  
It lives in communication.

Messages, emails, discussions — that’s where decisions happen.

But this layer is not structured, not persistent, and not executable.

Magnis started as an attempt to fix that.

---

## The shift

Most systems today assume:
- data is structured
- decisions are explicit
- execution is well-defined

In reality:
- context lives in chats
- decisions are buried in threads
- knowledge is lost over time

There is no system — only communication.

---

## Why this matters

Most work is communication.

Magnis makes it:
- faster
- more precise
- context-aware

It builds a graph of:
people, messages, relationships, history.

Agents operate on this context.

Everything stays local.

---

## What Magnis is

Magnis treats communication as a system primitive.

It turns:
- messages → data
- data → context
- context → memory
- memory → actions

Not as logs — but as a working system.

---

## Architecture

Magnis is built around:
- a Rust backend as the source of truth
- graph-based local storage
- provider/source integrations
- agent workflows with controlled execution

See [docs/architecture.md](docs/architecture.md)

---

## What's in this repository

This repo is the **open plugin catalog** for Magnis. The core is closed; the
ecosystem around it is public and lives here — the same split as an editor and
its extensions.

Everything here is **TypeScript, run by [bun](https://bun.sh)**. There are no
per-platform binaries: a connector is a `bun run src/main.ts` process the core
spawns and talks to over a small MCP-style stdio contract. One runtime, fully
portable.

```
plugins/sources/   provider connectors — google, telegram, x, anysite (+ dev mocks)
plugins/modules/   domain adapters — contacts, email, meetings, telegram, companies …
packages/          the SDKs a plugin builds against (connector-sdk, plugin-sdk, host-stubs)
```

A **source** pulls data from a service into the graph (cursored sync, live
push, its own auth ceremony, rate-limit handling). A **module** shapes that
data into the graph and serves the UI. Both are described by a `manifest.toml`
the core reads to install and route them.

- Plugin authoring & the connector contract: [CLAUDE.md](CLAUDE.md)
- How code flows here: [docs/git-workflow.md](docs/git-workflow.md)

```bash
bun install --frozen-lockfile
bun run typecheck && bun run test && bun run test:connectors
```

---

## Status

Early-stage research.

Building in public.

---

## Links

- Live demo: https://magnis.ai
- Repository: https://github.com/0xmikko/magnis
