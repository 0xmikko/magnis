# Building a module, end to end

A **module** owns a slice of the graph — it registers schemas, reads and writes
entities/facets, exposes tools to the agent, and draws UI. Companies, contacts,
email, meetings are modules. This guide takes you from an empty folder to a
conforming, tested module: what a module is, how it is laid out, how it runs,
what it can call, how schemas register, and the one read-path gotcha that bites
everyone.

If you are building a **source** (an external connector that streams data in),
read [source.md](./source.md) instead. For the cross-cutting rules and commands
that apply to both, read [README.md](./README.md).

---

## 1. What a module is

A module runs as a **restricted V8 isolate inside the backend**. The host loads
its bundled code into the isolate and calls into it. The isolate has **no
ambient I/O** — no sockets, no filesystem, no stdio. Every graph operation goes
through the host by RPC. That restriction is the point: a module cannot touch
the outside world, so it cannot leak or misbehave against it. (Reaching an
external service is a *source*'s job, across the process boundary — see
[source.md](./source.md).)

A module is, concretely, a **decorated class handed to `definePlugin`**. You
write a class, decorate its methods to declare what they are (an agent tool, a
write tool, an internal RPC, the sync ingest), and export
`definePlugin(TheClass)`. The host instantiates it, harvests the decorated
methods into a handler table, and routes calls to them.

---

## 2. Layout

```
<module>/
  manifest.toml          # the declared contract: schemas, capabilities, surfaces, entry
  types.ts               # wire DTOs + the two schema-map interfaces (Facets, Canonical)
  schema.ts              # schema-id string constants for read/write call sites
  module/                # the backend part (V8 isolate)
    index.ts             # definePlugin(TheClass) — nothing else
    service.ts           # the class ONLY — no constants, no free functions
    helpers.ts           # free functions the service uses
    __tests__/           # whole-module tests on @magnis/testkit/module
  ui/                    # the frontend part (React) — optional
  lifecycle/             # ONLY if the module ships a migration (see §6)
  package.json
  tsconfig.json          # MUST set experimentalDecorators: true
```

`service.ts` is **the class and nothing else** — constants live in `schema.ts`,
free functions in `helpers.ts`. `types.ts` and `schema.ts` are loose root files
(one shared shape-vocabulary, one shared id-vocabulary). No single-file folders
(`types/index.ts` is wrong; `types.ts` is right). The folder name MUST equal the
manifest `id`.

> **tsconfig gotcha:** `experimentalDecorators: true` is mandatory. The module
> registry is keyed by the class prototype, which only works with legacy
> (TypeScript) decorators; without the flag the build lowers to TC39 decorators
> and the module silently registers nothing.

---

## 3. How it runs — definePlugin and the decorated class

The class takes one constructor arg, `PluginDeps`, and stores what it needs:

```ts
export class CompaniesModule {
  private readonly graph: GraphService<CompanyFacets, CompanyCanonical>;
  constructor(deps: PluginDeps<CompanyFacets, CompanyCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", { description: "List companies", params: { type: "object", /* … */ } })
  async list(params: ListParams): Promise<PaginatedResponse<CompanyListItem>> { /* … */ }
}
```

`module/index.ts` is one line:

```ts
definePlugin(CompaniesModule);
```

`definePlugin` takes the **class constructor**, not an instance. At load it
instantiates the class, reads the decorated methods back off the prototype, and
publishes a handler table keyed by `<plugin_id>.<method-suffix>` plus the
agent-facing tool definitions. The generics `<Facets, Canonical>` are inferred
from the constructor, so facet/canonical payload types are derived from the
schema-id literal at every call site.

---

## 4. What a module can call — the deps

The constructor receives `PluginDeps<Facets, Canonical> = { graph, ctx, util,
rpc }`:

- **`ctx: PluginContext`** — `{ user_id, extension_kind, extension_id }`.
  `extension_id` is the RPC-name prefix; `user_id` is stamped host-side for
  scoping, never supplied by JS.
- **`util`** — `uuid_v5(namespace, name)`, a deterministic UUIDv5 byte-equal to
  the Rust side, for deriving ids that match native handlers.
