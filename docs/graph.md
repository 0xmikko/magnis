# The graph

The reference for Magnis's core data structure: what an entity, facet, link, and event actually are, how schemas declare them, how the graph is indexed for search, and which graph tools an agent can call. For where the graph sits in the system, see [architecture.md](architecture.md); for building the plugins that shape it, see [plugins/](plugins/README.md).

One graph per deployment — one connected data model, partitioned by entity ownership and filtered by ACL visibility for every caller ([details](architecture.md#ownership-visibility-and-acl)).

## Anatomy

**Entity** — the base object: a person, message, meeting, company, project. Fields: `id`, `user_id` (exactly one owner, enforced at the schema level), `schema_id` + `schema_version`, optional `name`, `date` (domain timestamp — when the thing happened, not when it was ingested), `idx` (a module-defined lookup key — see Indexes), an `indexed` flag (opt-out from the embedding pipeline), plus pin/archive state.

**Facet** — a typed block of data attached to an entity, validated against a versioned schema, with provenance built in: every facet carries a source reference — source name, external id, syncing account and surface, observation time, and a **confidence score (0–100)**. Attach is idempotent by external id: re-syncing the same provider record never duplicates data.

**Canonical properties** — the single derived truth when facets disagree. Resolution is deterministic: **confidence, then recency, then source name, then external id** — same inputs, same answer, every time. Three merge strategies, declared per field: `single_aligned` (one value; conflicts are flagged, not hidden), `collection` (dedup + rank, e.g. a person's email addresses), `mergeable_object` (field-by-field resolution).

**Links** — typed edges that make the graph a graph. A link's `kind` is a string, not a core enum: modules mint the kinds their domain needs, and a manifest permission grant governs which foreign-touching kinds a module may create. Kinds in the catalog today: `works_at`, `has_email`, `sent_from` / `sent_to`, `attachment`, `belongs_to`, `watches`, `mentions`, `same_as` (speculative identity — symmetric, direction-normalized), and namespaced cross-domain kinds like `x.profile:contacts.person`.

**Events** — an append-only log of every mutation, with an actor (`user` / `system` / `agent` / `plugin`): `entity_created`, `facet_attached`, `link_added`, `canonical_resolved`, `conflict_detected`, `override_applied`, `entities_merged`, and their removal counterparts. The graph's history is never rewritten.

## Declaring a slice of the graph

A module declares its domain in versioned schema files — an entity file plus facet files whose `mappings` wire payload paths to canonical properties. Real example from the `contacts` module:

`person.json` (entity):

```json
{ "name": "Person",
  "description": "A person / contact entity owned by the contacts plugin.",
  "mergeable": true }
```

`person.profile.json` (facet — note the version and the canonical mappings):

```json
{ "version": 1,
  "mappings": [
    { "path": "first_name", "canonical": "person.first_name", "strategy": "single_aligned" },
    { "path": "username",   "canonical": "person.username",   "strategy": "single_aligned" }
  ],
  "type": "object", "additionalProperties": false,
  "properties": { "first_name": {"type":"string"}, "username": {"type":"string"}, "bio": {"type":"string"} } }
```

A collection field (`person.email.json`) maps with `"strategy": "collection"` into `person.emails`. Links need no schema file — they're created at runtime (`graph.add_link({ from_id, to_id, kind })`); a module only declares foreign-touching kinds in its manifest:

```toml
[permissions]
read  = [ "companies.company" ]    # foreign entity/facet reads
links = [ "has_email" ]            # foreign-touching link kinds this module may create
call  = [ "email.ensure_address" ] # exact foreign RPC methods
```

## Indexes — how the graph stays fast

Four layers, each for a different question shape:

1. **The `idx` lookup key.** Every entity carries a module-defined key — a chat id, a thread id, a lowercase name — backed by B-tree indexes for exact and prefix lookups. "Find the Telegram chat with this id" never scans.
2. **The property index.** A typed key/value side table (text / number / bool / timestamp columns) for structured queries over facet values without JSON scans.
3. **Full-text.** Facet text is chunked into a dedicated FTS table with a generated `tsvector` column under a GIN index — classic Postgres full-text, no external search service.
4. **Vectors.** The same chunks are embedded in parallel — see below.

## Vector indexing — the parallel pipeline

A background index worker keeps the vector store in step with the graph, at **facet** granularity:

- fetch a batch of not-yet-indexed facets (newest first) → extract indexable text → **SHA-256 content watermark** (unchanged content is never re-embedded; a model change triggers re-indexing) → chunk with a **200-token sliding window, 20-token overlap** → embed each chunk → write FTS rows, vectors, and the watermark atomically.
- **Embedding providers are pluggable:** local ONNX models (e.g. a multilingual E5 at 384 dimensions), Ollama-style local servers, or OpenAI-compatible endpoints — the in-perimeter option keeps content inside the deployment boundary. Embedding calls are metered like any other model usage.
- **Acceleration is gated, correctness is not:** raw vectors are the source of truth; when the deployment enables pgvector, a parallel `vector(dim)` column with an **HNSW cosine index** is created and backfilled, and search switches to ANN — with a loud failure (never a silent fallback) if the gate is on but the extension is missing. Without pgvector, search falls back to exact cosine scoring.

**Retrieval combines all layers:** vector and full-text results merge via **Reciprocal Rank Fusion** (k=60; weighted 0.7 vector / 0.3 FTS) at the entity level, and can then be **intersected with the graph neighborhood** of given entities — "things similar to this, near these" — where neighborhoods come from bidirectional breadth-first traversal.

## The speculative overlay — hypotheses in the same graph

Hypotheses are not a separate store: they are **candidate edges in the same links table**, gated by a status discriminator — `canonical`, `candidate`, `rejected`, `decayed`. Canonical reads filter to `canonical`, so a hypothesis is invisible to normal queries until it earns promotion.

- Confidence updates in **log-odds space**, and evidence provenance is weighted: **user 2.0, system 1.0, agent 0.5** — a human's confirmation counts four times an agent's inference.
- **Promotion:** a candidate becomes canonical when confidence reaches **p ≥ 0.8** with **≥ 2 independent confirmations**.
- **Decay:** a candidate that gathers no corroboration expires after **14 days** — marked decayed, kept for history, never silently deleted.
- Symmetric kinds like `same_as` are direction-normalized, so evidence for (A,B) and (B,A) accumulates on one candidate.

## What the agent sees

All graph tools are bounded and paginated (result caps, `{items, total, has_more}`); the overlay is read through tools only — never injected into the agent's context. How agents use these in practice — self-discovery, research, the action pipeline: [architecture.md → Agents](architecture.md#agents).

**Retrieval:**

| Tool | Purpose |
|---|---|
| `graph.search` | hybrid semantic + keyword search across entities, with type and date filters |
| `graph.find` | exact filtering — type, date window, chat, name |
| `graph.links` | traverse an entity's typed relationships |
| `graph.get` / `graph.entity.get` | one entity with its facets and a sample of its links — the zoom-in step |

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
