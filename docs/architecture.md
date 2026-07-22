# Architecture

How this catalog relates to the Magnis core, and the model a plugin author builds against. For the end-to-end authoring guides, see [docs/plugins/](plugins/README.md).

## The split

Magnis is two halves:

- **The core (closed)** — a Rust knowledge-graph engine over Postgres, the agent runtime, event triggers, and the approval layer. It ships as a desktop app (with a real Postgres server compiled into the binary) or an on-prem server.
- **This catalog (public)** — everything domain-specific: source connectors, domain modules, and the SDKs they build against. All TypeScript, run by bun. The core consumes this repo as a pinned dependency; `main` is the published catalog.

The same split as an editor and its extensions: the host is private, the ecosystem is public, and the contract between them is the stable surface.

```mermaid
flowchart LR
    subgraph core [Core - closed]
        graph[Knowledge graph / Postgres]
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
    agent --> graph
    triggers --> agent
```

## The graph model

Everything a plugin reads or writes lands in one graph:

- **entities** — people, messages, meetings, companies, projects
- **facets** — typed data attached to an entity, with provenance
- **links** — relationships between entities ("magnets")
- **events** — append-only mutation history
- **canonical properties** — resolved truth when several sources disagree

Provenance is load-bearing: every fact traces back to the message, meeting, or file it came from.

## Two plugin kinds, two runtimes

**Source connectors** (`plugins/sources/`) pull data from an external service. Each runs as a **separate bun process the core spawns**, speaking an MCP-style stdio protocol — line-delimited JSON-RPC. A source owns its credentials and auth ceremony (OAuth2, phone code, API key), serves cursored sync (`magnis.sync.fetch` → envelopes + an opaque JSON cursor), can push live updates, and exposes an action table (`magnis.execute`: send, backfill, …). The full wire contract lives in [docs/plugins/source.md](plugins/source.md); the SDK is `@magnis/connector-sdk`. Because the wire is the contract, the host cannot tell one implementation from another — that's the portability story: one runtime, no per-platform binaries.

**Domain modules** (`plugins/modules/`) shape ingested data into the graph and serve the UI. They run **inside the core, in sandboxed V8 isolates**, with a capability manifest declaring what they own (`owns` namespaces), which operations they may call, and which surfaces they wire to. The SDK is `@magnis/plugin-sdk`; the host surface a module compiles against is typed by `@magnis/host-stubs`.

## The sync flow

```
module (intent) → command → source → envelope(s) + cursor → module → graph
```

Modules declare what they want kept in sync; sources talk to the provider; envelopes flow back and are shaped into entities, facets, and links. Cursors are opaque JSON, round-tripped verbatim. Rate limits surface as typed errors with `retry_after` — a connector never hangs silently.

## The agent loop

Agents operate on the graph, not on raw provider data: read context, call tools, and pass every write through the **approval layer** — a proposed action becomes a pending approval the user confirms with one click. Triggers close the loop: they watch the graph and start agent episodes when something changes ("this deal went quiet").

## Trust boundaries

- A source process owns its provider credentials; the core never sees them.
- A module sees only what its manifest capabilities grant.
- Every agent write action stops at the approval layer.
- Everything — graph, models, plugins — can run inside the user's perimeter.
