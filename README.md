# Magnis

**Self-hosted company memory: a knowledge graph built from your communication, with AI agents on top.**

Magnis turns email, chats, meetings, notes, and files into a private, queryable graph of the business — every person, deal, decision, and commitment, with provenance on every link. Agents work on that graph: they draft replies with full cross-channel history, catch conversations before they stall, and run triggered workflows — every action behind a one-click approval.

Everything can run inside your perimeter: a desktop app with a real Postgres server compiled into the binary, or a self-hosted server — down to fully local models.

→ Product: [magnis.ai](https://magnis.ai/?utm_source=github&utm_medium=readme&utm_campaign=demo) · Sandbox: [app.magnis.ai](https://app.magnis.ai)

---

## Why

Most work is communication. Decisions happen in messages, threads, and meetings — a layer that is not structured, not persistent, and not executable. When people get busy or leave, that context dies with them. Magnis treats communication as a system primitive: messages → data → context → memory → actions. Not as logs — as a working system.

What that looks like in practice:

- **Unified operations** — messages, email, notes, and meetings in one searchable, connected system.
- **Relationship memory** — the same person across Gmail, Telegram, and meetings is one entity with full history.
- **Project memory** — decisions, discussions, and commitments stay connected over time instead of evaporating.
- **Agent workflows** — agents operate on real, persistent, structured state, not just prompts.
- **Communication as input** — a message can update state, fire a trigger, or start a workflow.

## How it works

One graph holds everything: **entities** (people, messages, meetings, companies), **facets** (typed data with provenance), **links** (relationships), and an append-only **event** history. Source connectors stream provider data in; domain modules shape it into the graph; identity resolution merges the same person across channels — hypotheses accumulate evidence and are promoted only past a confidence threshold. Retrieval is hybrid: structured graph traversal plus local-embedding semantic search, both returning provenance. Agents (Claude primarily; any OpenAI-compatible endpoint; fully local models for on-prem) read through search, act through plugin tools, and stop at a **one-click approval gate** on every write. Triggers watch the graph and fire agent episodes when something changes — a deal going quiet, a reply arriving.

Full picture: [docs/architecture.md](docs/architecture.md)

## What the agents do with it

Retrieval is the floor, not the point. Because the graph is typed and every fact carries provenance, agents can *reason* over it:

- **Hypotheses, not just answers.** Agents propose conclusions the data never states outright — "these two contacts are the same person", "this deal is stalling" — as hypotheses that accumulate evidence across sessions. The graph promotes what survives (confidence threshold, multiple confirmations) and decays what doesn't. Memory one agent writes, another agent can read.
- **Analytics on demand.** Ask for an account brief and the agent assembles it from every channel — emails, chats, meetings, commitments — with a citation on every claim. Ask what's blocking a deal and it finds the *hidden* blocker: the procurement email, not the product thread everyone was staring at.
- **Reconstruction.** After a lost thread or a failed migration, agents rebuild who promised what to whom from the surrounding communication.
- **Watchfulness.** Ghost-thread digests: which conversations are going quiet, what the last commitment in each was, and a prepared follow-up — before anyone notices.

## Principles

- communication is part of the system
- context must persist across tools
- memory must be structured
- agents need real state, not just prompts
- execution must be reviewable and constrained

## What's in this repository

This repo is the **open plugin catalog** for Magnis. The core engine is closed; the ecosystem around it is public and lives here — the same split as an editor and its extensions.

Everything here is **TypeScript, run by [bun](https://bun.sh)**. There are no per-platform binaries: a connector is a `bun run src/main.ts` process the core spawns and talks to over a small MCP-style stdio contract. One runtime, fully portable.

| Layer | Where | What |
|---|---|---|
| Core engine (closed) | desktop / server app | Rust knowledge-graph engine over Postgres, agent runtime, search, triggers, approval gates |
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
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Branch flow: [docs/git-workflow.md](docs/git-workflow.md)

A source is an MCP-over-stdio process implementing the sync contract — if you can write a script that lists items, you can write a Magnis source.

## Measured, not asserted

The memory layer is eval-backed — see [`evals/`](evals/): cross-session entity-resolution recall of 0.63–0.80 across seeded runs (a memoryless baseline is structurally 0), including cross-engine memory transfer — memory written by one model, read by another. Fixed seeds, committed fixtures, raw runs alongside the notebooks.

## Now → Next

**Now:** the graph engine, desktop app with embedded Postgres, agents with approval gates, triggers, hybrid search, 17 plugins, multi-user auth with per-user isolation — used daily on the founder's real operations since February 2026.

**Next:** first design-partner on-prem deployment · public evals landing in [`evals/`](evals/) · Slack and Notion connectors · local-install packaging · team access controls (sharing, roles) shaped by the design-partner deployment.

## Status

Working product, not launched publicly yet; hosted sandbox at [app.magnis.ai](https://app.magnis.ai). Built by [@0xmikko](https://github.com/0xmikko) — previously co-founder & CTO of [Gearbox Protocol](https://gearbox.fi).

## License

Apache-2.0 — see [LICENSE](LICENSE).
