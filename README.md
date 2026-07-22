# Magnis

**Self-hosted company memory: a knowledge graph built from your communication, with AI agents on top.**

Magnis turns email, chats, meetings, notes, and files into a private, queryable graph of the business — every person, deal, decision, and commitment, with provenance on every link. Agents work on that graph: they draft replies with full cross-channel history, catch conversations before they stall, and run triggered workflows — every action behind a one-click approval.

Everything can run inside your perimeter: a desktop app with a real Postgres server compiled into the binary, or an on-prem server — down to fully local models.

→ Product: [magnis.ai](https://magnis.ai/?utm_source=github&utm_medium=readme&utm_campaign=demo) · Sandbox: [app.magnis.ai](https://app.magnis.ai)

---

## Why

Most work is communication. Decisions happen in messages, threads, and meetings — a layer that is not structured, not persistent, and not executable. When people get busy or leave, that context dies with them.

Magnis treats communication as a system primitive: messages → data → context → memory → actions. Not as logs — as a working system.

---

## What's in this repository

This repo is the **open plugin catalog** for Magnis. The core engine is closed; the ecosystem around it is public and lives here — the same split as an editor and its extensions.

Everything here is **TypeScript, run by [bun](https://bun.sh)**. There are no per-platform binaries: a connector is a `bun run src/main.ts` process the core spawns and talks to over a small MCP-style stdio contract. One runtime, fully portable.

| Layer | Where | What |
|---|---|---|
| Core engine (closed) | desktop / server app | Rust knowledge-graph engine over Postgres, agent runtime, triggers, approval gates |
| Plugin catalog | [`plugins/`](plugins/) | 11 domain modules + 6 source connectors (+ dev mocks used by CI) |
| SDKs | [`packages/`](packages/) | connector SDK, plugin SDK, host type stubs, auth state machine, test kit |

**Source connectors** pull data from a service into the graph — cursored sync, live push, their own auth ceremony, rate-limit handling. Each runs as a separate process that owns its credentials. Live today: **Gmail + Google Calendar** (`google`), **Telegram**, **X** (sync + agent-side MCP search via `x-mcp`), **LinkedIn** (via `anysite`), and **local markdown notes** (`local`, kept as a reference implementation).

**Domain modules** shape ingested data into the graph and serve the UI, running inside the core in sandboxed V8 isolates with capability manifests: `contacts`, `email`, `meetings`, `companies`, `projects`, `notes`, `telegram`, `triggers`, `linkedin`, `x`, `file`.

Both kinds are described by a manifest the core reads to install and route them. Plugins are written against a contract designed so **coding agents can generate them from high-level descriptions** — the X integration went from nothing to working in hours through the same contract every other integration uses.

## Build a plugin

```bash
bun install --frozen-lockfile
bun run typecheck && bun run lint && bun run test && bun run test:connectors
```

- Start here: [docs/plugins/README.md](docs/plugins/README.md) — the authoring guide ([architecture](docs/plugins/architecture.md) · [modules](docs/plugins/module.md) · [sources](docs/plugins/source.md) · [structure](docs/plugins/structure.md) · [manifest reference](docs/plugins/manifest.md)).
- Scaffold a module: `bun scripts/plugin-new.ts <id>`.
- System overview: [docs/architecture.md](docs/architecture.md) · Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Branch flow: [docs/git-workflow.md](docs/git-workflow.md)

A source is an MCP-over-stdio process implementing the sync contract — if you can write a script that lists items, you can write a Magnis source.

## Measured, not asserted

The memory layer is eval-backed — see [`evals/`](evals/): cross-session entity-resolution recall of 0.63–0.80 across seeded runs (a memoryless baseline is structurally 0), including cross-engine memory transfer — memory written by one model, read by another. Fixed seeds, committed fixtures, raw runs alongside the notebooks.

## Status

Working product, used daily on the founder's real operations since February 2026. Not launched publicly yet; hosted sandbox at [app.magnis.ai](https://app.magnis.ai). Built by [@0xmikko](https://github.com/0xmikko) — previously co-founder & CTO of [Gearbox Protocol](https://gearbox.fi).

## License

Apache-2.0 — see [LICENSE](LICENSE).
