# Magnis

**Local-first AI that keeps company work moving until it’s done.**

Magnis ingests continuously. Every connected account — email, messaging, calendars, meetings, notes, files — feeds a persistent company graph of people, projects, commitments, decisions, and artifacts. Every derived fact keeps its source and the permissions of the account it came from.

That is the difference from session-based context assembly. An agent that starts from zero each time cannot reconcile identities across channels it has not accessed, and has nowhere to put what it learns. Magnis has both.

Because the state persists, you can open Magnis next to any message or document, or state an objective in the main chat. The agent knows what you are looking at and walks the graph to the related projects, people, and history — then answers, drafts, or acts, without you assembling the context first.

- **Continuous ingestion into one graph.** Not a per-session retrieval pass — a durable map of people, projects, commitments, decisions, and artifacts that every new objective builds on.
- **Missions created at runtime.** When work cannot finish in one sitting, Magnis turns a plain objective into a persistent mission — no pre-built agent, no workflow to wire up. It works out which future events could advance that mission and subscribes to them.
- **Work that resumes on its own.** Every incoming message and change is evaluated against the open missions. On a match, Magnis updates the mission and its artifacts and takes the next step. Decisions and approvals land in your inbox; everything else continues in the background.
- **Provenance and permissions on derived facts.** Access control follows the fact, not just the source document — so shared memory has real boundaries.
- **Your data plane.** The graph and the execution state stay in your environment. Magnis connects through the accounts of the people doing the work, including personal messaging — where a bot API cannot read the history that predates it.
- **Missions that cross people** *(team layer, September 2026)*. A mission also advances through replies in colleagues' inboxes, with permissions deciding what each colleague can see.

A worked example: asked whether Gearbox had completed the Midas security audit, the graph showed the audit discussed but no evidence it had started. Magnis identified the relevant contracts and audit firms, prepared an RFQ, found the contacts, sent the requests on approval, and tracked the replies to keep the RFQ current as responses arrived.

Everything can run inside the company's perimeter: a desktop app with Postgres built in, or your own server — down to fully local models, so it works where data can't leave.

Not demo scenarios: the founder has run his own operations on Magnis daily since February 2026, and the graph is measured — under a fixed task-time budget with the model held constant, a **prepared** graph completed 4/4 hard multi-source tasks against 1/4 for direct provider search, while an ingested-but-unprepared graph did not beat direct search at all ([evals/](evals/README.md)).

The first users are small teams running expensive asynchronous processes with outside parties — security audits, vendor reviews, integrations — where the work happens in messaging and a missed thread costs money.

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
| Prepared graph vs direct provider search | Does preparing the graph in advance beat the same model searching providers directly? | **4/4 vs 1/4** tasks inside a fixed 60-call budget; 8 calls vs a 52-call oracle route on P1. Indexing alone changed nothing — the gain came only from reusable, provenance-bearing links derived ahead of time. Single seed, synthetic, deterministic scoring, no LLM judge. |
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
