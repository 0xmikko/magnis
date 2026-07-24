# Magnis

**Self-hosted company memory: a knowledge graph built from your communication, with AI agents on top.**

Magnis gives a company a private, self-hosted memory. It turns email, chats, meetings, notes, and files into a queryable knowledge graph — a live map of every person, deal, decision, and commitment with its full history — and puts AI agents on top of it, so important conversations stop disappearing.

Most work is communication, and decisions live in messages, threads, and meetings — a layer that is not structured, not persistent, and not executable. Deals die because a thread went quiet; context leaves when a person does; every new hire starts from zero. Magnis turns that layer into a working system:

- **Everything in one place.** Mail, messengers, meetings, notes, and files — searchable, connected, with history.
- **One person, one deal — across every channel.** The same contact in Gmail, Telegram, and a meeting is a single record with a merged history, resolved automatically.
- **An agent that acts, not just answers.** It drafts replies with full cross-channel history, chases conversations that are about to stall, prepares you for meetings, and runs triggered workflows ("if this deal goes quiet, follow up") — with a one-click approval on every outgoing action.
- **Research over company memory.** Agents reason over the graph, not just retrieve from it: they form hypotheses that accumulate evidence across sessions, assemble account briefs from every channel, and surface *hidden* blockers — with a citation on every claim.
- **Built for teams.** As more of the team connects, Magnis becomes institutional memory: new hires inherit context, handoffs stop losing information. Private by default, shared by choice — per-user isolation, with access modeled in the graph itself (ACL), so shared memory has real boundaries.
- **A real interface.** Desktop app and CLI (mobile and a Telegram bot coming), a composer the agent and you edit together, live agent progress — not a chat box bolted onto a database.

Everything can run inside the company's perimeter: a desktop app with Postgres built in, or your own server — down to fully local models, so it works where data can't leave.

Not demo scenarios: the founder has run his own operations on Magnis daily since February 2026, and the memory layer is measured — cross-session identity resolution at **0.63–0.80 recall** where a memoryless baseline scores 0 ([evals/](evals/README.md)).

→ Product: [magnis.ai](https://magnis.ai/?utm_source=github&utm_medium=readme&utm_campaign=demo) · Try it: [app.magnis.ai](https://app.magnis.ai) · License: [Apache-2.0](LICENSE)

## How it works

- **An append-only knowledge graph with full provenance** — every fact traces back to the message, meeting, or file it came from; canonical truth is resolved deterministically when sources disagree.
- **Agents operate on the graph, not on prompt stuffing** — they navigate: self-discovery tools, hybrid graph + semantic search, and hypotheses for what the data never states outright, promoted on evidence.
- **Every external action requires a one-click approval** — humans act directly, agents propose; triggers schedule agent work into the future (pub/sub on the graph, cron included).
- **Everything can run fully local, including the models** — a desktop app with embedded Postgres, or your own server; per-user isolation, with access control modeled in the graph itself (ACL).
- **The plugin system is open; the core is closed** — any external system connects through the same typed contract every built-in integration uses.

Full architecture: **[docs/architecture.md](docs/architecture.md)**. Deep references: [the graph](docs/graph.md) (anatomy, indexes, vector pipeline, speculative overlay) · [engines](docs/engines.md) (model layer, sessions, metering) · [plugins](docs/plugins/README.md) (authoring) · [evals](evals/README.md) (methodology and results).

## Measured memory performance

The memory layer is tested on real tasks over a seeded company workspace — fixed seeds, reproducible runs. Full harness, fixtures, and raw runs: [`/evals`](evals/README.md).

| Eval | What it measures | Result |
|---|---|---|
| Cross-session identity resolution | Can the agent keep durable identity across channels and sessions? | **0.63–0.80 recall** (memoryless baseline: structurally 0) |
| Cross-engine memory transfer | Can memory written by one model be read by another? | **0 → 0.71 recall** |
| Communication QA | Accuracy, hallucination rate, provenance and cost vs long-context and vector-RAG baselines | *in progress* |
| Trigger detection | Precision/recall of catching stalled conversations | *planned* |

## Plugin repository

Every external integration in Magnis is a plugin, and this repository is where they live. A plugin is one of two kinds:

- **Sources** connect external systems — mail, messengers, social networks, internal tools — and stream their data in.
- **Modules** own a domain — contacts, email, meetings — shape that data into the graph, and serve its tools and UI.

Every integration is written from the same skeleton: one contract, one file structure, one test gate. Scaffold it with a single command and fill in the behavior — that's what makes new integrations cheap, and what lets coding agents write them from a plain description.

- How it all fits together: [docs/plugins/architecture.md](docs/plugins/architecture.md)
- How to write one: [docs/plugins/README.md](docs/plugins/README.md)

## Contributing

Contribution rules live in [CONTRIBUTING.md](CONTRIBUTING.md): branch off `staging`, the full test gate green on every commit, a RED test first for every behavioral change.

Development here is **AI-agent-driven**: the plugin contract is written so coding agents can generate a plugin from a high-level description (the X integration went from nothing to working in hours this way), and the repo ships the agent skills the coding agents follow — [CLAUDE.md](CLAUDE.md): the gate, the wire-contract rules, the TDD loop. Human or agent, the same rules apply.

## License

Apache-2.0 ([LICENSE](LICENSE)) — covers the plugin catalog, connectors, SDKs, and evals in this repository. The core engine is closed-source.
