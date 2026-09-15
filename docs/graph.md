# The graph

The reference for Magnis's core data structure: what an entity, a dictionary, a link and an event actually are, how a module declares its slice, how the graph is indexed for search, and which graph tools an agent can call. For where the graph sits in the system, see [architecture.md](architecture.md); for building the plugins that shape it, see [plugins/](plugins/README.md).

One graph per deployment — one connected data model, partitioned by entity ownership. Ownership isolation is enforced today; ACL-based sharing beyond the owner is the designed mechanism, not yet the shipped one ([details](architecture.md#ownership-visibility-and-acl)).

## Anatomy

It is a **property graph**: nodes and edges each carry a dictionary, and identity is resolved by an anchor. Two rules explain almost everything else.

> **A node has ONE writer. An edge has MANY observers.**

**Entity** — the base object: a person, message, meeting, company, project. Fields: `id`, `user_id` (exactly one owner, enforced at the schema level), `schema_id` + `schema_version`, optional `name`, `date` (domain timestamp — when the thing happened, not when it was ingested), `idx` (a module-defined lookup key — see Indexes), an `indexed` flag (opt-out from the embedding pipeline), pin/archive state, plus the three that make it a property graph:

- **`properties`** — the node's dictionary, a flat JSON map of what the module knows about it. There are TWO write paths and they differ on purpose. A **sync** (`apply_batch`) REPLACES the dictionary wholesale — the fields as last synced — so a re-sync of a provider record cannot leave a node half-updated. A **curated edit** (`graph.update_properties`) MERGES the top-level keys it is given, and an explicit `null` removes one: a human fixing a phone number should not have to resend the person. "One node, one writer" is about WHO writes, not how much: two sources never contend for one dictionary, because each source's view lives on its own node.
- **`anchor`** — the node's identity, and the ONE resolver. An issuer key (`tg:user:501`, `email:address:ann@x.com`) when something external names it, otherwise `local:<id>`. Claimed through the `entity_anchors` chokepoint, which is what makes a re-sync attach to the existing node instead of minting a duplicate. Claiming an issuer key demotes an earlier `local:` claim to an alias; the alias keeps resolving.
- **`source`** — node-level provenance stamped by the HOST, not by the plugin: which source and account observed this dictionary, through which surface, and when. A plugin cannot forge it.

**Links** — typed edges that make the graph a graph. A kind names a RELATION, not a pair of types: bare kinds are host-owned entries in the relation registry (`backend/src/services/graph/link_kinds.rs`), and a module references one rather than claiming it, declaring the grant in its manifest. Endpoints are constrained by the ROLES a module's entity descriptors declare (`content`, `container`, `identity_channel`, `hub`, `event`, `file_object`), never by schema id.

Relations in use include `identity` (hub → its channels: an address, an account, a profile), `authored_by` (content → the identity that produced it), `sent_to`, `in_chat`, `observed_in`, `observed_participant`, `attendee`, `works_at`, `references`, `mentions`, `reply_to`, and `same_as` (speculative identity — symmetric, direction-normalized). A kind a module genuinely owns still carries its namespace prefix (`file.attachment`, `projects.belongs_to`) and is validated by prefix.

An edge carries a **dictionary** of its own (`metadata`): the per-pair facts that belong to neither endpoint — an invite's display name on `attendee`, an unread count on `observed_in`. Its domain keys are NOT merged across observers: a sync REFRESHES them (fields as last synced, same contract as a node's), and `add_link` on an existing edge leaves them alone entirely, which is what keeps re-ingest idempotent.

Exactly one key behaves differently, and it is the host's: `sources[]`. The host stamps it — a plugin cannot supply one — and it UNIONS, the incoming stamp replacing its own (source, account) entry while every other observer's survives, so corroboration accumulates instead of overwriting. Because it is the provenance record, a query may not read it: an `edge` clause naming `sources`, or any path beneath it, is rejected by the resolver.

Roles matter more than they look. After the accounts migration a chat's participant is a `telegram.account` (role `identity_channel`), not the `contacts.person` hub behind it: the hub reaches the account over `identity`, and the account sits `observed_participant` in the chat. A predicate written against the hub would match nothing.

**Events** — an append-only log of every mutation, with an actor (`user` / `system` / `agent` / `plugin`): `entity_created`, `entity_properties_updated`, `link_added`, `link_status_changed`, `override_applied`, `entities_merged`, and their removal counterparts. The graph's history is never rewritten.

**Merging two nodes.** The merged truth is the dictionary UNION: the survivor's value wins, the retired value fills a gap, and a key both hubs claim with DIFFERENT values is a conflict the merge refuses to guess (`phones` is the one exemption — it unions mechanically) — it aborts, naming the keys, having written nothing. The operator answers with an override, which lands straight in the survivor's dictionary. The retired node's anchor survives as an alias of the survivor, so the next re-sync of the absorbed identity resolves to the right node.

## Declaring a slice of the graph

A module declares its domain in two places: **entity schema files** (what nodes it owns) and **`search.toml`** (which keys of their dictionaries are searchable). There are no per-block schema files and no field-to-property mappings — a dictionary key is just a key.

`schemas/person.json` — the entity, its roles, and whether two of them may be merged:

```json
{ "name": "Person",
  "description": "A person / contact entity owned by the contacts plugin.",
  "mergeable": true,
  "roles": ["hub"] }
```

`search.toml` — the searchable surface. `kind` types the operators a key accepts; `column` reads an indexed entity column, `path` a dictionary key; `embed` marks what the indexer feeds the embedding:

```toml
entity = "contacts.person"
tools  = "contacts"                      # generated names: contacts.search / .list / .predicate

default_order = [ { key = "name", dir = "asc", nulls = "last" } ]

[[field]]
key = "name"
kind = "text"
column = "name"

[[field]]
key = "description"
kind = "text"
path = "description"
embed = "body"

[[collection]]
key = "phone"
path = "phones"
element = [                              # conditions apply within ONE element
  { key = "phone",      kind = "text" },
  { key = "type",       kind = "text" },
  { key = "is_primary", kind = "boolean" },
]
```

Declare only what the entity OWNS. Facts that live on replicas the hub reaches over `identity`, or on shared nodes it links to, are link conditions — a hub field for them would silently match curated rows only.

Links need no schema file: they are created at runtime (`graph.add_link({ from_id, to_id, kind })`). A module declares only what it touches across a boundary:

```toml
[permissions]
read  = [ "companies.company" ]                          # foreign entity reads
links = [ "identity", "same_as" ]                        # foreign-touching kinds it may create
call  = [ "email.ensure_address", "email.ensure_addresses" ]  # exact foreign RPC methods
```

## Indexes — how the graph stays fast

Four layers, each for a different question shape:

1. **The `idx` lookup key.** Every entity carries a module-defined key — a chat id, a thread id, a lowercase name — backed by B-tree indexes for exact and prefix lookups. "Find the Telegram chat with this id" never scans.
2. **The anchor.** `entity_anchors` is a unique index per (user, anchor): identity resolution is a single indexed lookup, not a search.
3. **Full-text.** The text a declaration marks `embed` is chunked into a dedicated FTS table with a generated `tsvector` column under a GIN index — classic Postgres full-text, no external search service.
4. **Vectors.** The same chunks are embedded in parallel — see below.

## Vector indexing — the parallel pipeline

A background index worker keeps the vector store in step with the graph. The indexed unit is the **entity**: one node, one watermark, one lane.

- Walk the entities whose schema a declaration covers → extract text from the keys that declaration marks `embed` → **content watermark** over the declaration, the entity's name and its dictionary (unchanged content is never re-embedded; a changed declaration or a changed model triggers re-indexing) → chunk with a **200-word sliding window, 20-word overlap** → embed each chunk → write FTS rows, vectors and the watermark atomically.
- The declaration is the single source of truth for BOTH halves: what the indexer embeds and what search can filter come from the same file, so the two cannot drift.
- **Embedding providers are pluggable:** local ONNX models (e.g. a multilingual E5 at 384 dimensions), Ollama-style local servers (`OLLAMA_BASE_URL`), or OpenAI's embeddings endpoint — the in-perimeter option keeps content inside the deployment boundary. OpenAI calls are metered like any other model usage; the local providers are not.
- **Acceleration is gated, correctness is not:** raw vectors are the source of truth; when the deployment enables pgvector, a parallel `vector(dim)` column with an **HNSW cosine index** is created and backfilled, and search switches to ANN — with a loud failure (never a silent fallback) if the gate is on but the extension is missing. Without pgvector, search falls back to exact cosine scoring.

**Retrieval combines all layers:** vector and full-text results merge via **Reciprocal Rank Fusion** (k=60; weighted 0.7 vector / 0.3 FTS) at the entity level, and can then be **intersected with the graph neighborhood** of given entities — "things similar to this, near these" — where neighborhoods come from bidirectional breadth-first traversal.

## The speculative overlay — hypotheses in the same graph

Hypotheses are not a separate store: they are **candidate edges in the same links table**, gated by a status discriminator — `canonical`, `candidate`, `rejected`, `decayed`. Canonical reads filter to `canonical`, so a hypothesis is invisible to normal queries until it earns promotion.

- Confidence updates in **log-odds space**, and evidence provenance is weighted: **user 2.0, system 1.0, agent 0.5** — a human's confirmation counts four times an agent's inference.
- **Promotion:** a candidate becomes canonical when confidence reaches **p ≥ 0.8** with **≥ 2 independent confirmations**. One very confident observation is never enough.
- **Decay:** a candidate that gathers no corroboration expires — marked decayed, kept for history, never silently deleted.
- Symmetric kinds like `same_as` are direction-normalized, so evidence for (A,B) and (B,A) accumulates on one candidate rather than on two half-convinced ones.
- Posting a candidate requires both endpoints to exist AND to belong to the caller; the refusal is deliberately identical for "does not exist" and "is not yours", so the error cannot be used to probe another workspace.

## What the agent sees

All graph tools are bounded and paginated (result caps, `{items, total, has_more}`); the overlay is read through tools only — never injected into the agent's context. How agents use these in practice — self-discovery, research, the action pipeline: [architecture.md → Agents](architecture.md#agents).

**Core retrieval:**

| Tool | Purpose |
|---|---|
| `graph.search` | hybrid semantic + keyword search across entities, with type and date filters |
| `graph.find` | exact filtering — type, date window, chat, name |
| `graph.links` | traverse an entity's typed relationships |
| `graph.get` / `graph.entity.get` | one entity with its dictionary and a sample of its links — the zoom-in step |
| `graph.relations` | the relation vocabulary: every registered kind with its endpoint roles and owner |

**Generated per declaration** — a module that ships a `search.toml` gets three tools under its declared prefix, and no hand-written SQL:

| Tool | Purpose |
|---|---|
| `<prefix>.search` | conditions per declared key, link conditions, ordering, keyset paging. The parameters ARE the searchable keys |
| `<prefix>.list` | walk the entity in its declared default order; equality filters only |
| `<prefix>.predicate` | describe a SET — returns `{about, where}` (plus `explain` when the caller supplied one) to drop into another entity's `linked` condition. Executes nothing, stores nothing |

A `linked` condition names a `kind`, a mode (`to`, `none` for the exact complement, `exists`), an optional `edge` clause over the edge's own dictionary, and an optional target described by a predicate. Composition is **one level deep** — predicates compose, they do not recurse.

`means` is the semantic condition: the phrase is embedded and resolved BEFORE the SQL runs, so the structural filter and the meaning meet inside one statement instead of one filtering the other's output in memory.

**Memory and hypotheses (the `memory` module):**

| Tool | Purpose |
|---|---|
| `memory.save` / `memory.forget` | write / archive a durable cross-session memory record |
| `memory.search` / `memory.list` | find and enumerate active memories |
| `memory.confirm` / `memory.reject` | human verdicts on a memory (approval-gated) |
| `memory.hypothesize` | propose a candidate link between two entities (e.g. `same_as`) |
| `memory.add_evidence` | add supporting or refuting evidence — the log-odds update, with auto-promotion |
| `memory.candidates` | list the working hypotheses anchored on an entity |
| `memory.diagnostics` | memory-system stats: counts, average confidence, last consolidation |