- **`rpc`** — `execute<T>(method, params?)`, cross-module RPC over the host
  router. Allowed targets are declared in the manifest
  `capabilities.rpc_calls`. (LinkedIn uses it to call
  `contacts.get_social_tracking_by_handle`, etc.)
- **`graph: GraphService<Facets, Canonical>`** — the graph API, below.

**The graph API** (payload types derived from the schema-id you pass):

- **Entities** — `create_entity`, `get_entity`/`get_entities` (batch),
  `list_entities`, `list_entities_window` (page + latest render facet + exact
  total in one statement), `list_entities_by_facet_field`,
  `search_entities_by_name`, `get_entity_full(id, { facets?, links? })`,
  `update_entity_name`, `delete_entity`, `find_by_external_id`, …
- **Facets** — `attach_facet({ entity_id, schema_id, data, external_id?,
  confidence? })` (idempotent by entity + external_id), `update_facet`,
  `list_facets_for_entity`, `list_facets_for_entities` (batch), `delete_facet`.
- **Canonical** — `get_canonical`, `list_canonical_for_entities` (batch),
  `resolve_canonical(id)` (recompute after attaching facets),
  `apply_canonical_override`.
- **Links** — `add_link`, `delete_link`, `list_links_for_entity`.
- **Batch/merge** — `apply_batch(GraphBatchInput)` (atomic
  entities+facets+links fragment — the bulk-ingest primitive), `merge_preview`,
  `merge_execute`.

**Prefer the batch reads** (`get_entities`, `list_facets_for_entities`,
`list_canonical_for_entities`) over per-row calls — an N+1 in a list handler is
a defect the tests forbid (§10).

---

## 5. Tools and RPC — declaring what a method is

Four decorators declare a method's role; the callable name is always
`<plugin_id>.<suffix>`:

| Decorator | Role | Agent-visible? | Approval |
|---|---|---|---|
| `@tool(suffix, spec)` | read tool | yes | no |
| `@writeTool(suffix, spec)` | write tool | yes | `requires_approval: true` |
| `@rpc(suffix, spec?)` | internal RPC (for other modules / UI) | no | — |
| `@syncHandler(surface?)` | the reserved `__sync__` ingest hook | no | — |

`spec.params` is a JSON schema the agent sees. The suffix is the method's public
name — `@tool("list")` → `companies.list`. Dotted suffixes make sub-namespaces:
`@tool("posts.list")` → `linkedin.posts.list`, matching the manifest
`[surfaces]`. Only `@tool`/`@writeTool` methods become agent tools; `@rpc` and
`@syncHandler` register handlers but stay off the agent surface.

---

## 6. Schemas — three separate concerns

Owning an entity/facet involves three things that are easy to conflate:

1. **`schema.ts` constants** are *only* the deduped spelling of each namespace
   string for read/write call sites — e.g.
   `export const COMPANY = "companies.company"`. They are **not** the
   registration source.
2. **Manifest `[schemas]`** is the source of truth: `[[schemas.entities]]`,
   `[[schemas.facets]]` (each with `id`, `entity_schema`, `version`, a
   `json_schema`, and canonical `mappings` tying a `facet_path` to a
   `canonical_key` with a `strategy`), and `links`. The `owns = ["<id>.*"]` glob
   MUST cover every declared id.
3. **Lifecycle registration** actually registers them. The default —
   `registerManifestSchemas()` — registers exactly what the manifest declares.
   It is a restatement of the manifest, so the **default carries no `lifecycle/`
   folder**; the host synthesizes it.

A `lifecycle/` folder appears **only** when the module needs real work: a
**partial registration** (`ctx.register({ facets: [...] })`) or a **data
migration** (`defineMigration` — transform rows already in the graph on a
version bump). Neither is common; most modules have no lifecycle folder.

To own a facet you: declare it in `[schemas]`, ensure `owns` covers it, grant
`capabilities.facet_write_prefixes`, and (if custom) register via the hook.

---

## 7. The canonical-vs-facet gotcha

The single mistake to avoid. There are two ways to read a field, and they
resolve different values:

- **Latest facet** (`list_entities_window` *with* a `facet_schema`) returns each
  row's most recent render facet, ordered by `observed_at`.
