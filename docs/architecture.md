# Architecture

The whole system, top-down: what the core does, what this catalog adds, and the model a plugin author builds against. Concepts and data flows only — the core's implementation is closed; the contracts here are the stable surface. For hands-on authoring, see [docs/plugins/](plugins/README.md).

## System overview

Magnis is two halves plus a shell:

- **The core (closed)** — a Rust knowledge-graph engine over Postgres, the agent runtime, event triggers, semantic + graph search, and the approval layer.
- **This catalog (public)** — everything domain-specific: source connectors, domain modules, and the SDKs they build against. All TypeScript, run by bun. The core consumes the catalog as a pinned dependency.
- **Deployment shells** — a desktop app with a real Postgres server compiled into the binary (zero-dependency install), or a self-hosted server against your own Postgres.

```mermaid
flowchart LR
    subgraph core [Core - closed]
        graph[Knowledge graph / Postgres]
        search[Search: graph + semantic]
        agent[Agent runtime + approvals]
        triggers[Event triggers]
    end
    subgraph catalog [This repo - public]
        modules[Domain modules - V8 isolates]
        sources[Source connectors - stdio processes]
        sdks[SDKs]
    end
    sources -- envelopes + cursors --> modules
    modules --> graph
    search --> graph
    agent --> search
    triggers --> agent
```

## The graph

Everything lands in one graph:

- **entities** — people, messages, meetings, companies, projects
- **facets** — typed data attached to an entity, with provenance
- **links** — relationships between entities ("magnets")
- **events** — append-only mutation history
- **canonical properties** — resolved truth when several sources disagree

Provenance is load-bearing: every fact traces back to the message, meeting, or file it came from. Nothing in the graph is a black-box assertion.

## Ingestion and identity

```
module (intent) → command → source → envelope(s) + cursor → module → graph
```

Modules declare what they want kept in sync; sources talk to the provider (poll or live push); envelopes flow back and are shaped into entities, facets, and links. Cursors are opaque JSON, round-tripped verbatim. Rate limits surface as typed errors with `retry_after` — a connector never hangs silently.

**Identity resolution** is where the graph earns its keep: the same person arriving via Gmail, Telegram, and a meeting becomes *one* entity with a merged history. Candidate links start as hypotheses, accumulate evidence across sessions, and are promoted only past a confidence threshold with multiple confirmations — stale hypotheses decay. This mechanism is what our published evals measure ([evals/](../evals/README.md)): cross-session entity-resolution recall of 0.63–0.80, against a memoryless baseline that is structurally 0.

## Search

Agents and the UI query the graph, not raw provider data. Retrieval is hybrid:

- **structured graph queries** — typed traversal over entities, facets, and links ("open deals involving people from Tuesday's meeting");
- **semantic search** — embedding-based retrieval over message and document content, with embeddings computed locally (any OpenAI-compatible/Ollama-style endpoint) so content never has to leave the perimeter.

The combination is deliberate: multi-hop questions resolve through the graph, fuzzy recall resolves through embeddings, and both return provenance.

## Agents

The agent runtime drives tool-calling models — Claude primarily, with any OpenAI-compatible endpoint supported, down to fully local models for on-prem installs. Agents read through search, act through tools that plugins expose, and write through one gate:

**Every write action stops at a one-click approval.** A proposed send or mutation becomes a pending approval the user confirms or denies; there is no autonomous-write mode.

**The speculative overlay.** Agent memory rides the same graph as an overlay of hypotheses. When an agent suspects something the data never states outright — two contacts are the same person, a commitment was made in passing, a deal is drifting — it records a hypothesis rather than a fact. Hypotheses accumulate evidence across sessions and channels; past a confidence threshold with multiple independent confirmations they are promoted into the graph, and stale ones decay instead of fossilizing. Because the overlay lives in the graph, not in a prompt, memory written by one agent — or one model — is readable by any other.

**Reasoning, not just retrieval.** The typed, provenance-carrying graph is what lets agents do analytical work rather than lookup: assemble an account brief from every channel with a citation on every claim; find the hidden blocker of a deal (the procurement email, not the product thread); reconstruct who promised what to whom after a lost thread; digest which conversations are going quiet and prepare the follow-ups. Each of these is a graph traversal plus judgment — none is answerable from a single inbox.

## Triggers

Triggers make the graph watchful: a watch-list plus a gate condition plus an action. When something changes — a key thread goes quiet, a counterpart replies, a deadline approaches — the trigger fires an agent episode that prepares the response before you've noticed. Same approval gate on the way out.

## Multi-user

Current state, stated plainly:

- one server, one database, many users;
- authentication with an open mode (single-user local installs) and a password mode (shared servers);
- **strict per-user data isolation** — every entity and source account is scoped to its user;
- an admin role for deployment ownership.

**Team access controls — sharing, roles, ACL — are planned**, and are being shaped by our first design-partner deployment rather than designed in a vacuum.

## Deployment modes

| Mode | Database | Models |
|---|---|---|
| Desktop app | real Postgres compiled into the binary | cloud Claude, any OpenAI-compatible endpoint, or fully local |
| Self-hosted server | your Postgres (Docker / VPC / bare metal) | same — including air-gapped local-only |

No mandatory third-party API: the graph, the search embeddings, and the models can all run inside the user's perimeter.

## Trust boundaries

- A source process owns its provider credentials; the core never sees them.
- A module sees only what its capability manifest grants (V8 isolate, `owns` namespaces, operation grants).
- Every agent write action stops at the approval layer.
- Everything — graph, embeddings, models, plugins — can run inside the user's perimeter.