- **Canonical** (`get_canonical` / `list_canonical_for_entities`) returns the
  *merged* value resolved by strategy — `single_aligned` = confidence → recency
  — which is **not** the same as the latest facet.

If your module's truth is the merged canonical (companies: name, website,
industry), read **canonical** — call the window with **no** `facet_schema` so the
list fields come from canonical, then hydrate the page's canonical in **one
batch** (`list_canonical_for_entities`, never per-row). A latest-facet window
would silently produce a different value. If your truth is the freshest rendered
data (LinkedIn: latest post metrics), pass the `facet_schema` and read the
facet. Choose deliberately; the tests pin which one each handler uses.

---

## 8. Sync ingest — receiving from a source

A module that owns a surface implements `@syncHandler`, which registers the
reserved `<plugin_id>.__sync__` method. The host invokes it with a
`SourceEnvelope` (the thing a [source](./source.md) emitted), and the method
dispatches internally on `envelope.kind` and a `payload` discriminator (e.g.
`entity_type`). This is where external data becomes graph writes — typically via
`apply_batch` for bulk fragments. The source produces envelopes; the module's
sync handler decides how they land in the graph it owns.

---

## 9. UI — connecting the frontend to your module

The UI entry (`[entry] ui = "index.tsx"`) calls `defineModule(config)` from the
host shim, declaring `id, title, icon, entityTypes` and optional component slots
(`EntityCard`, `DetailsTabContent`, `ListItemContent`, `HeaderActions`,
`toolCallRenderers`). Component props are host-defined contracts (e.g.
`DetailsTabContent` receives `{ entityId, facets, linkedEntities }`).

**UI → backend calls go over RPC by the same `<plugin_id>.<suffix>` names** the
module exposes: `runtime.transport.rpc("companies.list", { limit, offset })` via
`useAppRuntime()`. The wire DTOs (`CompanyListItem`, `PaginatedResponse`) are
shared between `module/` and `ui/` through the root `types.ts` — the reason it
sits at the root, reachable by both parts.

`build:plugins` bundles the UI (`Bun.build`, host bare-imports like `react` and
`@magnis/host/*` externalized to host-shim URLs, hashed output + `bundle.json`
with an ETag). The backend bundles the module isolate separately. Folder layout
is invisible to both bundles as long as the manifest entries stay put — see
[README.md](./README.md) §compilation.

---

## 10. Testing

Module tests run under **vitest** (`bun run test`) with
`@magnis/testkit/module` — no database:

- **`mockGraph(overrides?)`** — a throwing Proxy: any graph op you did not
  explicitly stub throws `unexpected graph op: <name>`. That is how a test
  forbids an N+1 — leave `get_entities` / `list_facets_for_entities` unstubbed
  and a per-row read blows up.
- **`mountModule(TheClass, opts?)`** — runs the class through the real
  `definePlugin`/init path. In dispatch mode it returns `{ rpc, tools }` so you
  assert the *decorated* names and routing (`call("companies.list", …)` or the
  bare `"list"`), and that `tools` excludes `@rpc`/`@syncHandler` methods.

The minimum bar for a module: tool-shape correct, and no per-row N+1 in list
handlers (assert the exact crossing counts). Whole-module tests live in
`module/__tests__/`; a unit test for a single helper co-locates as
`helper.test.ts`.

---

## 11. Conformance checklist

A module is done only when all hold:

- [ ] `bun run typecheck` clean; `bun run lint` clean (0 warnings, no `any`).
- [ ] `tsconfig.json` sets `experimentalDecorators: true`.
- [ ] `service.ts` is the class only — no constants, no free functions.
- [ ] `schema.ts` + `types.ts` are loose root files; no single-file folders.
- [ ] `module/index.ts` is `definePlugin(...)` and nothing else.
- [ ] No `lifecycle/` folder unless it carries a real migration/partial
      registration.
- [ ] Every entity/facet is declared in `[schemas]`, covered by `owns`, and
      write-granted in `[capabilities]`.
- [ ] List handlers read the intended value (canonical vs latest facet,
      deliberately) and use batch reads — no per-row N+1.
- [ ] Whole-module tests in `module/__tests__/` on `@magnis/testkit/module`,
      green under `bun run test`.
